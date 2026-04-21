# 🧠 SecondBrain AI Assistant

> A personal workspace OS for developers and solopreneurs — built with Django, Next.js, and multi-agent AI.

![Stack](https://img.shields.io/badge/Django-5.0-green) ![Next.js](https://img.shields.io/badge/Next.js-15-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue) ![AI](https://img.shields.io/badge/AI-Claude%20%7C%20Groq%20%7C%20OpenAI-violet)

## What I Built

A full-stack intelligent workspace combining document editing, infinite canvas mind mapping, AI agents, and a knowledge graph — designed from the ground up as a production system.

**This is not a tutorial project.** Every architectural decision is intentional and production-ready.

---

## Technical Highlights

### 🏗 Architecture
- **Django 5 + DRF** backend with UUID primary keys, soft-delete patterns, and ownership-via-404 security
- **Next.js 15 App Router** with TypeScript, Zustand, TanStack Query, and optimistic updates
- **Multi-provider AI system** — swap between Anthropic Claude, OpenAI, and Groq with one config change
- **Quota enforcement** — per-user daily limits with tier system (free/pro/unlimited), enforced server-side

### ✏️ Document Editor
- Custom **TipTap 2** extensions: slash commands (`/`), bi-directional page linking (`[[`), page link chips
- Real-time **autosave** with 500ms debounce and optimistic cache updates
- **Voice-to-text** via Web Speech API (Chrome) and Whisper fallback
- Block-level canvas sharing — documents and canvas share the same block model

### ∞ Infinite Canvas
- **Pan/zoom** with pointer capture and transform matrix
- **Real-time position persistence** — debounced saves on every pointer move, guaranteed save on release
- **Connection arrows** — SVG bezier curves with directed/undirected modes, flow animations, labels
- **Rich blocks** — full TipTap editor inside canvas blocks with independent slash command bus
- **ResizeObserver** for accurate edge handle positioning on dynamically-sized blocks

### 🤖 AI Agents
- **13 actions** across text and code categories — all driven by a single `ACTION_DEFINITIONS` dict
- Adding a new AI action = one dict entry. No other changes required.
- **Persistent chat memory** per page per user with auto-compaction at 50 messages
- **RAG-ready architecture** — ChromaDB + embeddings planned for workspace-wide semantic search
- Floating selection popup, code block toolbar, context-aware AI panel

### 🕸 Knowledge Graph
- D3-force directed graph of all pages and their connections
- Auto-syncs on every page link insert or delete via `_sync_page_links()`
- Nodes colored by page type, searchable, click-to-navigate

### 🔒 Security & Data Model
- Soft-delete everywhere — nothing is ever hard deleted
- Ownership enforced via `get_object_or_404` — returns 404 not 403 (no information leakage)
- 12-word wallet encryption architecture planned (fields already scaffolded)

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Django 5, DRF, PostgreSQL, JWT auth |
| Frontend | Next.js 15, TypeScript, TipTap 2, Zustand, TanStack Query |
| AI | Anthropic Claude, Groq (Llama), OpenAI — pluggable provider system |
| Canvas | Custom pointer event system, SVG bezier, ResizeObserver |
| Graph | D3-force, custom sync pipeline |
| Deployment | Railway (Django) + Vercel (Next.js) |

---

## Features

- 📝 Rich document editor with slash commands and page linking
- ∞ Infinite canvas with mind mapping and connection arrows
- 🤖 AI agents — summarize, expand, explain code, change tone, translate, chat
- 🕸 Knowledge graph — visual map of all pages and connections
- 📋 Page types with custom properties (Client, Project, Invoice templates)
- 🎨 Block colors, cover images, page themes
- 🔊 Voice-to-text input
- 📊 Admin monitoring with per-user AI quota management

---

## Architecture Decisions Worth Noting

**Why one content block per page?**
TipTap manages ordering internally. Individual block DB rows would require a custom collaborative editing layer — planned for Phase 2 with X/Y positioning.

**Why soft-delete everywhere?**
Audit trail, undo capability, and future version history. Every deletion is reversible.
<<<<<<< HEAD
=======

**Why ownership-via-404 instead of 403?**
Information leakage prevention. A 403 confirms the resource exists.

**Why a pluggable AI provider system?**
Provider landscape changes fast. Swapping from OpenAI to Groq or a self-hosted model should be a config change, not a refactor.

---
<img width="1047" height="583" alt="screenshot3" src="https://github.com/user-attachments/assets/b5eb9f3c-dac5-4ba7-a818-47665817a2dc" />
<img width="1207" height="622" alt="P-SCREENSHOT2" src="https://github.com/user-attachments/assets/48cc14ec-b4b3-44fc-9e6a-a9f5c8553975" />
<img width="247" height="893" alt="P-screenshot1" src="https://github.com/user-attachments/assets/b921d563-6c9a-4839-90a4-74db45f2b98b" />


**Why ownership-via-404 instead of 403?**
Information leakage prevention. A 403 confirms the resource exists.

**Why a pluggable AI provider system?**
Provider landscape changes fast. Swapping from OpenAI to Groq or a self-hosted model should be a config change, not a refactor.

---

## Roadmap

- [ ] Fix bugs
- [ ] improve AI
- [ ] Add more features

---

## Running Locally
```bash
# Backend
cd SecondBrainAiAssistant
python -m venv venv && venv/Scripts/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver

# Frontend
cd my-frontend
npm install
npm run dev
```

Set up `.env` with `SECRET_KEY`, `ANTHROPIC_API_KEY` or `GROQ_API_KEY`, and `AI_PROVIDER`.

---

*Built end-to-end by [Bamshad Ghafouriyan](https://linkedin.com/in/bamshad-ghafouriyan) — Full Stack Developer, Canada*

<<<<<<< HEAD
      
=======
## Roadmap
>>>>>>> 8ac9edd107b3e32bf20414c2ed7935a7bec4cf8f

- [ ] Fix bugs
- [ ] improve AI
- [ ] Add more features

---

## Running Locally
```bash
# Backend
cd SecondBrainAiAssistant
python -m venv venv && venv/Scripts/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver

# Frontend
cd my-frontend
npm install
npm run dev
```

Set up `.env` with `SECRET_KEY`, `ANTHROPIC_API_KEY` or `GROQ_API_KEY`, and `AI_PROVIDER`.

---

*Built end-to-end by [Bamshad Ghafouriyan](https://linkedin.com/in/bamshad-ghafouriyan) — Full Stack Developer, Canada*
