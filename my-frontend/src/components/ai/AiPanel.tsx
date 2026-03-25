/**
 * components/ai/AiPanel.tsx
 *
 * What:    Sliding AI assistant panel — opens from the right side of the editor.
 *          Two tabs: Quick Actions (predefined) and Chat (free-form).
 *
 * ════════════════════════════════════════════════════════════════════
 * FILE MAP — where to extend this feature
 * ════════════════════════════════════════════════════════════════════
 *
 * ADD A NEW QUICK ACTION BUTTON
 *   → Add an entry to ACTION_DEFINITIONS in Apps/ai_agent/services.py
 *   → That's it — this panel loads actions dynamically from GET /api/ai/actions/
 *
 * CHANGE THE AI PROVIDER OR MODEL
 *   → config/settings/base.py → AI_PROVIDER, AI_MODELS
 *
 * TOGGLE THE PANEL
 *   → useAppStore((s) => s.toggleAiPanel)  from anywhere in the app
 *   → The panel is mounted inside [pageId]/page.tsx
 *
 * BACKEND ENDPOINTS
 *   → GET  /api/ai/actions/ (list available actions)
 *   → POST /api/ai/action/  (Quick Actions tab)
 *   → POST /api/ai/chat/    (Chat tab)
 *   → Both in: Apps/ai_agent/views.py
 * ════════════════════════════════════════════════════════════════════
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Sparkles, Send, RotateCcw, Copy, Check,
  FileText, Wand2, MessageSquare, Plus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { aiApi } from '@/lib/api';
import type { AiChatMessage, AiActionDefinition } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Emoji lookup — maps action_type → display emoji
// To add a new action: add an entry in Apps/ai_agent/services.py ACTION_DEFINITIONS.
// Add an emoji here if you want a custom icon (falls back to '✦').
// ─────────────────────────────────────────────────────────────────────────────

const ACTION_EMOJI: Record<string, string> = {
  summarize:        '📝',
  expand:           '📖',
  fix_grammar:      '✍️',
  shorter:          '✂️',
  bullet_points:    '📋',
  continue_writing: '✨',
  improve_tone:     '💎',
  explain_simple:   '💡',
  translate:        '🌐',
  explain_code:     '🔍',
  add_comments:     '💬',
  fix_code:         '🐛',
  improve_code:     '⚡',
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AiPanelProps {
  pageId:                  string;
  /** Full text from the editor — used as fallback when no text is selected */
  pageContent:             string;
  onClose:                 () => void;
  /** When non-empty: actions run on this text instead of pageContent */
  selectedText?:           string;
  /** Called when the user clicks "Insert" in the result panel */
  onInsertResult?:         (text: string) => void;
  /** When set: panel auto-runs this action (e.g. triggered from code block toolbar) */
  pendingAction?:          { actionType: string; content: string } | null;
  /** Called after pendingAction has been consumed */
  onPendingActionHandled?: () => void;
}

type Tab = 'actions' | 'chat';

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function AiPanel({
  pageId,
  pageContent,
  onClose,
  selectedText,
  onInsertResult,
  pendingAction,
  onPendingActionHandled,
}: AiPanelProps) {
  const [tab,            setTab]            = useState<Tab>('actions');
  const [actionResult,   setActionResult]   = useState<string | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [isActioning,    setIsActioning]    = useState(false);
  const [copied,         setCopied]         = useState(false);

  // ── Translate UI state ─────────────────────────────────────────────────────
  const [translateOpen,  setTranslateOpen]  = useState(false);
  const [languageInput,  setLanguageInput]  = useState('');

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [messages,   setMessages]   = useState<AiChatMessage[]>([]);
  const [chatInput,  setChatInput]  = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Load actions dynamically from backend ──────────────────────────────────
  const { data: actionDefs = [] } = useQuery<AiActionDefinition[]>({
    queryKey: ['ai-actions'],
    queryFn:  aiApi.getActions,
    staleTime: Infinity, // action list never changes at runtime
  });

  const textActions = actionDefs.filter((a) => a.category === 'text');
  const codeActions = actionDefs.filter((a) => a.category === 'code');

  // ── Core action runner ─────────────────────────────────────────────────────

  const runActionById = useCallback(async (
    actionType: string,
    content: string,
    extra?: Record<string, string>,
  ) => {
    if (!content.trim()) {
      toast.error('No content to process.');
      return;
    }
    setIsActioning(true);
    setActiveActionId(actionType);
    setActionResult(null);

    try {
      const { result } = await aiApi.action({ action_type: actionType, content, extra });
      setActionResult(result);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'AI request failed.';
      toast.error(msg);
    } finally {
      setIsActioning(false);
    }
  }, []);

  function getContent(): string {
    return selectedText?.trim() || pageContent;
  }

  function runAction(action: AiActionDefinition) {
    if (action.requires_extra?.includes('language')) {
      // Translate — show inline language input instead of firing immediately
      setTranslateOpen((prev) => !prev);
      return;
    }
    runActionById(action.action_type, getContent());
  }

  function submitTranslate() {
    if (!languageInput.trim()) return;
    setTranslateOpen(false);
    runActionById('translate', getContent(), { language: languageInput.trim() });
  }

  // ── Pending action (triggered from code block toolbar) ─────────────────────
  useEffect(() => {
    if (!pendingAction) return;
    setTab('actions');
    runActionById(pendingAction.actionType, pendingAction.content);
    onPendingActionHandled?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction]);

  // ── Chat send handler ──────────────────────────────────────────────────────

  async function sendMessage() {
    const text = chatInput.trim();
    if (!text || isChatting) return;

    const userMessage: AiChatMessage = { role: 'user', content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setChatInput('');
    setIsChatting(true);

    try {
      const { reply } = await aiApi.chat({
        messages: nextMessages,
        page_id:  pageId,
        context:  pageContent.slice(0, 2000),
      });
      setMessages([...nextMessages, { role: 'assistant', content: reply }]);
    } catch {
      toast.error('Chat request failed. Check your AI settings.');
      setMessages(messages);
    } finally {
      setIsChatting(false);
    }
  }

  // ── Copy result ────────────────────────────────────────────────────────────

  async function copyResult() {
    if (!actionResult) return;
    await navigator.clipboard.writeText(actionResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Code detection ─────────────────────────────────────────────────────────

  function isCodeResult(text: string): boolean {
    return /```|^\s*(function|const|let|var|class|def |import |#include)/m.test(text);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full border-l border-neutral-800 bg-neutral-900 animate-fade-in"
      style={{ width: '320px', minWidth: '320px' }}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-md"
          style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)' }}
        >
          <Sparkles size={12} className="text-white" />
        </div>
        <span className="flex-1 text-sm font-semibold text-neutral-200">AI Assistant</span>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-neutral-800">
        <TabButton
          active={tab === 'actions'}
          onClick={() => setTab('actions')}
          icon={<Wand2 size={13} />}
          label="Actions"
        />
        <TabButton
          active={tab === 'chat'}
          onClick={() => setTab('chat')}
          icon={<MessageSquare size={13} />}
          label="Chat"
        />
      </div>

      {/* ── Tab: Quick Actions ─────────────────────────────────────────────── */}
      {tab === 'actions' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Selected text banner */}
          {selectedText?.trim() && (
            <div className="mx-3 mt-3 rounded-lg bg-violet-900/30 border border-violet-700/50 px-3 py-2 text-xs text-violet-300 flex items-center gap-2">
              <Sparkles size={11} />
              Using selected text ({selectedText.trim().length} chars)
            </div>
          )}

          {/* Action buttons */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1">

            {/* Text Actions group */}
            {textActions.length > 0 && (
              <>
                <p className="px-1 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                  Text Actions
                </p>
                {textActions.map((action) => (
                  <ActionButton
                    key={action.action_type}
                    action={action}
                    isActioning={isActioning}
                    activeActionId={activeActionId}
                    emoji={ACTION_EMOJI[action.action_type] ?? '✦'}
                    onClick={() => runAction(action)}
                  />
                ))}

                {/* Translate inline input */}
                {translateOpen && (
                  <div className="mx-1 mt-1 flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-2">
                    <input
                      autoFocus
                      value={languageInput}
                      onChange={(e) => setLanguageInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitTranslate(); if (e.key === 'Escape') setTranslateOpen(false); }}
                      placeholder="Language (e.g. Spanish)"
                      className="flex-1 bg-transparent text-xs text-neutral-200 placeholder-neutral-600 outline-none"
                    />
                    <button
                      onClick={submitTranslate}
                      disabled={!languageInput.trim()}
                      className="rounded px-2 py-0.5 text-xs font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Go
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Code Actions group */}
            {codeActions.length > 0 && (
              <>
                <p className="px-1 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                  Code Actions
                </p>
                {codeActions.map((action) => (
                  <ActionButton
                    key={action.action_type}
                    action={action}
                    isActioning={isActioning}
                    activeActionId={activeActionId}
                    emoji={ACTION_EMOJI[action.action_type] ?? '✦'}
                    onClick={() => runAction(action)}
                  />
                ))}
              </>
            )}

            {/* Loading skeleton while actions fetch */}
            {actionDefs.length === 0 && (
              <div className="space-y-1 pt-1">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 rounded-xl bg-neutral-800/40 animate-pulse" />
                ))}
              </div>
            )}
          </div>

          {/* Result panel */}
          {actionResult && (
            <div className="border-t border-neutral-800 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Result</span>
                <div className="flex gap-1">
                  {onInsertResult && (
                    <button
                      onClick={() => onInsertResult(actionResult)}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-violet-400 hover:bg-neutral-800 hover:text-violet-300 transition-colors"
                      title="Insert into page at cursor"
                    >
                      <Plus size={11} />
                      Insert
                    </button>
                  )}
                  <button
                    onClick={copyResult}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
                    title="Copy to clipboard"
                  >
                    {copied ? <Check size={11} className="text-violet-400" /> : <Copy size={11} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={() => setActionResult(null)}
                    className="flex h-6 w-6 items-center justify-center rounded text-neutral-600 hover:bg-neutral-800 hover:text-neutral-400 transition-colors"
                    title="Dismiss"
                  >
                    <X size={11} />
                  </button>
                </div>
              </div>
              {isCodeResult(actionResult) ? (
                <pre className="max-h-48 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950 p-3 font-mono text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap">
                  {actionResult}
                </pre>
              ) : (
                <div className="max-h-40 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-800/40 p-3 text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">
                  {actionResult}
                </div>
              )}
            </div>
          )}

          {/* Global loading indicator */}
          {isActioning && (
            <div className="border-t border-neutral-800 px-4 py-3 flex items-center gap-2 text-sm text-violet-400">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <span>Thinking...</span>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Chat ─────────────────────────────────────────────────────── */}
      {tab === 'chat' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center gap-3 pt-6 text-center">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-2xl"
                  style={{ background: 'linear-gradient(135deg, #7c3aed22, #a855f722)' }}
                >
                  <FileText size={18} className="text-violet-400" />
                </div>
                <p className="text-xs text-neutral-500 leading-relaxed px-2">
                  Ask anything about this page, or any general question.
                  The AI has access to your page content as context.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={[
                  'rounded-xl px-3 py-2.5 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-violet-600/15 text-neutral-200 ml-4'
                    : 'bg-neutral-800/60 text-neutral-300 mr-4',
                ].join(' ')}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1 text-neutral-600">
                  {msg.role === 'user' ? 'You' : 'AI'}
                </p>
                <span className="whitespace-pre-wrap">{msg.content}</span>
              </div>
            ))}

            {isChatting && (
              <div className="bg-neutral-800/60 rounded-xl px-3 py-2.5 mr-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1 text-neutral-600">AI</p>
                <div className="flex items-center gap-2 text-sm text-violet-400">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                  <span>Thinking...</span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Clear chat button */}
          {messages.length > 0 && (
            <div className="px-3 pb-1">
              <button
                onClick={() => setMessages([])}
                className="flex items-center gap-1 text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
              >
                <RotateCcw size={11} /> Clear conversation
              </button>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-neutral-800 p-3">
            <div className="flex items-end gap-2 rounded-xl border border-neutral-700 bg-neutral-800/40 px-3 py-2 focus-within:border-violet-500/50 transition-colors">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Ask anything… (Enter to send)"
                rows={2}
                disabled={isChatting}
                className="flex-1 resize-none bg-transparent text-sm text-neutral-200 placeholder-neutral-600 outline-none disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={!chatInput.trim() || isChatting}
                className={[
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all',
                  chatInput.trim() && !isChatting
                    ? 'bg-violet-600 text-white hover:bg-violet-500'
                    : 'text-neutral-700 cursor-not-allowed',
                ].join(' ')}
              >
                <Send size={13} />
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-neutral-700">
              Shift+Enter for new line · Uses page content as context
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ActionButton — one row in the action list
// ─────────────────────────────────────────────────────────────────────────────

function ActionButton({
  action, isActioning, activeActionId, emoji, onClick,
}: {
  action:        AiActionDefinition;
  isActioning:   boolean;
  activeActionId: string | null;
  emoji:         string;
  onClick:       () => void;
}) {
  const isThisActive = activeActionId === action.action_type && isActioning;
  return (
    <button
      onClick={onClick}
      disabled={isActioning}
      className={[
        'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all',
        'hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed',
        isThisActive
          ? 'bg-violet-600/10 border border-violet-500/30'
          : 'border border-transparent',
      ].join(' ')}
    >
      <span className="text-xl leading-none shrink-0">{emoji}</span>
      <span className="flex flex-col min-w-0">
        <span className="text-sm font-medium text-neutral-200 leading-tight">
          {action.label}
        </span>
        <span className="text-xs text-neutral-600 truncate">{action.description}</span>
      </span>
      {isThisActive && (
        <span className="ml-auto shrink-0 text-xs text-violet-400 animate-pulse">…</span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TabButton — small tab pill
// ─────────────────────────────────────────────────────────────────────────────

function TabButton({
  active, onClick, icon, label,
}: {
  active:  boolean;
  onClick: () => void;
  icon:    React.ReactNode;
  label:   string;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors',
        active
          ? 'text-violet-400 border-b-2 border-violet-500'
          : 'text-neutral-500 hover:text-neutral-300',
      ].join(' ')}
    >
      {icon}
      {label}
    </button>
  );
}
