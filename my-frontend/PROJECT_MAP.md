# SpatialScribe — Frontend Project Map

> Reference guide for the `my-frontend/` Next.js app.
> Stack: Next.js 16 · React 19 · TypeScript · Tailwind v4 · Zustand · React Query · TipTap v3

---

## 1. CURRENT STATE

### Working
- Auth: login, register, token refresh, session restore on reload
- Workspaces: create, list, switch, delete, color accent
- Pages: create, rename, delete (soft), sidebar tree, nested pages
- Blocks: TipTap editor with autosave (500ms debounce) to single "text" block
- Editor: slash commands `/`, toolbar, syntax-highlighted code blocks, toggle blocks, task lists, voice-to-text, image paste/drop (base64)
- AI Panel: quick actions (summarise, expand, translate…) + free-form chat grounded in page content
- **Phase 2 — Feature 1 (Page Linking):** type `[[` → search popup → insert `[[Page Title]]` chip → click to navigate → backlinks panel on target page
- **Phase 2 — Feature 2 (Property System):** typed metadata fields (text, number, date, checkbox, select, multi-select, URL, email, phone, currency) below the page title
- **Phase 2 — Feature 3 (Hover Cards):** hover a `[[Page Link]]` chip for 500ms → popup card with title, type badge, content preview, backlink count, Open button
- **Phase 2 — Feature 4 (Canvas Mode):** toggle button in page header switches between document editor and infinite 2D canvas; blocks freely positioned with drag, resize, and Ctrl+scroll zoom
- **Phase 2 — Feature 5 (Custom Page Types):** user-defined page categories (e.g. "Client", "Project") with scoped PropertyDefinitions; sidebar Layers button → CustomPageTypeManager; New page dropdown includes custom types; PropertyBar filters definitions by type

### Not working / known limitations
- Image uploads stored as base64 — no Django media storage yet (Feature 4)
- Page search / command palette not built yet
- Block drag-to-reorder not implemented
- Backlinks are append-only — deleting a `[[link]]` chip from the editor does not remove the `Connection` row from the backend
- Voice transcription (`/api/ai/transcribe/`) backend endpoint may not exist yet

---

## 2. FOLDER STRUCTURE

```
my-frontend/src/
│
├── app/                              Next.js App Router pages
│   ├── layout.tsx                    Root layout — mounts Providers + AuthInitializer
│   ├── globals.css                   All global CSS: theme tokens, editor styles, slash menu,
│   │                                 page link chip (.page-link-node), --violet CSS variables
│   ├── page.tsx                      Home → redirects to /workspace
│   ├── not-found.tsx                 404 page
│   │
│   ├── (auth)/                       Public routes — no auth required
│   │   ├── layout.tsx                Centered card layout for auth forms
│   │   ├── login/page.tsx            Login form
│   │   └── register/page.tsx         Register form
│   │
│   └── (app)/                        Protected routes — requires session cookie
│       ├── layout.tsx                Server component — reads cookies, renders AppShellClient
│       ├── AppShellClient.tsx        Client shell — sidebar + top bar + main content layout
│       ├── workspace/
│       │   ├── page.tsx              Redirects to first workspace (or /workspace/create)
│       │   └── create/page.tsx       Create workspace form
│       ├── [workspaceId]/
│       │   └── page.tsx              Workspace home — lists pages
│       └── [workspaceId]/[pageId]/
│           └── page.tsx              Full editor page — title + TipTap + AI panel
│                                     + BacklinksPanel (Phase 2) ← defined inline at bottom
│
├── components/
│   ├── auth/
│   │   └── AuthInitializer.tsx       Runs on mount — calls /api/auth/me/ to restore session
│   ├── editor/
│   │   ├── Editor.tsx                Main TipTap editor — toolbar, voice, autosave,
│   │   │                             slash menu, page link popup, block handle
│   │   │                             Props: initialContent, onSave, onTextChange,
│   │   │                                    readOnly, workspaceId, pageId (Phase 2)
│   │   ├── BlockWrapper.tsx          AddBlockHandle — floating "+" button beside hovered block
│   │   ├── EditorErrorBoundary.tsx   Catches TipTap crashes, shows fallback UI
│   │   ├── SlashMenu.tsx             Slash menu list UI + COMMANDS array definition
│   │   ├── SlashMenuPortal.tsx       Renders slash menu on document.body via createPortal
│   │   ├── PageLinkPopup.tsx         [Phase 2] [[ search popup — filters workspace pages,
│   │   │                             keyboard navigation, portal-rendered on document.body
│   │   └── extensions/
│   │       ├── SlashCommand.ts       TipTap extension — intercepts "/" via @tiptap/suggestion
│   │       ├── CustomCodeBlock.ts    TipTap extension — CodeBlockLowlight + language selector
│   │       ├── CodeBlockWrapper.tsx  React node view for code blocks (language dropdown UI)
│   │       ├── ToggleBlock.ts        TipTap extension — collapsible toggle block
│   │       ├── ToggleBlockView.tsx   React node view for toggle blocks (open/close UI)
│   │       └── PageLink.ts          [Phase 2] Two exports:
│   │                                  PageLinkNode — inline atom node [[Title]] chip
│   │                                  PageLinkSuggestion — [[ trigger via @tiptap/suggestion
│   ├── sidebar/
│   │   ├── Sidebar.tsx               Main sidebar: workspace header, new-page dropdown
│   │   │                             (blank + one item per custom type), page tree, user footer.
│   │   │                             Footer: Settings · Layers (CustomPageTypeManager toggle) ·
│   │   │                             ThemeToggle · Logout
│   │   ├── WorkspaceSwitcher.tsx     Dropdown to switch workspaces (shows color dot + name)
│   │   ├── PageTree.tsx              Recursive page list with expand/collapse
│   │   └── SidebarItem.tsx           Single page row — active highlight, rename, delete
│   ├── ai/
│   │   └── AiPanel.tsx               Right-side AI assistant drawer (quick actions + chat)
│   ├── canvas/                       [Phase 2 — Feature 4] Canvas mode components
│   │   ├── CanvasView.tsx            Infinite 2D canvas — pan (middle-mouse / Space+drag),
│   │   │                             zoom (Ctrl+scroll, 25%–200%, cursor-centred),
│   │   │                             renders all blocks as <CanvasBlock>, mounts CanvasToolbar
│   │   ├── CanvasBlock.tsx           Single draggable/resizable block on the canvas.
│   │   │                             Drag via pointer-capture on header; resize via bottom-right
│   │   │                             handle. Content: mini TipTap (text/sticky), static heading,
│   │   │                             image, or placeholder for unsupported types.
│   │   └── CanvasToolbar.tsx         Fixed bottom-centre toolbar: Add Text, Add Sticky,
│   │                                 Zoom −/%, Zoom +, ← Document
│   ├── properties/                   [Phase 2 — Feature 2] Typed metadata fields
│   │   ├── PropertyBar.tsx           Pill row of property fields below the page title.
│   │   │                             Accepts customPageTypeId prop — filters definitions to
│   │   │                             globals + definitions scoped to that type only.
│   │   └── PropertyValue.tsx         Per-type value display + inline editor (select, date, etc.)
│   ├── workspace/                    [Phase 2 — Feature 5] Custom page type management
│   │   └── CustomPageTypeManager.tsx Popover panel: list / create / rename / delete
│   │                                 CustomPageTypes for the current workspace.
│   │                                 Triggered by the Layers button in Sidebar footer.
│   └── ui/
│       ├── Button.tsx                Base button (variant: primary / ghost / danger)
│       ├── Input.tsx                 Base input with label + error state
│       ├── DropdownMenu.tsx          Generic dropdown (used by Sidebar new-page button,
│       │                             PropertyBar "...", CustomPageTypeManager "...")
│       └── ThemeToggle.tsx           Dark / light mode toggle (writes .light class to <html>)
│
├── hooks/
│   ├── useWorkspace.ts               useWorkspaces, useWorkspace, useCreateWorkspace,
│   │                                 useUpdateWorkspace, useDeleteWorkspace
│   ├── usePages.ts                   usePages, useCreatePage, useUpdatePage, useDeletePage
│   ├── useBlocks.ts                  useBlocks, useCreateBlock, useUpdateBlock, useDeleteBlock
│   ├── useProperties.ts              usePropertyDefinitions, usePropertyValues,
│   │                                 useCreateDefinition, useUpdateDefinition,
│   │                                 useDeleteDefinition, useUpsertValue
│   └── useCustomPageTypes.ts         [Feature 5] useCustomPageTypes, useCreateCustomPageType,
│                                     useUpdateCustomPageType, useDeleteCustomPageType
│                                     Query key: ['custom-page-types', workspaceId]
│
├── lib/
│   ├── api.ts                        Axios instance + authApi, workspaceApi, pageApi,
│   │                                 blockApi, aiApi, relationsApi, propertyApi,
│   │                                 customPageTypeApi (Feature 5)
│   │                                 customPageTypeApi: list / create / update / delete
│   │                                 → /api/properties/custom-types/
│   ├── auth.ts                       In-memory access token + session flag cookie helpers
│   ├── store.ts                      Zustand store — AuthSlice, WorkspaceSlice, UISlice
│   ├── queryClient.tsx               React Query QueryClient config + <Providers> wrapper
│   ├── slashEventBus.ts              Module-level pub/sub — bridges SlashCommand.ts → Editor.tsx
│   └── pageLinkEventBus.ts          [Phase 2] Module-level pub/sub — bridges
│                                     PageLink.ts (suggestion) → Editor.tsx (popup state)
│                                     Events: pagelink:open, pagelink:keydown, pagelink:close
│
├── types/
│   └── index.ts                      All TypeScript interfaces (mirrors Django models):
│                                     User, Workspace, Page, Block, AiAction,
│                                     Connection, BacklinkPage, PropertyDefinition,
│                                     PropertyValue, CustomPageType (Feature 5)
│                                     Page now includes: custom_page_type?: string | null
│                                     CreatePagePayload + UpdatePagePayload include same field
│
└── middleware.ts                     Edge runtime — redirects unauthenticated users
                                      (checks has_session cookie; no JWT validation)
```

---

## 3. WHERE TO FIND THINGS

| Task | File | Where in file |
|------|------|---------------|
| Add a slash menu command | `src/components/editor/SlashMenu.tsx` | `COMMANDS` array |
| Change editor extensions | `src/components/editor/Editor.tsx` | `TIPTAP SETUP` section → `extensions: [...]` |
| Change toolbar buttons | `src/components/editor/Editor.tsx` | `TOOLBAR COMPONENTS` section |
| Change autosave delay (500ms) | `src/components/editor/Editor.tsx` | `useAutosave` hook → `setTimeout(..., 500)` |
| Change sidebar width (260px) | `src/components/sidebar/Sidebar.tsx` → `w-[260px]` | `src/app/(app)/AppShellClient.tsx` → `md:ml-[260px]` |
| Add a new API endpoint | `src/lib/api.ts` | Add method to the relevant `*Api` object |
| Add a new React Query hook | `src/hooks/use*.ts` | Follow the `useQuery` / `useMutation` pattern |
| Add global Zustand state | `src/lib/store.ts` | Add to the relevant slice interface + `create()` call |
| Change global styles | `src/app/globals.css` | — |
| Change editor block styles | `src/app/globals.css` | Section 6 — `.tiptap-editor .ProseMirror *` selectors |
| Change slash menu styles | `src/app/globals.css` | `.slash-menu*` selectors |
| Change auth flow | `src/lib/auth.ts` | Token helpers |
| Change route protection | `src/middleware.ts` | — |
| Change page title autosave | `src/app/(app)/[workspaceId]/[pageId]/page.tsx` | `handleTitleChange` |
| Change AI quick actions | `src/components/ai/AiPanel.tsx` | `QUICK_ACTIONS` array |
| Change AI models/providers | `Apps/ai_agent/services.py` | `PROVIDERS` dict and `ACTION_MODELS` |
| Add a workspace color | `src/app/globals.css` → `[data-workspace-color="*"]` | `src/types/index.ts` |
| Change code block theme | `src/components/editor/extensions/CustomCodeBlock.ts` | `lowlight` config |
| Change toggle block behavior | `src/components/editor/extensions/ToggleBlock.ts` | — |
| **Add page link styles** | `src/app/globals.css` | `:root, .dark` block → `--violet*` variables; Section 6 → `.page-link-node` |
| **Change page link popup UI** | `src/components/editor/PageLinkPopup.tsx` | `MAX_RESULTS`, `POPUP_HEIGHT`, JSX render section |
| **Change page link trigger char** | `src/components/editor/extensions/PageLink.ts` | `PageLinkSuggestion` → `char: '[['` |
| **Add / remove page link extension** | `src/components/editor/Editor.tsx` | `TIPTAP SETUP` section → `PageLinkNode, PageLinkSuggestion` |
| **Change backlinks query / UI** | `src/app/(app)/[workspaceId]/[pageId]/page.tsx` | `BacklinksPanel` component at bottom of file |
| **Change backlinks API endpoint** | `src/lib/api.ts` | `pageApi.backlinks()` |
| **Add page link backend logic** | `Apps/relations/views.py` | `ConnectionCreateView`, `PageBacklinksView` |
| **Change page link event names** | `src/lib/pageLinkEventBus.ts` | `PageLinkEventMap` type — then update `PageLink.ts` + `Editor.tsx` |
| **Change canvas toolbar buttons** | `src/components/canvas/CanvasToolbar.tsx` | JSX render section — add/remove `ToolbarButton` / `ToolbarIconButton` |
| **Change canvas block appearance** | `src/components/canvas/CanvasBlock.tsx` | Card wrapper `className` · sticky variant classes · selected border/shadow |
| **Change canvas pan/zoom behaviour** | `src/components/canvas/CanvasView.tsx` | `MIN_SCALE` / `MAX_SCALE` constants · wheel handler factor (0.9 / 1.1) · `panStartRef` logic |
| **Toggle canvas/document mode** | `src/app/(app)/[workspaceId]/[pageId]/page.tsx` | View-mode toggle button (after AI button) · `isCanvas` derived const |
| **Create / manage custom page types** | `src/components/sidebar/Sidebar.tsx` | Layers button in footer → toggles `customTypeManagerOpen` → renders `<CustomPageTypeManager>` |
| **Change custom type manager UI** | `src/components/workspace/CustomPageTypeManager.tsx` | Full component — list, create form, rename, delete |
| **Add a new page with a custom type** | `src/components/sidebar/Sidebar.tsx` | `newPageMenuItems` array → one item per `customTypes` entry → `handleCreatePage(null, type.id)` |
| **Change property filtering logic** | `src/components/properties/PropertyBar.tsx` | `visibleDefinitions` filter — `is_global \|\| custom_page_type === customPageTypeId` |
| **Change which custom type a page uses** | `PATCH /api/pages/:id/` with `{ custom_page_type: uuid }` | `UpdatePagePayload` in `src/types/index.ts` |
| **Add fields to CustomPageType model** | `Apps/properties/models.py` → `CustomPageType` | Then: run migration · update `CustomPageTypeSerializer` · update `CustomPageType` interface in `types/index.ts` |

---

## 4. FILE RELATIONSHIPS

> Format: if you change **FILE A** → also check **FILE B**

| Change in | Also check |
|-----------|-----------|
| `src/lib/slashEventBus.ts` event names | `extensions/SlashCommand.ts` (emits) · `Editor.tsx` (listens) |
| `src/lib/pageLinkEventBus.ts` event names | `extensions/PageLink.ts` (emits) · `Editor.tsx` (listens) |
| `src/components/editor/extensions/PageLink.ts` node name (`'pageLink'`) | `Editor.tsx` → `handlePageLinkSelect` → `insertContent({ type: 'pageLink' })` |
| `src/components/editor/extensions/PageLink.ts` attribute names | `Editor.tsx` → `handlePageLinkSelect` attrs · `globals.css` → `span[data-page-id]` |
| `src/components/editor/PageLinkPopup.tsx` `PageLinkPopupHandle` interface | `Editor.tsx` → `pageLinkPopupRef` type |
| `src/components/editor/Editor.tsx` `EditorProps` | `src/app/(app)/[workspaceId]/[pageId]/page.tsx` → `<Editor .../>` call |
| `src/lib/api.ts` `relationsApi.createLink` signature | `Editor.tsx` → `handlePageLinkSelect` call |
| `src/lib/api.ts` `pageApi.backlinks` signature | `[pageId]/page.tsx` → `BacklinksPanel` → `useQuery` |
| `src/types/index.ts` `BacklinkPage` shape | `src/lib/api.ts` return type · `[pageId]/page.tsx` → `BacklinksPanel` |
| `src/types/index.ts` `Connection` shape | `src/lib/api.ts` → `relationsApi.createLink` return type |
| `Apps/relations/views.py` response shape | `src/types/index.ts` `BacklinkPage` · `src/lib/api.ts` `pageApi.backlinks` |
| `Apps/relations/urls.py` URL patterns | `src/lib/api.ts` hardcoded paths (`/api/relations/`, `/api/relations/pages/.../backlinks/`) |
| `globals.css` `.page-link-node` class name | `extensions/PageLink.ts` → `renderHTML` → `class: 'page-link-node'` · `Editor.tsx` → `handleEditorClick` → `closest('.page-link-node')` |
| `globals.css` `--violet*` variable names | Any component using `var(--violet*)` directly |
| `src/hooks/usePages.ts` return shape | `Editor.tsx` → `usePages(workspaceId)` → passed as `pages` to `PageLinkPopup` |
| `src/components/canvas/CanvasView.tsx` | `CanvasBlock.tsx` (renders one per block) · `CanvasToolbar.tsx` (toolbar at bottom) |
| `src/components/canvas/CanvasBlock.tsx` | `src/hooks/useBlocks.ts` → `useUpdateBlock` (drag-end + resize-end PATCH) · `@tiptap/react` (`useEditor` in `TextContent`) |
| `src/app/(app)/[workspaceId]/[pageId]/page.tsx` (canvas conditional) | `src/components/canvas/CanvasView.tsx` · `src/hooks/usePages.ts` → `useUpdatePage` (view_mode toggle) |
| `src/components/workspace/CustomPageTypeManager.tsx` | `src/hooks/useCustomPageTypes.ts` (all 4 hooks) · `src/components/ui/DropdownMenu.tsx` (row "..." menu) |
| `src/components/sidebar/Sidebar.tsx` (new-page dropdown) | `src/hooks/useCustomPageTypes.ts` · `handleCreatePage` signature (now accepts `customPageTypeId`) · `src/types/index.ts` `CreatePagePayload.custom_page_type` |
| `src/components/sidebar/Sidebar.tsx` (Layers button) | `src/components/workspace/CustomPageTypeManager.tsx` · `customTypeManagerOpen` local state |
| `src/components/properties/PropertyBar.tsx` `customPageTypeId` prop | `src/app/(app)/[workspaceId]/[pageId]/page.tsx` → `<PropertyBar customPageTypeId={page.custom_page_type ?? null}>` |
| `src/components/properties/PropertyBar.tsx` `visibleDefinitions` filter | `src/types/index.ts` `PropertyDefinition.custom_page_type` · `PropertyDefinition.is_global` |
| `Apps/properties/models.py` `CustomPageType` fields | Run `makemigrations` + `migrate` · `Apps/properties/serializers.py` `CustomPageTypeSerializer` · `src/types/index.ts` `CustomPageType` interface · `src/lib/api.ts` `customPageTypeApi` payload types |
| `Apps/pages/models.py` `Page.custom_page_type` FK | `Apps/pages/serializers.py` (all 4 serializers) · `src/types/index.ts` `Page.custom_page_type` · `[pageId]/page.tsx` → `<PropertyBar customPageTypeId>` |
| `Apps/properties/urls.py` custom-types routes | `src/lib/api.ts` `customPageTypeApi` hardcoded paths (`/api/properties/custom-types/`) |

---

## 5. DATA FLOW

### Block save
```
User types in editor
  → TipTap onUpdate fires
      → triggerSaveRef.current() (500ms debounce via useAutosave)
           → editor.getJSON() → serialized TipTap doc
                → useUpdateBlock.mutateAsync({ id, payload: { content: { json } } })
                     → PATCH /api/blocks/:id/
                          → React Query invalidates ['blocks', pageId]
```

### Login
```
User submits login form
  → authApi.login({ email, password })
       → POST /api/auth/login/
            → Django returns { user, access, refresh }
                 → setAccessToken(access) — stored in memory variable (XSS-safe)
                 → Cookies.set('has_session', 'true') — non-httpOnly, read by middleware
                 → setUser(user) → Zustand AuthSlice
                      → router.push('/workspace') → middleware sees cookie → allows through
```

### New page creation (with custom type)
```
User clicks "New page" dropdown in Sidebar
  → DropdownMenu renders: "New page" + one item per CustomPageType
       → user clicks "New Client"
            → handleCreatePage(null, type.id)
                 → createPage.mutateAsync({ title: 'Untitled', page_type: 'note',
                                            custom_page_type: type.id })
                      → POST /api/pages/ with { workspace, title, page_type, custom_page_type }
                           → Django returns new Page object with custom_page_type set
                                → queryClient.invalidateQueries(['pages', workspaceId])
                                     → router.push(`/${workspaceId}/${newPage.id}`)
                                          → [pageId]/page.tsx loads page
                                               → <PropertyBar customPageTypeId={page.custom_page_type}>
                                                    → visibleDefinitions filters to
                                                       globals + definitions for this type only
```

### Page link insert (Phase 2)
```
User types "[[" in editor
  → PageLinkSuggestion (PageLink.ts) detects trigger via @tiptap/suggestion
       → pageLinkEventBus.emit('pagelink:open', { query: '', rect, range })
            → Editor.tsx useEffect listener fires
                 → setPageLinkOpen(true), stores range in pageLinkRangeRef
                      → <PageLinkPopup> renders at cursor position (portal on document.body)
                           → filters workspacePages (loaded by usePages(workspaceId) in Editor)

User types "react" → each keystroke re-fires pagelink:open with updated query + range
  → popup filters pages by title.includes('react')

User presses Enter (or clicks result)
  → pageLinkEventBus.emit('pagelink:keydown', { event }) (for keyboard path)
       → pageLinkPopupRef.current.onKeyDown(event) → popup calls onSelect(page)
            → handlePageLinkSelect(page) in Editor.tsx
                 → editor.chain().deleteRange(range).insertContent({ type: 'pageLink', attrs })
                 → setPageLinkOpen(false)
                 → relationsApi.createLink(pageId, page.id)
                      → POST /api/relations/ → Connection row upserted in Django DB

User clicks [[Page Title]] chip in editor
  → handleEditorClick → closest('.page-link-node')
       → router.push(`/${workspaceId}/${linkedPageId}`)
            → target page loads → BacklinksPanel mounts
                 → useQuery(['backlinks', pageId]) → pageApi.backlinks(pageId)
                      → GET /api/relations/pages/:id/backlinks/
                           → returns [{ source_page_id, source_page_title, ... }]
                                → "Linked from" section renders at bottom of target page
```

### Token refresh (transparent)
```
Any API call returns 401
  → axios response interceptor fires
       → POST /api/auth/refresh/ (sends httpOnly refresh cookie)
            → Django returns { access: newToken }
                 → setAccessToken(newToken)
                 → replay original failed request with new token
                 → if refresh also fails → clearAccessToken() + redirect /login
```

---

## 6. KNOWN ISSUES

| Issue | File to fix | Notes |
|-------|-------------|-------|
| Backlinks are append-only — deleting a `[[link]]` chip does not remove the `Connection` row | `Apps/relations/views.py` + `Editor.tsx` `onSave` | Fix: on each save, diff current page link nodes against stored connections and DELETE stale ones |
| Block handle "+" only adds paragraph — no drag-to-reorder | `Editor.tsx` EVENT HANDLERS · `BlockWrapper.tsx` | Requires ProseMirror DnD integration — separate task |
| Voice transcription endpoint `/api/ai/transcribe/` may not exist yet | `Editor.tsx` `startWhisperRecording()` | Whisper path is a fallback for non-Chrome browsers |
| `sidebarCollapsed` rail mode (48px) has no expand button in rail view | `Sidebar.tsx` | Currently only the hamburger in AppShellClient can reopen |
| Image uploads are base64 only — no server storage | `Editor.tsx` `handlePaste` / `handleDrop` | Feature 4: upload to Django media, store URL in block |
| Mobile sidebar overlay closes on nav but no swipe-to-open gesture | `Sidebar.tsx` | Low priority — app is primarily desktop |
| `[[` suggestion `allowSpaces: true` means the popup stays open across word boundaries | `extensions/PageLink.ts` → `PageLinkSuggestion` | If this causes UX issues, set `allowSpaces: false` and require single-word queries |
| Canvas drag coordinates are in unscaled canvas-space but pointer deltas are in screen-space — at zoom ≠ 1 blocks drift from the cursor | `CanvasBlock.tsx` `onDragMove` | Fix: divide delta by `scale` before applying. Currently drag is only smooth at 100% zoom |
| Canvas `CanvasBlock` drag uses screen-space deltas instead of canvas-space | `CanvasBlock.tsx` `onDragMove` | `localX += (e.clientX - startMX) / scale` — scale factor not currently passed to CanvasBlock |
| Resize handle bottom-right corner is hidden behind other absolutely-positioned blocks | `CanvasBlock.tsx` | Bring selected block to front by bumping its `zIndex` above `canvas_z` while selected |
| `onResizeEnd` always passes `h=0` (auto-height sentinel) — `canvas_h` is never persisted for text/sticky blocks | `CanvasBlock.tsx` `onResizeUp` | By design for now: height is content-driven. Explicit height resize requires tracking `localH` state |
| `CanvasToolbar` uses `position: fixed` which is relative to the viewport, not the canvas container — safe for now but breaks in CSS `transform` ancestors | `CanvasToolbar.tsx` | No ancestor has `transform` currently; would need `position: absolute` + bottom-centre calculation if layout changes |
| Canvas mode — light mode text colors broken (block text, headings, placeholders render invisible) | `src/app/globals.css` | Add `.light` overrides for `.canvas-block` text, heading, and placeholder colors |
| Document mode — blocks only flow up/down; left/right drag is indent/outdent for list items only | By design | Document mode is linear flow (like Notion). True free-form 2D positioning requires canvas mode |
| Canvas mode — no connection lines between blocks | Phase 3 planned | Add arrow/edge connections between canvas blocks |
| Canvas mode — no minimap | Phase 3 planned | Small overview map in corner showing block positions at a glance |
| **Custom page types — no UI to assign a type to an existing page** | `[pageId]/page.tsx` or `PropertyBar.tsx` | Currently `custom_page_type` can only be set at page creation time via the sidebar dropdown. A "Change type" option in the page `...` menu or in `PropertyBar` would let users reassign types after creation |
| **Custom page types — deleting a type sets `custom_page_type = null` on all its pages** | `Apps/pages/models.py` `SET_NULL` | By design (safe cascade). Pages become type-less; their scoped definitions are hidden by `visibleDefinitions` filter until a new type is assigned |
| **Custom page types — `description` field captured but not displayed anywhere** | `CustomPageTypeManager.tsx` | The `description` field is stored and returned by the API but the manager UI does not expose an input for it yet |
| **Custom page type definitions are hidden on pages with no type set** | `PropertyBar.tsx` `visibleDefinitions` | When `customPageTypeId` is `null`, only global + unscoped definitions show. Scoped definitions are invisible until a type is assigned to the page |
