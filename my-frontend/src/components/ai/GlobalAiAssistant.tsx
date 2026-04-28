/**
 * components/ai/GlobalAiAssistant.tsx
 *
 * Floating AI chat button + expandable panel accessible from anywhere in the app.
 * Has access to all workspace pages via GET /api/workspaces/:id/context/.
 * Uses the same agent/chat system as the page-level AiPanel.
 *
 * Chat history is persisted to localStorage (per workspace) and auto-compacted
 * when it exceeds MAX_MESSAGES so context stays manageable.
 *
 * UI: violet sparkle button fixed bottom-right → expands to 500px chat panel.
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, X, Send, Minimize2, Trash2 } from 'lucide-react';
import { aiApi, workspaceApi, blockApi } from '@/lib/api';
import type { AiChatMessage } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_MESSAGES  = 60;  // compact when history exceeds this
const KEEP_MESSAGES = 40;  // keep the most recent N after compaction

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Message {
  role:    'user' | 'assistant';
  content: string;
}

interface PendingAction {
  action:  string;
  params:  Record<string, unknown>;
  message: string;
}

interface GlobalAiAssistantProps {
  workspaceId:    string;
  currentPageId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// localStorage helpers
// ─────────────────────────────────────────────────────────────────────────────

function storageKey(workspaceId: string) {
  return `global-ai-msgs-${workspaceId}`;
}

function loadMessages(workspaceId: string): Message[] {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as Message[]).filter(
      (m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
    );
  } catch {
    return [];
  }
}

function saveMessages(workspaceId: string, msgs: Message[]) {
  try {
    // Auto-compact — keep only the most recent KEEP_MESSAGES entries
    const toSave = msgs.length > MAX_MESSAGES ? msgs.slice(-KEEP_MESSAGES) : msgs;
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(toSave));
  } catch {
    // localStorage full or unavailable — fail silently
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function GlobalAiAssistant({ workspaceId, currentPageId }: GlobalAiAssistantProps) {
  const [isOpen,        setIsOpen]        = useState(false);
  const [messages,      setMessages]      = useState<Message[]>(() => loadMessages(workspaceId));
  const [input,         setInput]         = useState('');
  const [loading,       setLoading]       = useState(false);
  const [searchingHint, setSearchingHint] = useState(false);
  const [agentMode,     setAgentMode]     = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [executing,     setExecuting]     = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const queryClient    = useQueryClient();

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    saveMessages(workspaceId, messages);
  }, [workspaceId, messages]);

  // Reload history when workspaceId changes (switching workspaces)
  useEffect(() => {
    setMessages(loadMessages(workspaceId));
    setPendingAction(null);
  }, [workspaceId]);

  // Fetch workspace context — all pages as plain text, 5-min cache
  const { data: wsContext } = useQuery({
    queryKey: ['workspace-context', workspaceId],
    queryFn:  () => workspaceApi.getContext(workspaceId),
    staleTime: 1000 * 60 * 5,
    enabled:   isOpen && !!workspaceId,
  });

  // Auto-scroll to bottom on new messages or pending action
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingAction]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  // ── Helper: update messages and persist in one call ───────────────────────

  const pushMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      saveMessages(workspaceId, next);
      return next;
    });
  }, [workspaceId]);

  // ── Clear history ─────────────────────────────────────────────────────────

  function clearHistory() {
    setMessages([]);
    setPendingAction(null);
    try { localStorage.removeItem(storageKey(workspaceId)); } catch { /* ignore */ }
  }

  // ── Send message ──────────────────────────────────────────────────────────

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: 'user', content: text };
    const nextMessages     = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    // Show a "searching" hint if the request takes longer than 1.5 s
    // (agent mode may do a server-side web search before responding)
    const searchHintTimer = setTimeout(() => setSearchingHint(true), 1500);

    const historyPayload: AiChatMessage[] = nextMessages.map((m) => ({
      role:    m.role,
      content: m.content,
    }));

    const context = wsContext?.context ?? '';

    try {
      if (agentMode) {
        const response = await aiApi.agentChat({
          messages: historyPayload,
          context,
          page_id:  currentPageId,
        });
        pushMessage({ role: 'assistant', content: response.message });

        // web_search is server-only — never surface it as a user-confirmable action
        if (response.type === 'action' && response.action && response.action !== 'web_search') {
          setPendingAction({
            action:  response.action,
            params:  response.params ?? response.data ?? {},
            message: response.message,
          });
        }
      } else {
        const response = await aiApi.chat({
          messages: historyPayload,
          context,
          page_id:  currentPageId,
        });
        pushMessage({ role: 'assistant', content: response.reply });
      }
    } catch {
      pushMessage({ role: 'assistant', content: 'Sorry, something went wrong. Please try again.' });
    } finally {
      clearTimeout(searchHintTimer);
      setSearchingHint(false);
      setLoading(false);
    }
  }

  // ── Execute approved agent action ─────────────────────────────────────────

  async function executeAction() {
    if (!pendingAction) return;
    setExecuting(true);

    try {
      const { action, params } = pendingAction;

      if (action === 'create_page') {
        const p = params as {
          title?:  string;
          blocks?: { block_type: string; content: Record<string, unknown> }[];
        };
        const page = await aiApi.executeCreatePage({
          workspace_id: workspaceId,
          title:        p.title ?? 'Untitled',
          blocks:       p.blocks ?? [],
        });
        queryClient.invalidateQueries({ queryKey: ['pages', workspaceId] });
        pushMessage({ role: 'assistant', content: `✓ Page "${page.title}" created. Check your sidebar.` });

      } else if (action === 'add_blocks') {
        const p = params as {
          blocks?: { block_type: string; content: Record<string, unknown> }[];
        };
        if (!currentPageId) {
          pushMessage({
            role:    'assistant',
            content: 'Navigate to a page first, then I can add blocks to it.',
          });
        } else if (!p.blocks?.length) {
          pushMessage({ role: 'assistant', content: 'No blocks to add.' });
        } else {
          await aiApi.executeAddBlocks(currentPageId, p.blocks);
          queryClient.invalidateQueries({ queryKey: ['blocks', currentPageId] });
          pushMessage({
            role:    'assistant',
            content: `✓ Added ${p.blocks.length} block${p.blocks.length === 1 ? '' : 's'} to the current page.`,
          });
        }

      } else if (action === 'create_mindmap') {
        const p = params as {
          nodes?: { label?: string; text?: string; x?: number; y?: number }[];
        };
        if (!currentPageId) {
          pushMessage({
            role:    'assistant',
            content: 'Navigate to a page first, then I can create the mind map on its canvas.',
          });
        } else {
          const nodes = p.nodes ?? [];
          await Promise.all(
            nodes.map((node, i) =>
              blockApi.create(currentPageId, {
                block_type:     'text',
                content:        { text: node.label ?? node.text ?? `Node ${i + 1}` },
                canvas_x:       node.x ?? 80 + (i % 4) * 220,
                canvas_y:       node.y ?? 80 + Math.floor(i / 4) * 140,
                canvas_w:       180,
                canvas_visible: true,
                doc_visible:    false,
              }),
            ),
          );
          queryClient.invalidateQueries({ queryKey: ['blocks', currentPageId] });
          pushMessage({
            role:    'assistant',
            content: `✓ Mind map created with ${nodes.length} nodes on the canvas.`,
          });
        }

      } else if (action === 'remove_blocks') {
        const p = params as { block_ids?: string[]; reason?: string };
        const ids = p.block_ids ?? [];
        if (!currentPageId) {
          pushMessage({
            role:    'assistant',
            content: 'Navigate to a page first to remove blocks.',
          });
        } else if (ids.length === 0) {
          pushMessage({ role: 'assistant', content: 'No block IDs provided to remove.' });
        } else {
          await Promise.all(ids.map((id) => blockApi.delete(id)));
          queryClient.invalidateQueries({ queryKey: ['blocks', currentPageId] });
          pushMessage({
            role:    'assistant',
            content: `✅ Removed ${ids.length} block${ids.length === 1 ? '' : 's'} from the page.`,
          });
        }

      } else {
        pushMessage({
          role:    'assistant',
          content: `Action "${action}" is not supported here.`,
        });
      }
    } catch {
      pushMessage({ role: 'assistant', content: '✕ Action failed. Please try again.' });
    } finally {
      setPendingAction(null);
      setExecuting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Floating button ─────────────────────────────────────────────── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-12 w-12
                     items-center justify-center rounded-full
                     bg-violet-600 hover:bg-violet-500
                     shadow-lg shadow-violet-500/30
                     transition-all hover:scale-110 active:scale-95"
          title="Global AI Assistant"
        >
          <Sparkles size={20} className="text-white" />
        </button>
      )}

      {/* ── Chat panel ──────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="fixed bottom-6 right-6 z-50 flex flex-col
                     w-80 sm:w-96 rounded-2xl border border-neutral-700
                     bg-neutral-900 shadow-2xl shadow-black/50 overflow-hidden"
          style={{ height: '500px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3
                          border-b border-neutral-800 shrink-0">
            <div className="flex min-w-0 items-center gap-2">
              <div
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}
              >
                <Sparkles size={11} className="text-white" />
              </div>
              <span className="text-sm font-semibold text-neutral-200 shrink-0">
                AI Assistant
              </span>
              {wsContext && (
                <span className="text-[10px] text-neutral-600 shrink-0">
                  {wsContext.page_count} pages
                </span>
              )}
              {currentPageId && (
                <span className="text-[9px] text-violet-500/70 truncate">
                  · on page
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {/* Agent mode toggle */}
              <button
                onClick={() => { setAgentMode((v) => !v); setPendingAction(null); }}
                className={[
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold border transition-colors',
                  agentMode
                    ? 'bg-violet-600/30 text-violet-300 border-violet-500/50'
                    : 'border-neutral-700 text-neutral-500 hover:text-neutral-300',
                ].join(' ')}
                title="Agent mode — AI can create pages and add content"
              >
                {agentMode ? '⚡ Agent' : 'Agent'}
              </button>

              {/* Clear history */}
              {messages.length > 0 && (
                <button
                  onClick={clearHistory}
                  className="flex h-6 w-6 items-center justify-center rounded
                             text-neutral-600 hover:bg-neutral-800 hover:text-red-400 transition-colors"
                  title="Clear history"
                >
                  <Trash2 size={11} />
                </button>
              )}

              {/* Minimise — hides panel but keeps history */}
              <button
                onClick={() => setIsOpen(false)}
                className="flex h-6 w-6 items-center justify-center rounded
                           text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
                title="Minimise"
              >
                <Minimize2 size={13} />
              </button>

              {/* Close + clear */}
              <button
                onClick={clearHistory}
                className="flex h-6 w-6 items-center justify-center rounded
                           text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
                title="Close and clear"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 p-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center pb-8">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-2xl"
                  style={{ background: 'linear-gradient(135deg,#7c3aed22,#a855f722)' }}
                >
                  <Sparkles size={18} className="text-violet-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-neutral-500">
                    {currentPageId
                      ? 'I know this page and all workspace pages.'
                      : 'Ask anything about your workspace.'}
                  </p>
                  {wsContext ? (
                    <p className="text-[10px] text-neutral-600">
                      {wsContext.page_count} pages · {wsContext.char_count.toLocaleString()} chars loaded
                    </p>
                  ) : (
                    <p className="text-[10px] text-neutral-700">Loading context…</p>
                  )}
                  {agentMode && currentPageId && (
                    <p className="text-[10px] text-violet-600 mt-1">
                      Agent can add blocks to the current page
                    </p>
                  )}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={[
                  'max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'ml-auto bg-violet-600 text-white'
                    : 'bg-neutral-800 text-neutral-200',
                ].join(' ')}
              >
                {msg.content}
              </div>
            ))}

            {loading && (
              <div className="bg-neutral-800 rounded-xl px-3 py-2.5 w-fit">
                {searchingHint ? (
                  <span className="flex items-center gap-1.5 text-xs text-neutral-400 animate-pulse">
                    <span>🔍</span>
                    <span>Searching the web…</span>
                  </span>
                ) : (
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Pending agent action confirmation */}
            {pendingAction && (() => {
              const isDangerous = pendingAction.action === 'remove_blocks';
              return (
                <div className={[
                  'rounded-xl border p-3 space-y-2 text-xs',
                  isDangerous
                    ? 'border-red-700/50 bg-red-900/20'
                    : 'border-violet-600/40 bg-violet-900/20',
                ].join(' ')}>
                  <p className={[
                    'font-semibold flex items-center gap-1.5',
                    isDangerous ? 'text-red-300' : 'text-violet-300',
                  ].join(' ')}>
                    <span>{isDangerous ? '⚠️' : '⚡'}</span>
                    <span className="font-mono">{pendingAction.action.replace(/_/g, ' ')}</span>
                  </p>
                  <p className="text-neutral-400">{pendingAction.message}</p>
                  {isDangerous && (
                    <p className="text-red-400/70 text-[10px]">
                      This will permanently delete content. This cannot be undone.
                    </p>
                  )}
                  {pendingAction.action === 'add_blocks' && !currentPageId && (
                    <p className="text-amber-400 text-[10px]">
                      Navigate to a page first to use add_blocks.
                    </p>
                  )}
                  {pendingAction.action === 'remove_blocks' && !currentPageId && (
                    <p className="text-amber-400 text-[10px]">
                      Navigate to a page first to remove blocks.
                    </p>
                  )}
                  <div className="flex gap-2 pt-0.5">
                    <button
                      onClick={executeAction}
                      disabled={executing}
                      className={[
                        'flex-1 rounded-lg py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-colors',
                        isDangerous
                          ? 'bg-red-600 hover:bg-red-500'
                          : 'bg-violet-600 hover:bg-violet-500',
                      ].join(' ')}
                    >
                      {executing ? 'Working…' : isDangerous ? '⚠️ Delete' : '✓ Approve'}
                    </button>
                    <button
                      onClick={() => setPendingAction(null)}
                      disabled={executing}
                      className="flex-1 rounded-lg border border-neutral-700 py-1.5 text-xs
                                 font-semibold text-neutral-400 hover:text-neutral-200
                                 disabled:opacity-50 transition-colors"
                    >
                      ✕ Cancel
                    </button>
                  </div>
                </div>
              );
            })()}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-neutral-800 p-3">
            <div className="flex items-end gap-2 rounded-xl border border-neutral-700
                            bg-neutral-800/40 px-3 py-2
                            focus-within:border-violet-500/50 transition-colors">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                disabled={loading}
                placeholder={
                  agentMode
                    ? currentPageId
                      ? 'Create pages, add blocks to this page…'
                      : 'Create pages (navigate to a page for blocks)…'
                    : 'Ask about your workspace…'
                }
                className="flex-1 resize-none bg-transparent text-sm text-neutral-200
                           placeholder-neutral-600 outline-none disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className={[
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all',
                  input.trim() && !loading
                    ? 'bg-violet-600 text-white hover:bg-violet-500'
                    : 'text-neutral-700 cursor-not-allowed',
                ].join(' ')}
              >
                <Send size={13} />
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-neutral-700">
              {agentMode
                ? 'Agent mode · approval required before changes'
                : 'Shift+Enter for new line · history saved locally'}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
