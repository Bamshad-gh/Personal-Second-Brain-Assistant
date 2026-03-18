 Personal Second Brain Assistant

  A privacy-first, open-source workspace OS for solopreneurs and freelancers.  
  Imagine Notion's simplicity + Anytype's privacy + Business tools.

  Django  Next.js  TypeScript  PostgreSQL
🎯 The Problem & The Solution

The Problem: Modern knowledge workers juggle dozens of SaaS tools (Notion, Trello, Google Docs), leading to data silos, subscription fatigue, and loss of privacy.

The Solution: A unified "Second Brain" that combines:

    📝 Document Editing (Block-based, Notion-style).
    🎨 Infinite Canvas (Visual thinking like Miro/Obsidian Canvas).
    🗄️ Relational Database (Properties, backlinks, and custom types).
    🔒 Privacy First (Self-hosted, you own your data).

✨ Key Features
Feature	Description
🔐 Secure Auth System	Custom AbstractBaseUser (email-only login), JWT access tokens + HttpOnly refresh cookies.
📄 Block-Based Editor	A rich text editor built with TipTap 2, supporting slash commands (/), code blocks, toggles, and drag-and-drop.
🌌 Infinite Canvas	A pan-and-zoom canvas mode for visual thinking. Blocks can exist in the document or on the canvas.
🔗 Bi-directional Linking	Link pages using [[ syntax. Automatic backlinks create a knowledge graph.
📊 Property System	Add schema to pages with custom properties (Date, Select, URL, Number) and define Custom Page Types.
🤖 AI Ready	Backend integrated with Claude API (Haiku/Sonnet) for future AI-assisted writing and automation.
🛠️ Tech Stack & Architecture

This is a full-stack monorepo project designed for scale and performance.

Backend (Django 5)

    API: Django REST Framework (DRF).
    Database: PostgreSQL with UUID primary keys for security.
    Async Task Queue: Redis + Celery (configured for background jobs).
    Architecture: Modular "Apps" structure (accounts, pages, blocks, ai_agent).

Frontend (Next.js)

    Framework: Next.js App Router (Server Components + Client Components).
    State Management: Zustand (Global State) + TanStack Query (Server State).
    Styling: Tailwind CSS with CSS variables for dark/light mode.
    Editor: TipTap 2 (ProseMirror wrapper) with custom extensions (SlashCommand, PageLink).
