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
  | 'rich'
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
 * FIELD AVAILABILITY NOTE:
 *   GET /api/workspaces/      (list)   → returns: id, name, icon, color, page_count, is_locked, updated_at
 *   GET /api/workspaces/{id}/ (detail) → returns all fields below
 *   Fields marked ? are only present on the detail endpoint.
 *
 * To add workspace settings later: extend this interface and add
 * the field to the PATCH /api/workspaces/:id/ endpoint.
 */
export interface Workspace {
  id: string;
  name: string;
  icon: string;               // emoji, e.g. '🧠'
  color: string;              // backend string name: 'white'|'red'|'green'|'yellow'|'blue'|'purple'
  updated_at: string;
  // Detail-only fields (not returned by the list endpoint)
  description?: string;
  is_personal?: boolean;      // true = the user's private default workspace
  enc_tier?: EncTier;
  ai_consent?: AiConsent;
  storage_used_mb?: number;
  created_at?: string;        // ISO 8601 date string
  // Computed fields returned by both list and detail
  page_count?: number;
  is_locked?: boolean;
  owner_name?: string;        // display_name of the owner (detail only)
}

/**
 * Page — mirrors pages.Page model
 * A page lives inside a workspace and contains blocks.
 * Pages can be nested (parent → children) for sidebar hierarchy.
 *
 * FIELD AVAILABILITY NOTE:
 *   GET /api/pages/?workspace=<id>  (list)   → returns: id, title, icon, page_type, parent, is_pinned, is_locked, updated_at
 *   GET /api/pages/{id}/            (detail) → returns all fields below
 *   POST/PATCH /api/pages/          (write)  → returns all fields below
 *   Fields marked ? may be absent when reading from the list endpoint.
 *
 * NOTE: is_deleted is never returned by the API (backend filters deleted pages out).
 */
export interface Page {
  id: string;
  title: string;
  icon: string;
  page_type: PageType;
  parent: string | null;  // parent page UUID, or null if top-level
  is_pinned: boolean;
  is_locked: boolean;
  updated_at: string;
  custom_page_type?: string | null;  // CustomPageType UUID
  color?: string;          // per-page hex accent; '' means "use type default"
  color_style?: 'none' | 'accent' | 'tint' | 'both';  // where color appears in the page; default 'both'
  // Detail-only / write-response fields:
  workspace?: string;      // workspace UUID
  created_by?: string;     // user UUID
  view_mode?: ViewMode;
  header_pic?: string | null;     // relative path to uploaded file (e.g. "page_headers/abc.jpg")
  header_pic_url?: string;        // external or gallery URL; takes priority over header_pic
  enc_tier?: EncTier;
  ai_consent?: AiConsent;
  created_at?: string;
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
  doc_visible: boolean;
  canvas_visible: boolean;
  bg_color: string;
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
  custom_page_type?: string | null;
}

// BUG FIX: removed enc_tier and ai_consent (not in PageUpdateSerializer).
// Added page_type and view_mode (which PageUpdateSerializer does accept).
export interface UpdatePagePayload {
  title?: string;
  icon?: string;
  color?: string;           // hex accent; send '' to reset to type default
  color_style?: 'none' | 'accent' | 'tint' | 'both';
  header_pic?: string | null;
  header_pic_url?: string;        // send '' to clear; send URL string to set gallery/external cover
  is_pinned?: boolean;
  parent?: string | null;
  page_type?: PageType;
  view_mode?: ViewMode;
  custom_page_type?: string | null;
}

export interface CreateBlockPayload {
  block_type: BlockType;
  content: Record<string, unknown>;
  order?: number;
  parent?: string | null;
  // Canvas fields — only needed when creating a block directly on the canvas
  canvas_x?: number | null;
  canvas_y?: number | null;
  canvas_w?: number | null;
  canvas_h?: number | null;
  canvas_z?: number | null;
  doc_visible?: boolean;
  canvas_visible?: boolean;
}

// BUG FIX: removed block_type (BlockUpdateSerializer does not accept it).
export interface UpdateBlockPayload {
  content?: Record<string, unknown>;
  order?: number;
  parent?: string | null;
  // Canvas position/size — updated on drag-end and resize-end
  canvas_x?: number | null;
  canvas_y?: number | null;
  canvas_w?: number | null;
  canvas_h?: number | null;
  canvas_z?: number | null;
  doc_visible?: boolean;
  canvas_visible?: boolean;
  bg_color?: string;
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

/** Response item from GET /api/ai/actions/ — metadata for one available action */
export interface AiActionDefinition {
  action_type:    string;
  label:          string;
  description:    string;
  category:       'text' | 'code' | string;
  requires_extra: string[];
}

/** Response from GET /api/ai/usage/ — token usage summary for the current user */
export interface AiUsageSummary {
  total_input_tokens:  number;
  total_output_tokens: number;
  calls_today:         number;
  calls_this_month:    number;
  recent: Array<{
    call_type:     string;
    action_name:   string;
    model:         string;
    input_tokens:  number;
    output_tokens: number;
    created_at:    string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// RELATIONS — page links and backlinks (Phase 2 Feature 1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Connection — mirrors relations.Connection model (PAGE_LINK type only for now).
 * Created when a user inserts a [[page link]] in the editor.
 * The backend upserts on (conn_type, source_page, target_page) — no duplicates.
 *
 * Returned by: POST /api/relations/
 */
export interface Connection {
  id: string;                        // UUID
  conn_type: 'page_link';            // only PAGE_LINK connections are created from the editor
  source_page: string;               // UUID of the page that contains the [[link]]
  target_page: string;               // UUID of the page being linked to
  metadata: Record<string, unknown>; // e.g. { anchor_text: 'My Notes' } — unused in Phase 1
  created_at: string;                // ISO 8601
}

/**
 * BlockConnection — a canvas arrow between two blocks.
 * Stored as a Connection row with conn_type='block_link'.
 *
 * Returned by: GET /api/relations/block-connections/?page={id}
 */
export interface BlockConnection {
  id:           string;           // UUID
  conn_type:    'block_link';
  source_block: string;           // block UUID
  target_block: string;           // block UUID
  arrow_type:   'link' | 'flow';  // 'flow' renders animated dashed blue arrow
  direction:    'directed' | 'undirected'; // 'directed' shows arrowhead
  label:        string;           // optional display label on the arrow
  is_deleted:   boolean;
  created_at:   string;           // ISO 8601
}

/**
 * BacklinkPage — one item in the backlinks panel.
 * A flat summary of a Connection, shaped for display (no extra joins needed).
 *
 * Returned by: GET /api/relations/pages/{id}/backlinks/
 */
export interface BacklinkPage {
  id: string;                        // connection UUID (stable key for React lists)
  source_page_id: string;            // UUID of the page that links here
  source_page_title: string;         // title to display in the backlinks panel
  source_page_workspace_id: string;  // workspace UUID — used to build the nav URL
}

/**
 * GraphNode — one node in the workspace knowledge graph.
 * Represents a single non-deleted page in the workspace.
 *
 * color is the resolved effective color (never null/empty):
 *   page.color || type.default_color || '#7c3aed'
 * Resolved server-side in WorkspaceGraphView so the frontend never has to
 * apply the fallback chain itself.
 *
 * Returned by: GET /api/relations/workspace/{id}/graph/  (inside "nodes")
 */
export interface GraphNode {
  id:               string;          // page UUID
  title:            string;
  icon:             string;          // resolved effective emoji
  color:            string;          // resolved effective hex color (never empty)
  custom_page_type: string | null;   // CustomPageType UUID, or null
}

/**
 * GraphEdge — one directed edge in the workspace knowledge graph.
 * Represents a PAGE_LINK Connection between two pages.
 *
 * type values:
 *   'page_link' — a manual [[link]] inserted by the user
 *   'parent'    — auto-created when a child page is created (parent → child)
 *   'child'     — auto-created when a child page is created (child → parent)
 *
 * Returned by: GET /api/relations/workspace/{id}/graph/  (inside "edges")
 */
export interface GraphEdge {
  source: string;   // source page UUID
  target: string;   // target page UUID
  type:   string;   // 'page_link' | 'parent' | 'child'
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPERTIES — typed metadata fields on pages (Phase 2 Feature 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PropType — mirrors PropertyDefinition.PropertyType choices.
 * Each type controls how a value is displayed and edited in the UI.
 */
export type PropType =
  | 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'multi'
  | 'url' | 'email' | 'phone' | 'currency' | 'relation' | 'file' | 'object';

/** One option entry for select / multi-select property types */
export interface SelectOption {
  label:  string;
  color?: string;  // optional tailwind color name, e.g. 'violet'
}

/**
 * PropertyDefinition — mirrors properties.PropertyDefinition model.
 * Describes the schema of a typed field (name, type, options).
 * Belongs to a workspace; optionally scoped to a custom_page_type.
 *
 * Returned by: GET /api/properties/definitions/?workspace=<id>
 */
export interface PropertyDefinition {
  id:               string;         // UUID — DRF serializes as string
  workspace:        string;         // workspace UUID
  custom_page_type: string | null;  // UUID or null if not scoped to a custom type
  page_type:        string;         // built-in page type filter (blank = any)
  name:             string;
  prop_type:        PropType;
  options:          SelectOption[]; // only used for select / multi types
  order:            number;
  is_global:        boolean;
}

/**
 * PropertyValue — mirrors properties.PropertyValue model.
 * The actual value of a property on a specific page.
 * One row per (page, definition) pair.
 *
 * value_text is a TextField with blank=True (defaults to "" not null).
 * All other value_* columns are nullable.
 *
 * Returned by: GET /api/properties/values/?page=<id>
 */
export interface PropertyValue {
  id:           string;        // UUID — DRF serializes as string
  page:         string;        // page UUID
  definition:   string;        // PropertyDefinition UUID
  value_text:   string;        // blank string when unset (not null — TextField)
  value_number: number | null;
  value_date:   string | null; // ISO 8601 datetime string
  value_bool:   boolean | null;
  value_json:   unknown | null; // select options (string[]), relations, etc.
}

/**
 * PageTypeGroup — mirrors properties.PageTypeGroup model.
 * A named, coloured bucket that organises CustomPageTypes in the sidebar
 * and in the CustomPageTypeManager panel.
 *
 * Returned by: GET /api/properties/groups/?workspace=<id>
 */
export interface PageTypeGroup {
  id:         string;   // UUID
  workspace:  string;   // workspace UUID
  name:       string;
  color:      string;   // hex color string, e.g. '#60a5fa'
  order:      number;
  created_at: string;   // ISO 8601
}

/**
 * CustomPageType — mirrors properties.CustomPageType model.
 * A user-defined page category with its own scoped PropertyDefinitions.
 *
 * group      — FK UUID for write operations (send the group id to assign/unassign)
 * group_detail — full nested PageTypeGroup object returned on read (null if ungrouped)
 * is_pinned  — controls sidebar picker visibility (true = show in picker)
 *
 * Returned by: GET /api/properties/custom-types/?workspace=<id>
 */
export interface CustomPageType {
  id:            string;
  workspace:     string;
  name:          string;
  icon:          string;
  description:   string;
  group:         string | null;            // PageTypeGroup UUID (write FK)
  group_detail:  PageTypeGroup | null;     // nested group object (read only)
  is_pinned:     boolean;
  default_color: string;                   // hex accent for graph nodes + page header
  default_icon:  string;                   // emoji shown in graph node + sidebar
}

// ─────────────────────────────────────────────────────────────────────────────
// GALLERY — curated cover images served from media/gallery/
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GalleryImage — one item from GET /api/pages/gallery/
 * Represents a curated cover image available for all pages.
 * credit is empty string by default; admins can add metadata later.
 */
export interface GalleryImage {
  id:     string;   // filename, e.g. "gallery_01.jpg"
  url:    string;   // absolute URL served from media/gallery/
  credit: string;   // photographer credit (empty string if not set)
}

// ─────────────────────────────────────────────────────────────────────────────
// HOVER CARD — lightweight page preview for [[Page Link]] chips
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PagePreview — lightweight data returned by GET /api/pages/:id/preview/
 * Used by the hover card shown when hovering [[Page Link]] chips in the editor.
 */
export interface PagePreview {
  id:              string;
  title:           string;
  icon:            string;
  page_type:       PageType;
  content_preview: string;  // first 100 chars of plain text, never JSON
  backlink_count:  number;
  workspace_id:    string;
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
