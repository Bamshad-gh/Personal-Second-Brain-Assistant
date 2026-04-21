/**
 * types/index.ts
 *
 * What:    Single source of truth for all TypeScript types in this app.
 *          Every interface mirrors a Django model or API response shape.
 *          Import from here — never define types inline.
 *
 * Analogy: This is your models.py but for the frontend. Just as Django models
 *          define what data looks like in the database, these types define what
 *          data looks like as it travels over the API.
 *
 * How to expand: When the backend adds a new model field, add it here first.
 *          TypeScript will then surface every place in the frontend that needs
 *          to handle it (red squiggles = your checklist).
 */

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS — mirror Django choices fields
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
 * Controls the default editor layout and available block types.
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

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK TYPE SYSTEM — mirrors backend BLOCK_TYPE_REGISTRY in models.py
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Logical grouping for block types.
 * Mirrors the 'category' field in BLOCK_TYPE_REGISTRY.
 * Used to organise the slash menu and block panel into sections.
 */
export type BlockCategory =
  | 'text'
  | 'list'
  | 'code'
  | 'media'
  | 'layout'
  | 'canvas_only'
  | 'automation'
  | 'data';

/**
 * All valid block types — must stay in sync with backend BLOCK_TYPE_REGISTRY.
 *
 * HOW TO ADD A NEW TYPE:
 *   1. Add to backend BLOCK_TYPE_REGISTRY (models.py) — no migration needed
 *   2. Add the string literal here
 *   3. Add a renderer case in the editor's block renderer
 *   4. Add to slash menu if doc_ok; add to canvas panel if canvas_ok
 *
 * DEPRECATED (Phase 2 migration pending — kept here so tsc passes while
 * existing frontend code is updated):
 *   'text' → use 'paragraph' instead
 */
export type BlockType =
  // ── Text ──────────────────────────────────────────────────────────────────
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'quote'
  | 'callout'
  | 'divider'
  // ── List ──────────────────────────────────────────────────────────────────
  | 'bullet_item'
  | 'numbered_item'
  | 'todo_item'
  // ── Code ──────────────────────────────────────────────────────────────────
  | 'code'
  // ── Table ─────────────────────────────────────────────────────────────────
  | 'table'
  // ── Media ─────────────────────────────────────────────────────────────────
  | 'image'
  | 'file'
  | 'pdf'
  | 'video'
  // ── Layout ────────────────────────────────────────────────────────────────
  | 'column_container'
  | 'column'
  // ── Canvas-only ───────────────────────────────────────────────────────────
  | 'sticky'
  | 'rich'
  | 'drawing'
  // ── Automation ────────────────────────────────────────────────────────────
  | 'automation_trigger'
  | 'automation_action'
  | 'ai_agent_block'
  // ── Data (future) ─────────────────────────────────────────────────────────
  | 'database'
  | 'spreadsheet'
  | 'form'
  | 'chart'
  // ── Deprecated — Phase 2 migration pending ────────────────────────────────
  | 'text';   // → use 'paragraph' — remove once all frontend references updated

/**
 * Metadata from GET /api/blocks/types/
 * The frontend can fetch this at runtime to build dynamic menus without
 * hardcoding block type lists.
 */
export interface BlockTypeInfo {
  block_type:   BlockType;
  category:     BlockCategory;
  has_children: boolean;
  canvas_ok:    boolean;
  doc_ok:       boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK CONTENT SHAPE — what goes inside Block.content per block_type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Union of all possible content fields across every block type.
 * All fields are optional — only the fields relevant to a specific block_type
 * will be present at runtime.
 *
 * Content schemas per type (matches backend comments in BLOCK_TYPE_REGISTRY):
 *   paragraph / heading* / quote:  { text, marks }
 *   callout:                        { text, emoji, color }
 *   bullet_item / numbered_item:    { text, marks }
 *   todo_item:                      { text, checked, marks }
 *   code:                           { code, language, output }
 *   image:                          { url, alt, width }
 *   file / pdf:                     { url, filename, size }
 *   video:                          { url }
 *   column_container:               { columns }
 *   sticky:                         { text, color }
 *   rich:                           { json }   ← full TipTap JSON
 *   automation_trigger:             { trigger_type, config }
 *   automation_action:              { action_type, config }
 *   ai_agent_block:                 { agent_type, system_prompt, output }
 *   database / spreadsheet:         { schema, rows }
 *   form:                           { fields, submit_label }
 *   chart:                          { chart_type, data_source }
 */
export interface BlockContent {
  // ── Text / list ─────────────────────────────────────────────────────────
  text?:          string;
  marks?:         Array<{ type: string; attrs?: Record<string, unknown> }>;
  level?:         number;       // heading level (1–3)
  // ── Callout ─────────────────────────────────────────────────────────────
  emoji?:         string;
  color?:         string;
  // ── To-do ───────────────────────────────────────────────────────────────
  checked?:       boolean;
  // ── Code ────────────────────────────────────────────────────────────────
  code?:          string;
  language?:      string;
  output?:        string | null;
  // ── Media ───────────────────────────────────────────────────────────────
  url?:           string;
  alt?:           string;
  width?:         number;
  filename?:      string;
  size?:          number;
  caption?:       string;
  // ── Layout ──────────────────────────────────────────────────────────────
  columns?:       number;
  // ── Rich (canvas TipTap block) ───────────────────────────────────────────
  json?:          Record<string, unknown>;
  // ── Automation ──────────────────────────────────────────────────────────
  trigger_type?:  string;
  action_type?:   string;
  agent_type?:    string;
  system_prompt?: string;
  config?:        Record<string, unknown>;
  // ── Data ────────────────────────────────────────────────────────────────
  schema?:        unknown[];
  rows?:          unknown[][];
  fields?:        unknown[];
  submit_label?:  string;
  chart_type?:    string;
  data_source?:   unknown | null;
  // ── Catch-all for future / unknown fields ───────────────────────────────
  [key: string]:  unknown;
}

// ── Specific content shape interfaces — kept for backwards compatibility ─────
// These are more strictly typed than BlockContent. Use them when you know the
// block_type and want precise field access:
//   const c = block.content as TextContent;

/** content for paragraph, heading1–3, quote */
export interface TextContent {
  text:   string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

/** content for code blocks */
export interface CodeContent {
  code:     string;
  language: string;
  output?:  string | null;
}

/** content for todo_item */
export interface TodoContent {
  text:    string;
  checked: boolean;
}

/** content for callout */
export interface CalloutContent {
  text:  string;
  emoji: string;   // e.g. '💡'
  color: string;   // tailwind color name or hex
}

/** content for image, video, file, pdf */
export interface MediaContent {
  url:      string;
  caption?: string;
  width?:   number;
  filename?: string;
  size?:    number;
}

/** content for rich (canvas TipTap block) */
export interface RichContent {
  json: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE MODELS — mirror Django models exactly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * User — mirrors accounts.User model
 */
export interface User {
  id:           string;   // UUID
  email:        string;
  full_name?:   string;   // optional — only present on some endpoints
  display_name: string;
  avatar:       string | null;
  is_staff?:    boolean;  // true for staff/admin users; absent on older tokens
}

/**
 * Workspace — mirrors workspaces.Workspace model
 *
 * FIELD AVAILABILITY:
 *   List endpoint   → id, name, icon, color, page_count, is_locked, updated_at
 *   Detail endpoint → all fields below
 */
export interface Workspace {
  id:              string;
  name:            string;
  icon:            string;    // emoji, e.g. '🧠'
  color:           string;    // backend string name: 'white'|'red'|'green'|'yellow'|'blue'|'purple'
  updated_at:      string;
  description?:    string;
  is_personal?:    boolean;
  enc_tier?:       EncTier;
  ai_consent?:     AiConsent;
  storage_used_mb?: number;
  created_at?:     string;
  page_count?:     number;
  is_locked?:      boolean;
  owner_name?:     string;
}

/**
 * Page — mirrors pages.Page model
 *
 * FIELD AVAILABILITY:
 *   List endpoint   → id, title, icon, page_type, parent, is_pinned, is_locked, updated_at
 *   Detail endpoint → all fields below
 */
export interface Page {
  id:                string;
  title:             string;
  icon:              string;
  page_type:         PageType;
  parent:            string | null;
  is_pinned:         boolean;
  is_locked:         boolean;
  updated_at:        string;
  custom_page_type?: string | null;
  color?:            string;
  color_style?:      'none' | 'accent' | 'tint' | 'both';
  workspace?:        string;
  created_by?:       string;
  view_mode?:        ViewMode;
  header_pic?:       string | null;
  header_pic_url?:   string;
  enc_tier?:         EncTier;
  ai_consent?:       AiConsent;
  created_at?:       string;
}

/**
 * Block — mirrors blocks.Block model
 *
 * block_type is validated against backend BLOCK_TYPE_REGISTRY — no
 * Django choices= means adding new types never requires a migration.
 *
 * category and has_children are computed properties derived from the
 * registry at read time — they are read-only on the serializer.
 *
 * Canvas fields (canvas_x/y/w/h/z) are only meaningful in canvas view_mode.
 * canvas_z defaults to 0 (never null) — use z-index for stacking order.
 */
export interface Block {
  id:             string;
  page:           string;           // page UUID
  parent:         string | null;    // parent block UUID (nested blocks)
  block_type:     BlockType;
  category:       BlockCategory;    // derived from BLOCK_TYPE_REGISTRY (read-only)
  has_children:   boolean;          // derived from BLOCK_TYPE_REGISTRY (read-only)
  content:        BlockContent;
  order:          number;           // fractional: 1.0, 2.0, 1.5 for insertion
  canvas_x:       number | null;
  canvas_y:       number | null;
  canvas_w:       number | null;
  canvas_h:       number | null;
  canvas_z:       number;           // integer, default 0 — never null
  doc_visible:    boolean;
  canvas_visible: boolean;
  bg_color:       string;
  text_color:     string;
  enc_tier:       EncTier;
  ai_consent:     AiConsent;
  is_locked:      boolean;
  is_deleted:     boolean;
  children_count: number;           // count of non-deleted direct children
  created_at:     string;
  updated_at:     string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API RESPONSE SHAPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard DRF paginated list response.
 * Used generically: PaginatedResponse<Workspace>, PaginatedResponse<Page>, etc.
 */
export interface PaginatedResponse<T> {
  count:    number;
  next:     string | null;
  previous: string | null;
  results:  T[];
}

/** Response from POST /api/auth/login/ and POST /api/auth/register/ */
export interface AuthTokens {
  access:  string;   // short-lived JWT (15 min)
  refresh: string;   // long-lived JWT (30 days)
}

/** Response from POST /api/auth/token/refresh/ */
export interface RefreshResponse {
  access: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST PAYLOAD SHAPES — what we send TO the backend
// ─────────────────────────────────────────────────────────────────────────────

export interface LoginPayload {
  email:    string;
  password: string;
}

export interface RegisterPayload {
  email:     string;
  password:  string;
  password2: string;   // required by Django's RegisterSerializer for confirmation
  full_name: string;
}

export interface CreateWorkspacePayload {
  name:         string;
  icon?:        string;
  color?:       string;
  description?: string;
}

export interface UpdateWorkspacePayload {
  name?:        string;
  icon?:        string;
  color?:       string;
  description?: string;
}

export interface CreatePagePayload {
  title:             string;
  parent?:           string | null;
  page_type?:        PageType;
  view_mode?:        ViewMode;
  icon?:             string;
  custom_page_type?: string | null;
}

export interface UpdatePagePayload {
  title?:            string;
  icon?:             string;
  color?:            string;
  color_style?:      'none' | 'accent' | 'tint' | 'both';
  header_pic?:       string | null;
  header_pic_url?:   string;
  is_pinned?:        boolean;
  parent?:           string | null;
  page_type?:        PageType;
  view_mode?:        ViewMode;
  custom_page_type?: string | null;
}

export interface CreateBlockPayload {
  block_type:      BlockType;
  content:         BlockContent;
  order?:          number;
  parent?:         string | null;
  canvas_x?:       number | null;
  canvas_y?:       number | null;
  canvas_w?:       number | null;
  canvas_h?:       number | null;
  canvas_z?:       number;
  doc_visible?:    boolean;
  canvas_visible?: boolean;
}

export interface UpdateBlockPayload {
  block_type?:     BlockType;       // now accepted by BlockUpdateSerializer
  content?:        BlockContent;
  order?:          number;
  parent?:         string | null;
  canvas_x?:       number | null;
  canvas_y?:       number | null;
  canvas_w?:       number | null;
  canvas_h?:       number | null;
  canvas_z?:       number;
  doc_visible?:    boolean;
  canvas_visible?: boolean;
  bg_color?:       string;
  text_color?:     string;
  is_locked?:      boolean;
  enc_tier?:       EncTier;
  ai_consent?:     AiConsent;
}

export interface ReorderBlocksPayload {
  blocks: Array<{ id: string; order: number }>;
}

export interface AiActionPayload {
  action_type: string;
  content?:    string;
  page_id?:    string;
  extra?:      Record<string, unknown>;
}

/** A single message in the AI chat history */
export interface AiChatMessage {
  id?:         string;   // present on messages loaded from the backend
  role:        'user' | 'assistant' | 'system';
  content:     string;
  created_at?: string;   // ISO 8601 — present on backend messages
}

/** POST /api/ai/chat/ */
export interface AiChatPayload {
  messages: AiChatMessage[];
  page_id?: string;
  context?: string;
}

/** Response from GET /api/ai/quota/ */
export interface AiQuota {
  tier:                string;
  daily_actions_limit: number | null;
  daily_actions_used:  number;
  daily_tokens_limit:  number | null;
  daily_tokens_used:   number;
}

/** Response item from GET /api/ai/actions/ */
export interface AiActionDefinition {
  action_type:    string;
  label:          string;
  description:    string;
  category:       'text' | 'code' | string;
  requires_extra: string[];
}

/** Response from GET /api/ai/usage/ */
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
// RELATIONS — page links, canvas arrows, backlinks, knowledge graph
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Connection — mirrors relations.Connection model (PAGE_LINK type).
 * Created when a user inserts a [[page link]] in the editor.
 */
export interface Connection {
  id:         string;
  conn_type:  'page_link';
  source_page: string;
  target_page: string;
  metadata:   Record<string, unknown>;
  created_at: string;
}

/**
 * BlockConnection — a canvas arrow between two blocks.
 * Stored as a Connection row with conn_type='block_link'.
 */
export interface BlockConnection {
  id:           string;
  conn_type:    'block_link';
  source_block: string;
  target_block: string;
  arrow_type:   'link' | 'flow';
  direction:    'directed' | 'undirected';
  label:        string;
  is_deleted:   boolean;
  created_at:   string;
}

/**
 * BacklinkPage — one item in the backlinks panel.
 * Returned by GET /api/relations/pages/{id}/backlinks/
 */
export interface BacklinkPage {
  id:                       string;   // connection UUID
  source_page_id:           string;
  source_page_title:        string;
  source_page_workspace_id: string;
}

/**
 * GraphNode — one node in the workspace knowledge graph.
 * Returned by GET /api/relations/workspace/{id}/graph/ (inside "nodes")
 */
export interface GraphNode {
  id:               string;
  title:            string;
  icon:             string;
  color:            string;           // resolved effective hex — never empty
  custom_page_type: string | null;
}

/**
 * GraphEdge — one directed edge in the workspace knowledge graph.
 * Returned by GET /api/relations/workspace/{id}/graph/ (inside "edges")
 */
export interface GraphEdge {
  source: string;
  target: string;
  type:   string;   // 'page_link' | 'parent' | 'child'
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPERTIES — typed metadata fields on pages
// ─────────────────────────────────────────────────────────────────────────────

export type PropType =
  | 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'multi'
  | 'url' | 'email' | 'phone' | 'currency' | 'relation' | 'file' | 'object';

export interface SelectOption {
  label:  string;
  color?: string;
}

export interface PropertyDefinition {
  id:               string;
  workspace:        string;
  custom_page_type: string | null;
  page_type:        string;
  name:             string;
  prop_type:        PropType;
  options:          SelectOption[];
  order:            number;
  is_global:        boolean;
}

export interface PropertyValue {
  id:           string;
  page:         string;
  definition:   string;
  value_text:   string;
  value_number: number | null;
  value_date:   string | null;
  value_bool:   boolean | null;
  value_json:   unknown | null;
}

export interface PageTypeGroup {
  id:         string;
  workspace:  string;
  name:       string;
  color:      string;
  order:      number;
  created_at: string;
}

export interface CustomPageType {
  id:            string;
  workspace:     string;
  name:          string;
  icon:          string;
  description:   string;
  group:         string | null;
  group_detail:  PageTypeGroup | null;
  is_pinned:     boolean;
  default_color: string;
  default_icon:  string;
}

// ─────────────────────────────────────────────────────────────────────────────
// GALLERY — curated cover images
// ─────────────────────────────────────────────────────────────────────────────

export interface GalleryImage {
  id:     string;   // filename, e.g. "gallery_01.jpg"
  url:    string;   // absolute URL served from media/gallery/
  credit: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOVER CARD — lightweight page preview for [[Page Link]] chips
// ─────────────────────────────────────────────────────────────────────────────

export interface PagePreview {
  id:              string;
  title:           string;
  icon:            string;
  page_type:       PageType;
  content_preview: string;
  backlink_count:  number;
  workspace_id:    string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR SHAPE — how the backend reports validation errors
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiError {
  message:    string;
  detail?:    string;
  fields?:    Record<string, string[]>;
  statusCode: number;
}
