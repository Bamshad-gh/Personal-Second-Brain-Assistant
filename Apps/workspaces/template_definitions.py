"""
Apps/workspaces/template_definitions.py

What:   Pure Python data file — no ORM imports, no side effects.
        Defines the master list of built-in workspace templates that are
        seeded automatically when a new Workspace is created (via signals.py)
        and can also be applied manually via the seed-templates endpoint.

How to add a new template
─────────────────────────
Copy the dict structure below and append it to WORKSPACE_TEMPLATES.
Each template dict must have:
  name          (str)  — unique per workspace; drives the "Already added" check
  icon          (str)  — single emoji shown in the UI card
  description   (str)  — one-line description shown in the UI card
  group_name    (str)  — name of the PageTypeGroup this template belongs to;
                         the seeder creates the group if it doesn't exist yet
  group_color   (str)  — hex color for the group's sidebar accent border;
                         ignored if the group already exists
  default_color (str)  — hex accent applied to pages of this type in the graph
                         and page header; stored on CustomPageType.default_color
  default_icon  (str)  — emoji used as graph node icon and sidebar fallback;
                         stored on CustomPageType.default_icon
  properties    (list) — ordered list of PropertyDefinition dicts (see below)

Each property dict must have:
  name      (str)  — display name of the property
  prop_type (str)  — one of the allowed types listed below
  order     (int)  — 1-based display order within the type
  options   (list) — list of {"label": str, "color": hex_str} dicts
                     REQUIRED for select/multi prop_types; empty list otherwise

Allowed prop_type values
─────────────────────────
  "text"         — plain text string
  "email"        — validated e-mail address
  "phone"        — phone number string
  "url"          — URL / link
  "number"       — numeric value (stored as float)
  "currency"     — monetary amount (stored as float, shown with currency symbol)
  "date"         — date/datetime picker
  "checkbox"     — boolean toggle
  "select"       — single-choice dropdown (requires options list)
  "multi"        — multi-choice tags   (requires options list)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MASTER TEMPLATE LIST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

WORKSPACE_TEMPLATES: list[dict] = [

    # ── CLIENT ────────────────────────────────────────────────────────────────
    # Tracks clients/contacts.  The "Email" field is the automation target:
    # future automated e-mail workflows look up this exact field by name.
    # ⚠️  NEVER change the Email prop_type to "text".
    # ⚠️  NEVER rename the "Email" property — automation depends on this name.
    {
        "name": "Client",
        "icon": "🤝",
        "description": "Track clients, contacts and deals",
        "group_name":    "People",    # sidebar group this type lives under
        "group_color":   "#60a5fa",   # blue accent border for the People group
        "default_color": "#60a5fa",   # blue — page header accent + graph node color
        "default_icon":  "🤝",        # emoji shown in graph node
        "properties": [
            # ⚠️ Automation target — do NOT change prop_type or rename.
            {
                "name": "Email",
                "prop_type": "email",
                "order": 1,
                "options": [],
            },
            {
                "name": "Phone",
                "prop_type": "phone",
                "order": 2,
                "options": [],
            },
            {
                "name": "Company",
                "prop_type": "text",
                "order": 3,
                "options": [],
            },
            {
                "name": "Status",
                "prop_type": "select",
                "order": 4,
                "options": [
                    {"label": "Lead",    "color": "#a78bfa"},  # violet
                    {"label": "Active",  "color": "#34d399"},  # green
                    {"label": "Churned", "color": "#94a3b8"},  # slate
                ],
            },
        ],
    },

    # ── PROJECT ───────────────────────────────────────────────────────────────
    # Tracks projects with kanban-style status, due date and priority.
    {
        "name": "Project",
        "icon": "📋",
        "description": "Manage projects with status, due date and priority",
        "group_name":    "Business",  # sidebar group this type lives under
        "group_color":   "#34d399",   # green accent border for the Business group
        "default_color": "#34d399",   # green — page header accent + graph node color
        "default_icon":  "📋",        # emoji shown in graph node
        "properties": [
            {
                "name": "Status",
                "prop_type": "select",
                "order": 1,
                "options": [
                    {"label": "Planning", "color": "#a78bfa"},  # violet
                    {"label": "Active",   "color": "#60a5fa"},  # blue
                    {"label": "On Hold",  "color": "#fbbf24"},  # amber
                    {"label": "Done",     "color": "#34d399"},  # green
                ],
            },
            {
                "name": "Due Date",
                "prop_type": "date",
                "order": 2,
                "options": [],
            },
            {
                "name": "Priority",
                "prop_type": "select",
                "order": 3,
                "options": [
                    {"label": "Low",    "color": "#34d399"},  # green
                    {"label": "Medium", "color": "#fbbf24"},  # amber
                    {"label": "High",   "color": "#f87171"},  # red
                ],
            },
        ],
    },

    # ── INVOICE ───────────────────────────────────────────────────────────────
    # Tracks invoices and payment status.
    # ⚠️  NEVER rename "Client Email" — future automation sends invoices to
    #     this address automatically.  Do NOT change its prop_type.
    {
        "name": "Invoice",
        "icon": "🧾",
        "description": "Track invoices and payment status",
        "group_name":    "Business",  # same group as Project
        "group_color":   "#34d399",   # green accent border (shared with Business group)
        "default_color": "#f59e0b",   # amber — page header accent + graph node color
        "default_icon":  "🧾",        # emoji shown in graph node
        "properties": [
            {
                "name": "Amount",
                "prop_type": "number",
                "order": 1,
                "options": [],
            },
            {
                "name": "Status",
                "prop_type": "select",
                "order": 2,
                "options": [
                    {"label": "Draft",   "color": "#94a3b8"},  # slate
                    {"label": "Sent",    "color": "#60a5fa"},  # blue
                    {"label": "Paid",    "color": "#34d399"},  # green
                    {"label": "Overdue", "color": "#f87171"},  # red
                ],
            },
            {
                "name": "Due Date",
                "prop_type": "date",
                "order": 3,
                "options": [],
            },
            # ⚠️ Automation target — do NOT rename or change prop_type.
            {
                "name": "Client Email",
                "prop_type": "email",
                "order": 4,
                "options": [],
            },
        ],
    },
]
