/**
 * types/index.ts
 *
 * What:    Single source of truth for all TypeScript types in this app.
 *          Every interface mirrors a Django model. Every enum mirrors a
 *          Django choices field. Import from here — never define types inline.
 *
 * Analogy: This is your models.py, but for the frontend. Just as Django
 *          models define what data looks like in the database, these types
 *          define what data looks like as it travels over the API.
 *
 * How to expand: When the backend adds a new model field, add it here first,
 *          then TypeScript will tell you every place in the frontend that
 *          needs to handle it (red squiggles = your checklist).
 */

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS — mirror Django's choices fields exactly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How sensitive a piece of content is.
 * 'standard'  — plain text, no extra protection
 * 'private'   — encrypted with the workspace key
 * 'inherited' — uses whatever the parent page/workspace chose
 * 'browser'   — encrypted in the browser; server never sees plaintext
 */
export type EncTier = 'standard' | 'private' | 'inherited' | 'browser';

/**
 * How much the AI is allowed to see.
 * 'full'         — AI can read everything
 * 'metadata'     — AI sees titles/dates only, not content
 * 'temp_decrypt' — AI can decrypt temporarily for one request, then forgets
 * 'disabled'     — AI cannot touch this content
 */
export type AiConsent = 'full' | 'metadata' | 'temp_decrypt' | 'disabled';

/**
 * The visual/functional category of a page.
 * This controls the default editor layout and available block types.
 */
export type PageType =
  | 'note'
  | 'secure'
  | 'template'
  | 'client'
  | 'project'
  | 'invoice'
  | 'expense'
  | 'dashboard';

/**
 * How the page is laid out.
 * 'document' — linear top-to-bottom editor (like Notion)
 * 'canvas'   — free-form spatial layout (like FigJam)
 */
export type ViewMode = 'document' | 'canvas';

/**
 * Every block type the editor supports.
 * Each type has its own content shape — see the Block interface below.
 * To add a new block type: add it here, add a case in the editor's
 * renderBlock() function, and handle it in the API serializer.
 */
export type BlockType =
  | 'text'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'quote'
  | 'callout'
  | 'code'
  | 'divider'
  | 'todo'
  | 'toggle'
  | 'kanban'
  | 'table'
  | 'spreadsheet'
  | 'image'
  | 'video'
  | 'file'
  | 'form'
  | 'chart'
  | 'page_link'
  | 'drawing'
  | 'mindmap'
  | 'sticky'
  | 'timer'
  | 'invoice_block'
  | 'bookmark'
  | 'equation'
  | 'embed'
  | 'audio'
  | 'column_layout'
  | 'breadcrumb';

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK CONTENT SHAPES — what goes inside Block.content for each block_type
// ─────────────────────────────────────────────────────────────────────────────

/** content for block_type: 'text', 'heading1', 'heading2', 'heading3', 'quote' */
export interface TextContent {
  text: string;           // the raw text, may include inline markdown
}

/** content for block_type: 'code' */
export interface CodeContent {
  code: string;           // the source code
  language: string;       // e.g. 'python', 'typescript', 'bash'
}

/** content for block_type: 'todo' */
export interface TodoContent {
  text: string;
  checked: boolean;
}

/** content for block_type: 'toggle' */
export interface ToggleContent {
  text: string;           // the toggle header
  open: boolean;          // whether the children are visible
}

/** content for block_type: 'callout' */
export interface CalloutContent {
  text: string;
  icon: string;           // emoji or icon name, e.g. '💡'
  color: string;          // tailwind color class, e.g. 'yellow'
}

/** content for block_type: 'image' | 'video' | 'audio' | 'file' */
export interface MediaContent {
  url: string;            // absolute URL to the stored file
  caption?: string;
  width?: number;         // optional display width in px
}

/** content for block_type: 'bookmark' | 'embed' */
export interface EmbedContent {
  url: string;
  title?: string;
  description?: string;
  thumbnail?: string;
}

/** content for block_type: 'page_link' */
export interface PageLinkContent {
  page_id: string;        // UUID of the linked page
  title?: string;         // cached title to show if page is deleted
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE MODELS — mirror Django models exactly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * User — mirrors accounts.User model
 * The logged-in person. UUID id (not integer) because Django uses UUID pk.
 */
export interface User {
  id: string;             // UUID
  email: string;
  // full_name is stored in the DB but UserSerializer only returns display_name.
  // Made optional so the type works with both the API response and the Zustand store.
  full_name?: string;
  display_name: string;
  avatar: string | null;  // URL to avatar image, or null
}

/**
 * Workspace — mirrors workspaces.Workspace model
 * A workspace is a top-level container, like a company or personal vault.
 * One user can have multiple workspaces.
 *
 * To add workspace settings later: extend this interface and add
 * the field to the PATCH /api/workspaces/:id/ endpoint.
 */
export interface Workspace {
  id: string;
  name: string;
  icon: string;           // emoji, e.g. '🧠'
  color: string;          // hex color for sidebar accent
  description: string;
  is_personal: boolean;   // true = the user's private default workspace
  enc_tier: EncTier;
  ai_consent: AiConsent;
  storage_used_mb: number;
  created_at: string;     // ISO 8601 date string
  updated_at: string;
}

/**
 * Page — mirrors pages.Page model
 * A page lives inside a workspace and contains blocks.
 * Pages can be nested (parent → children) for sidebar hierarchy.
 */
export interface Page {
  id: string;
  workspace: string;      // workspace UUID
  created_by: string;     // user UUID
  parent: string | null;  // parent page UUID, or null if top-level
  page_type: PageType;
  view_mode: ViewMode;
  title: string;
  icon: string;
  header_pic: string | null;
  is_pinned: boolean;
  is_deleted: boolean;
  enc_tier: EncTier;
  ai_consent: AiConsent;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Block — mirrors blocks.Block model
 * A block is a single content unit on a page.
 *
 * content is typed as Record<string, unknown> because each block_type
 * has a different structure (see the content shape interfaces above).
 * In practice, cast it when you know the type:
 *   const text = block.content as TextContent;
 *
 * Canvas fields (canvas_x/y/w/h/z) are only used in 'canvas' view_mode.
 */
export interface Block {
  id: string;
  page: string;           // page UUID
  parent: string | null;  // parent block UUID (for nested blocks like toggles)
  block_type: BlockType;
  content: Record<string, unknown>;  // shape depends on block_type
  order: number;          // fractional ordering (1.0, 2.0, 1.5 for insertion)
  canvas_x: number | null;
  canvas_y: number | null;
  canvas_w: number | null;
  canvas_h: number | null;
  canvas_z: number | null;
  enc_tier: EncTier;
  ai_consent: AiConsent;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API RESPONSE SHAPES — what the backend actually sends back
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard DRF paginated list response.
 * Django REST Framework wraps list results in { count, next, previous, results }.
 * Used generically: PaginatedResponse<Workspace>, PaginatedResponse<Page>, etc.
 */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;    // URL to next page of results
  previous: string | null;
  results: T[];
}

/** Response from POST /api/auth/login/ and POST /api/auth/register/ */
export interface AuthTokens {
  access: string;         // JWT access token (short-lived, 15 min)
  refresh: string;        // JWT refresh token (long-lived, 30 days)
}

/** Response from POST /api/auth/token/refresh/ */
export interface RefreshResponse {
  access: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST PAYLOAD SHAPES — what we send TO the backend
// ─────────────────────────────────────────────────────────────────────────────

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  password2: string;  // required by Django's RegisterSerializer for confirmation
  full_name: string;
}

export interface CreateWorkspacePayload {
  name: string;
  icon?: string;
  color?: string;
  description?: string;
}

export interface UpdateWorkspacePayload {
  name?: string;
  icon?: string;
  color?: string;
  description?: string;
}

export interface CreatePagePayload {
  title: string;
  parent?: string | null;
  page_type?: PageType;
  view_mode?: ViewMode;
  icon?: string;
}

export interface UpdatePagePayload {
  title?: string;
  icon?: string;
  header_pic?: string | null;
  is_pinned?: boolean;
  parent?: string | null;
  enc_tier?: EncTier;
  ai_consent?: AiConsent;
}

export interface CreateBlockPayload {
  block_type: BlockType;
  content: Record<string, unknown>;
  order?: number;
  parent?: string | null;
}

export interface UpdateBlockPayload {
  content?: Record<string, unknown>;
  order?: number;
  block_type?: BlockType;
}

export interface ReorderBlocksPayload {
  blocks: Array<{ id: string; order: number }>;
}

export interface AiActionPayload {
  action_type: string;    // e.g. 'summarize', 'expand', 'translate'
  content?:    string;    // text to process (provide this OR page_id)
  page_id?:    string;    // page UUID — backend fetches the text if content not given
  extra?:      Record<string, unknown>;  // e.g. { language: 'Spanish' } for translate
}

/** A single message in the AI chat history */
export interface AiChatMessage {
  role:    'user' | 'assistant';
  content: string;
}

/** POST /api/ai/chat/ */
export interface AiChatPayload {
  messages: AiChatMessage[];
  page_id?:  string;   // page to use as context (optional)
  context?:  string;   // extra context text (optional)
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR SHAPE — how the backend reports validation errors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ApiError — shape of error responses from Django REST Framework.
 * DRF returns validation errors as { field: ['message'] } or { detail: 'message' }.
 * The api.ts interceptor will parse this into a usable format.
 */
export interface ApiError {
  message: string;                         // human-readable summary
  detail?: string;                         // DRF's generic error field
  fields?: Record<string, string[]>;       // field-level validation errors
  statusCode: number;
}
