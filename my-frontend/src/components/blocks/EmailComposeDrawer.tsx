'use client';

import { useState, useEffect } from 'react';
import { X, Mail, Send, Copy, Sparkles, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSendEmail } from '@/hooks/useDatabase';
import { aiApi } from '@/lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface EmailComposeDrawerProps {
  blockId: string;
  to:      string[];
  onClose: () => void;
}

const AI_ACTIONS = [
  { id: 'email_improve',      label: 'Improve'     },
  { id: 'email_shorter',      label: 'Shorten'     },
  { id: 'email_expand',       label: 'Expand'      },
  { id: 'email_fix_grammar',  label: 'Fix grammar' },
  { id: 'email_summarize',    label: 'Summarize'   },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function EmailComposeDrawer({ blockId, to, onClose }: EmailComposeDrawerProps) {
  const [recipients, setRecipients] = useState(to.join(', '));
  const [subject,    setSubject]    = useState('');
  const [body,       setBody]       = useState('');
  const [aiLoading,  setAiLoading]  = useState<string | null>(null);

  const sendEmail = useSendEmail(blockId);

  useEffect(() => { setRecipients(to.join(', ')); }, [to]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── AI body action ─────────────────────────────────────────────────────────
  async function handleAiAction(actionId: string) {
    if (!body.trim()) { toast.error('Write something in the body first.'); return; }
    setAiLoading(actionId);
    try {
      const res = await aiApi.action({
        action_type: actionId,
        content:     body,
      });
      setBody(res.result ?? body);
    } catch {
      toast.error('AI action failed.');
    } finally {
      setAiLoading(null);
    }
  }

  // ── Send ───────────────────────────────────────────────────────────────────
  function handleSend() {
    const toList = recipients
      .split(/[,;\n]+/)
      .map(s => s.trim())
      .filter(Boolean);

    if (!toList.length) { toast.error('Add at least one recipient.'); return; }

    sendEmail.mutate(
      { to: toList, subject, body },
      {
        onSuccess(data) {
          if (data.sent) {
            toast.success(`Email sent to ${toList.length} recipient${toList.length !== 1 ? 's' : ''}.`);
            onClose();
          } else {
            // No EMAIL_HOST configured — open mailto: so user's own email client handles it
            const mailto = `mailto:${toList.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            window.open(mailto, '_blank');
            toast.success('Opened in your email client.');
            onClose();
          }
        },
        onError() {
          toast.error('Failed to send email.');
        },
      },
    );
  }

  // ── Copy addresses helper ─────────────────────────────────────────────────
  function copyAddresses() {
    const toList = recipients.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    const text   = toList.join(', ');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => toast.success('Addresses copied.'));
    } else {
      // Fallback for HTTP non-localhost
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      toast.success('Addresses copied.');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Drawer — stops 80px from bottom so it clears the global AI button */}
      <div className="fixed right-0 top-0 z-50 flex flex-col border-l border-neutral-800 bg-neutral-950 shadow-2xl"
           style={{ bottom: 80, width: 384 }}>

        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-neutral-800 px-4 py-3">
          <Mail size={14} className="text-violet-400" />
          <span className="flex-1 text-sm font-medium text-neutral-200">Compose Email</span>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
          >
            <X size={13} />
          </button>
        </div>

        {/* Fields */}
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">

          {/* To */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-neutral-500">To</label>
            <textarea
              value={recipients}
              onChange={e => setRecipients(e.target.value)}
              rows={2}
              placeholder="email@example.com, another@example.com"
              className="resize-none rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-200 outline-none focus:border-violet-500"
            />
            <p className="text-[10px] text-neutral-600">Separate multiple addresses with commas</p>
          </div>

          {/* Subject */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-neutral-500">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject line"
              className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-200 outline-none focus:border-violet-500"
            />
          </div>

          {/* Body */}
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex items-center gap-1">
              <label className="text-[10px] uppercase tracking-wide text-neutral-500">Body</label>
              {/* AI action pills */}
              <div className="ml-auto flex items-center gap-1">
                <Sparkles size={10} className="text-violet-500 shrink-0" />
                {AI_ACTIONS.map(a => (
                  <button
                    key={a.id}
                    onClick={() => handleAiAction(a.id)}
                    disabled={!!aiLoading}
                    className="flex items-center gap-0.5 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-700 hover:text-violet-300 disabled:opacity-40 transition-colors"
                  >
                    {aiLoading === a.id
                      ? <Loader2 size={9} className="animate-spin" />
                      : a.label
                    }
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your message…"
              className="flex-1 resize-none rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-200 outline-none focus:border-violet-500"
              style={{ minHeight: 160 }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-2 border-t border-neutral-800 px-4 py-3">
          <button
            onClick={copyAddresses}
            className="flex items-center gap-1.5 rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
          >
            <Copy size={11} /> Copy addresses
          </button>

          <button
            onClick={handleSend}
            disabled={sendEmail.isPending}
            className="ml-auto flex items-center gap-1.5 rounded bg-violet-600 px-3 py-1.5 text-xs text-white hover:bg-violet-500 disabled:opacity-50"
          >
            <Send size={11} />
            {sendEmail.isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </>
  );
}
