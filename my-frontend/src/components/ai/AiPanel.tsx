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
 *   → Add an entry to QUICK_ACTIONS below
 *   → Add its system prompt in backend: Apps/ai_agent/services.py → SYSTEM_PROMPTS
 *   → Optionally add its model tier in:  Apps/ai_agent/services.py → ACTION_MODELS
 *
 * CHANGE THE AI PROVIDER OR MODEL
 *   → config/settings/base.py → AI_PROVIDER, AI_MODELS
 *
 * TOGGLE THE PANEL
 *   → useAppStore((s) => s.toggleAiPanel)  from anywhere in the app
 *   → The panel is mounted inside [pageId]/page.tsx
 *
 * BACKEND ENDPOINTS
 *   → POST /api/ai/action/  (Quick Actions tab)
 *   → POST /api/ai/chat/    (Chat tab)
 *   → Both in: Apps/ai_agent/views.py
 * ════════════════════════════════════════════════════════════════════
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import {
  X, Sparkles, Send, RotateCcw, Copy, Check,
  FileText, Wand2, MessageSquare,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { aiApi } from '@/lib/api';
import type { AiChatMessage } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Quick Actions definition
// TO ADD A NEW ACTION: add an entry here + add backend prompt in services.py
// ─────────────────────────────────────────────────────────────────────────────

interface QuickAction {
  id:          string;
  label:       string;
  description: string;
  emoji:       string;
  tier:        'default' | 'fast';  // informational only — backend decides the tier
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'summarize',        label: 'Summarize',        description: 'Condense this page into key points',      emoji: '📝', tier: 'default' },
  { id: 'expand',           label: 'Expand',           description: 'Add more detail and depth',               emoji: '📖', tier: 'default' },
  { id: 'fix_grammar',      label: 'Fix grammar',      description: 'Correct spelling and grammar errors',     emoji: '✍️', tier: 'fast'    },
  { id: 'shorter',          label: 'Make shorter',     description: 'Trim without losing meaning',             emoji: '✂️', tier: 'fast'    },
  { id: 'bullet_points',    label: 'Bullet points',    description: 'Convert to structured list',              emoji: '📋', tier: 'fast'    },
  { id: 'continue_writing', label: 'Continue writing', description: 'Keep writing in the same style',         emoji: '✨', tier: 'default' },
  { id: 'improve_tone',     label: 'Improve tone',     description: 'More professional and clear',             emoji: '💎', tier: 'fast'    },
  { id: 'explain_simple',   label: 'Simplify',         description: 'Explain as if to a beginner',             emoji: '💡', tier: 'default' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AiPanelProps {
  pageId:      string;
  /** Text from the editor, used as context for quick actions */
  pageContent: string;
  onClose:     () => void;
}

type Tab = 'actions' | 'chat';

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function AiPanel({ pageId, pageContent, onClose }: AiPanelProps) {
  const [tab,            setTab]           = useState<Tab>('actions');
  const [actionResult,   setActionResult]  = useState<string | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [isActioning,    setIsActioning]   = useState(false);
  const [copied,         setCopied]        = useState(false);

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [messages,   setMessages]   = useState<AiChatMessage[]>([]);
  const [chatInput,  setChatInput]  = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Quick action handler ───────────────────────────────────────────────────

  async function runAction(action: QuickAction) {
    if (!pageContent.trim()) {
      toast.error('The page is empty — write something first.');
      return;
    }
    setIsActioning(true);
    setActiveActionId(action.id);
    setActionResult(null);

    try {
      const { result } = await aiApi.action({
        action_type: action.id,
        content:     pageContent,
        page_id:     pageId,
      });
      setActionResult(result);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'AI request failed.';
      toast.error(msg);
    } finally {
      setIsActioning(false);
    }
  }

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
        context:  pageContent.slice(0, 2000), // limit context size
      });
      setMessages([...nextMessages, { role: 'assistant', content: reply }]);
    } catch {
      toast.error('Chat request failed. Check your AI settings.');
      // Roll back the user message on failure so they can retry
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
          {/* Action buttons grid */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.id}
                onClick={() => runAction(action)}
                disabled={isActioning}
                className={[
                  'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all',
                  'hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed',
                  activeActionId === action.id && isActioning
                    ? 'bg-violet-600/10 border border-violet-500/30'
                    : 'border border-transparent',
                ].join(' ')}
              >
                <span className="text-xl leading-none shrink-0">{action.emoji}</span>
                <span className="flex flex-col min-w-0">
                  <span className="text-sm font-medium text-neutral-200 leading-tight">
                    {action.label}
                  </span>
                  <span className="text-xs text-neutral-600 truncate">{action.description}</span>
                </span>
                {activeActionId === action.id && isActioning && (
                  <span className="ml-auto shrink-0 text-xs text-violet-400 animate-pulse">…</span>
                )}
              </button>
            ))}
          </div>

          {/* Result panel */}
          {actionResult && (
            <div className="border-t border-neutral-800 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Result</span>
                <div className="flex gap-1">
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
              <div className="max-h-40 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-800/40 p-3 text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">
                {actionResult}
              </div>
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
                <span className="text-neutral-500 animate-pulse text-sm">Thinking…</span>
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
