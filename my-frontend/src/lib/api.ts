/**
 * lib/api.ts
 *
 * What:    The entire HTTP layer for this app.
 *          - One configured Axios instance (baseURL, headers, credentials)
 *          - Two interceptors (attach token, auto-refresh on 401)
 *          - Named API functions grouped by resource
 *
 * Why here: Every API call lives in this file. Components and hooks never
 *           call axios directly — they import from here. This means one
 *           place to change auth logic, base URL, or error handling.
 *
 * Django analogy: This is like Django's views + urls combined for the client.
 *           Just as Django views know how to handle requests, these functions
 *           know how to make requests to the backend.
 *
 * How to expand: Add new API groups at the bottom following the same pattern.
 *           Each group should mirror one Django app's endpoints.
 *
 * Exports: axiosInstance, authApi, workspaceApi, pageApi, blockApi, aiApi
 */

import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  clearSessionCookie,
} from './auth';
import type {
  User,
  Workspace,
  Page,
  Block,
  AuthTokens,
  RefreshResponse,
  PaginatedResponse,
  LoginPayload,
  RegisterPayload,
  CreateWorkspacePayload,
  UpdateWorkspacePayload,
  CreatePagePayload,
  UpdatePagePayload,
  CreateBlockPayload,
  UpdateBlockPayload,
  ReorderBlocksPayload,
  AiActionPayload,
  AiChatPayload,
  AiUsageSummary,
  ApiError,
} from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Axios instance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The base URL comes from an environment variable.
 * In development: set NEXT_PUBLIC_API_URL=http://localhost:8000 in .env.local
 * In production:  set NEXT_PUBLIC_API_URL=https://your-api.com in your host
 *
 * withCredentials: true tells the browser to include cookies on every request.
 * This is what makes the httpOnly refresh token cookie get sent to Django.
 */
export const axiosInstance: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send httpOnly cookies automatically
});

// ─────────────────────────────────────────────────────────────────────────────
// Token refresh queue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * isRefreshing prevents multiple simultaneous token refresh calls.
 * If 3 requests fail with 401 at the same time, only the first one triggers
 * a refresh. The other 2 wait in the queue and replay after the refresh.
 */
let isRefreshing = false;

/**
 * Each item in the queue is a pair of functions:
 *   resolve(newToken) — replay the request with the new token
 *   reject(error)     — fail the request if refresh fails
 */
type QueueItem = {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
};
let failedQueue: QueueItem[] = [];

/** Drains the queue: either replays all waiting requests or fails them all */
function processQueue(error: unknown, token: string | null): void {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else if (token) {
      resolve(token);
    }
  });
  failedQueue = [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Request interceptor — attach the Bearer token
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs before every outgoing request.
 * If we have an access token in memory, add it to the Authorization header.
 * If not, the request goes without auth (will get 401 if the endpoint requires it).
 */
axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: unknown) => Promise.reject(error),
);

// ─────────────────────────────────────────────────────────────────────────────
// Response interceptor — auto-refresh on 401
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs after every response.
 * On success (2xx): pass through unchanged.
 * On 401 error:
 *   1. If not already refreshing, call /api/auth/token/refresh/
 *   2. On success: store new token, replay original request
 *   3. On failure: clear everything, redirect to /login
 */
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only intercept 401 errors, and only retry once (_retry flag prevents loops)
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(parseApiError(error));
    }

    // If a refresh is already in progress, queue this request
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((newToken) => {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return axiosInstance(originalRequest);
      });
    }

    // This request is the first to get a 401 — kick off a refresh
    originalRequest._retry = true;
    isRefreshing = true;

    try {
      // Use a plain axios call (not our instance) to avoid interceptor loops
      const { data } = await axios.post<RefreshResponse>(
        // Backend URL: /api/auth/refresh/  (NOT /api/auth/token/refresh/)
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/api/auth/refresh/`,
        {},
        { withCredentials: true }, // sends the httpOnly refresh cookie
      );

      const newToken = data.access;
      setAccessToken(newToken);
      processQueue(null, newToken);

      // Replay the original failed request with the new token
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return axiosInstance(originalRequest);
    } catch (refreshError) {
      // Refresh failed — session is truly expired
      processQueue(refreshError, null);
      clearAccessToken();
      clearSessionCookie();
      // Redirect to login (works in both client and server context)
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Error parser — converts Axios errors into our ApiError shape
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a raw Axios error into the ApiError interface from types/index.ts.
 * DRF can return errors as { detail: 'msg' } or { field: ['msg'] } or
 * just a string. This normalises all of them.
 */
function parseApiError(error: AxiosError): ApiError {
  const statusCode = error.response?.status ?? 0;
  const data = error.response?.data as Record<string, unknown> | undefined;

  if (!data) {
    return { message: error.message ?? 'Network error', statusCode };
  }

  // DRF generic non-field errors — checks both 'detail' and 'error' keys
  // Django REST Framework uses 'detail', but custom views often use 'error'
  const genericMessage =
    typeof data.detail === 'string' ? data.detail :
    typeof data.error === 'string'  ? data.error  : null;

  if (genericMessage) {
    return { message: genericMessage, detail: genericMessage, statusCode };
  }

  // DRF field-level validation errors: { email: ['already exists'] }
  const fields: Record<string, string[]> = {};
  let firstMessage = 'An error occurred';

  Object.entries(data).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      fields[key] = value as string[];
      if (firstMessage === 'An error occurred' && value.length > 0) {
        firstMessage = `${key}: ${value[0]}`;
      }
    }
  });

  return { message: firstMessage, fields, statusCode };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BackendAuthResponse — the ACTUAL shape Django returns for login/register.
 * Backend returns a flat object: { user, access, refresh }
 * We map this internally to { user, tokens } so the rest of the app has
 * a consistent shape regardless of what the backend sends.
 */
interface BackendAuthResponse {
  user: User;
  access: string;    // JWT access token
  refresh: string;   // JWT refresh token
}

/**
 * authApi — mirrors Django's /api/auth/ endpoints
 * login and register both call the backend and normalise the flat response
 * into the { user, tokens: { access, refresh } } shape used throughout the app.
 */
export const authApi = {
  /** POST /api/auth/login/ — returns normalised { user, tokens } */
  login: async (payload: LoginPayload): Promise<{ tokens: AuthTokens; user: User }> => {
    const { data } = await axiosInstance.post<BackendAuthResponse>(
      '/api/auth/login/',
      payload,
    );
    // Map flat backend response to nested internal shape
    return {
      user: data.user,
      tokens: { access: data.access, refresh: data.refresh },
    };
  },

  /** POST /api/auth/register/ — creates account, returns normalised { user, tokens } */
  register: async (payload: RegisterPayload): Promise<{ tokens: AuthTokens; user: User }> => {
    const { data } = await axiosInstance.post<BackendAuthResponse>(
      '/api/auth/register/',
      payload,
    );
    // Map flat backend response to nested internal shape
    return {
      user: data.user,
      tokens: { access: data.access, refresh: data.refresh },
    };
  },

  /** POST /api/auth/logout/ — backend clears the httpOnly cookie */
  logout: async (): Promise<void> => {
    await axiosInstance.post('/api/auth/logout/');
  },

  /** GET /api/auth/me/ — returns the currently authenticated user */
  getMe: async (): Promise<User> => {
    const { data } = await axiosInstance.get<User>('/api/auth/me/');
    return data;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// WORKSPACE API
// ─────────────────────────────────────────────────────────────────────────────

/** workspaceApi — mirrors Django's /api/workspaces/ endpoints */
export const workspaceApi = {
  /** GET /api/workspaces/ — list all workspaces the current user has access to */
  list: async (): Promise<PaginatedResponse<Workspace>> => {
    const { data } = await axiosInstance.get<PaginatedResponse<Workspace>>('/api/workspaces/');
    return data;
  },

  /** POST /api/workspaces/ — create a new workspace */
  create: async (payload: CreateWorkspacePayload): Promise<Workspace> => {
    const { data } = await axiosInstance.post<Workspace>('/api/workspaces/', payload);
    return data;
  },

  /** GET /api/workspaces/:id/ — fetch a single workspace by ID */
  get: async (id: string): Promise<Workspace> => {
    const { data } = await axiosInstance.get<Workspace>(`/api/workspaces/${id}/`);
    return data;
  },

  /** PATCH /api/workspaces/:id/ — update workspace fields (partial update) */
  update: async (id: string, payload: UpdateWorkspacePayload): Promise<Workspace> => {
    const { data } = await axiosInstance.patch<Workspace>(`/api/workspaces/${id}/`, payload);
    return data;
  },

  /** DELETE /api/workspaces/:id/ — soft delete (sets is_deleted = true) */
  delete: async (id: string): Promise<void> => {
    await axiosInstance.delete(`/api/workspaces/${id}/`);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PAGE API
// ─────────────────────────────────────────────────────────────────────────────

/** pageApi — mirrors Django's /api/pages/ endpoints */
export const pageApi = {
  /**
   * GET /api/pages/?workspace=<id> — list all pages in a workspace (for sidebar).
   *
   * BUG FIX (was /api/workspaces/:id/pages/):
   *   The workspace-nested URL returns PageTreeSerializer (nested tree, no 'parent' field).
   *   The frontend's flat-to-tree algorithm in PageTree.tsx requires a flat list with 'parent'.
   *   Switching to /api/pages/?workspace=<id> returns PageListSerializer (flat, with 'parent').
   *
   * The backend has pagination_class = None on PageListCreateView, so this always
   * returns a flat array (never a paginated {count, results} envelope).
   */
  list: async (workspaceId: string): Promise<Page[]> => {
    const { data } = await axiosInstance.get<Page[]>(
      '/api/pages/',
      { params: { workspace: workspaceId } },
    );
    return Array.isArray(data) ? data : (data as PaginatedResponse<Page>).results ?? [];
  },

  /**
   * POST /api/pages/ — create a page.
   *
   * WHY /api/pages/ and NOT /api/workspaces/:id/pages/:
   *   The workspace-nested route only supports GET (returns the sidebar tree).
   *   POST goes to the flat /api/pages/ endpoint via PageListCreateView.
   *   PageCreateSerializer requires 'workspace' UUID in the request body.
   */
  create: async (workspaceId: string, payload: CreatePagePayload): Promise<Page> => {
    const { data } = await axiosInstance.post<Page>(
      '/api/pages/',
      { ...payload, workspace: workspaceId }, // backend requires workspace in body
    );
    return data;
  },

  /** GET /api/pages/:id/ — fetch a single page (includes its blocks) */
  get: async (id: string): Promise<Page> => {
    const { data } = await axiosInstance.get<Page>(`/api/pages/${id}/`);
    return data;
  },

  /** PATCH /api/pages/:id/ — update page metadata (title, icon, etc.) */
  update: async (id: string, payload: UpdatePagePayload): Promise<Page> => {
    const { data } = await axiosInstance.patch<Page>(`/api/pages/${id}/`, payload);
    return data;
  },

  /** DELETE /api/pages/:id/ — soft delete */
  delete: async (id: string): Promise<void> => {
    await axiosInstance.delete(`/api/pages/${id}/`);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * blockApi — mirrors Django's /api/blocks/ endpoints.
 *
 * WHY /api/blocks/ and NOT /api/pages/:id/blocks/:
 *   There is no nested page-blocks URL in the backend.
 *   All block operations go through /api/blocks/ with a ?page= query param.
 *
 *   Endpoint map (from Apps/blocks/urls.py):
 *     GET    /api/blocks/?page={id}  → list blocks for a page
 *     POST   /api/blocks/            → create a block (page id in body)
 *     PATCH  /api/blocks/{id}/       → update a block
 *     DELETE /api/blocks/{id}/       → soft delete
 *     POST   /api/blocks/reorder/    → batch reorder
 */
export const blockApi = {
  /**
   * GET /api/blocks/?page={pageId} — list all blocks for a page.
   * Backend returns a paginated response; we unwrap 'results' here.
   */
  list: async (pageId: string): Promise<Block[]> => {
    const { data } = await axiosInstance.get<PaginatedResponse<Block> | Block[]>(
      '/api/blocks/',
      { params: { page: pageId } },
    );
    // Handle both paginated ({results:[...]}) and flat ([...]) shapes
    return Array.isArray(data) ? data : (data.results ?? []);
  },

  /**
   * POST /api/blocks/ — create a new block.
   * 'page' UUID must be in the request body (BlockCreateSerializer requires it).
   */
  create: async (pageId: string, payload: CreateBlockPayload): Promise<Block> => {
    const { data } = await axiosInstance.post<Block>(
      '/api/blocks/',
      { ...payload, page: pageId }, // backend requires page in body
    );
    return data;
  },

  /** PATCH /api/blocks/:id/ — update a block's content or order */
  update: async (id: string, payload: UpdateBlockPayload): Promise<Block> => {
    const { data } = await axiosInstance.patch<Block>(`/api/blocks/${id}/`, payload);
    return data;
  },

  /** DELETE /api/blocks/:id/ — soft delete */
  delete: async (id: string): Promise<void> => {
    await axiosInstance.delete(`/api/blocks/${id}/`);
  },

  /** POST /api/blocks/reorder/ — update order of multiple blocks at once */
  reorder: async (payload: ReorderBlocksPayload): Promise<void> => {
    await axiosInstance.post('/api/blocks/reorder/', payload);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// AI API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * aiApi — mirrors Django's /api/ai/ endpoints
 *
 * Endpoint map:
 *   POST /api/ai/action/  → run a predefined action on text or a page
 *   POST /api/ai/chat/    → free-form conversation, optionally grounded in a page
 *
 * WHERE TO ADD NEW ACTIONS:
 *   Backend: Apps/ai_agent/services.py → SYSTEM_PROMPTS + ACTION_MODELS
 *   Frontend panel: src/components/ai/AiPanel.tsx → QUICK_ACTIONS array
 *
 * WHERE TO SWITCH AI PROVIDERS:
 *   Backend: config/settings/base.py → AI_PROVIDER + AI_MODELS
 *   Provider code: Apps/ai_agent/services.py → PROVIDERS dict
 */
export const aiApi = {
  /**
   * POST /api/ai/action/
   * Runs a predefined action ('summarize', 'expand', 'fix_grammar', etc.)
   * on given text or on a page fetched by the backend.
   */
  action: async (payload: AiActionPayload): Promise<{ result: string }> => {
    const { data } = await axiosInstance.post<{ result: string }>('/api/ai/action/', payload);
    return data;
  },

  /**
   * POST /api/ai/chat/
   * Free-form conversation. Send the full message history each time.
   * Optionally pass page_id so the backend uses the page as context.
   */
  chat: async (payload: AiChatPayload): Promise<{ reply: string }> => {
    const { data } = await axiosInstance.post<{ reply: string }>('/api/ai/chat/', payload);
    return data;
  },

  /**
   * GET /api/ai/usage/
   * Returns token usage summary for the current user.
   * Used by the sidebar footer to show "X calls this month".
   */
  getUsage: async (): Promise<AiUsageSummary> => {
    const { data } = await axiosInstance.get<AiUsageSummary>('/api/ai/usage/');
    return data;
  },
};
