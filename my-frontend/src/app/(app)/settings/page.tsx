'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Mail, Send, Calendar, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { EmailIntegrationsPanel } from '@/components/settings/EmailIntegrationsPanel';
import { LinkedInPanel } from '@/components/settings/LinkedInPanel';

type Tab = 'email' | 'linkedin';

const TABS: { id: Tab; label: string; description: string; icon: React.ReactNode }[] = [
  {
    id: 'email',
    label: 'Email',
    description: 'Connect Gmail, Outlook, or SMTP to send emails from your database blocks',
    icon: <Mail size={18} />,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    description: 'Connect LinkedIn to post updates and schedule content from your workspace',
    icon: <Send size={18} />,
  },
];

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [active, setActive] = useState<Tab>('email');

  useEffect(() => {
    const connected = searchParams.get('connected');
    if (connected === 'gmail' || connected === 'outlook') setActive('email');
    if (connected === 'linkedin') setActive('linkedin');
  }, [searchParams]);

  const activeTab = TABS.find((t) => t.id === active)!;

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="border-b border-neutral-800 bg-neutral-950 px-6 py-4">
        <div className="mx-auto max-w-3xl flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500
                       hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
          >
            <ArrowLeft size={15} />
          </button>
          <h1 className="text-base font-semibold text-neutral-100">Settings</h1>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex gap-6">

          {/* ── Left nav ─────────────────────────────────────────────────── */}
          <nav className="w-48 shrink-0 space-y-1">
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
              Integrations
            </p>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActive(tab.id)}
                className={[
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors text-left',
                  active === tab.id
                    ? 'bg-violet-900/30 text-violet-300'
                    : 'text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-300',
                ].join(' ')}
              >
                <span className={active === tab.id ? 'text-violet-400' : 'text-neutral-600'}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            ))}

            <div className="pt-3">
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
                Coming soon
              </p>
              <div className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-700">
                <Calendar size={18} />
                Calendar
              </div>
            </div>
          </nav>

          {/* ── Content panel ────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-neutral-100">{activeTab.label}</h2>
              <p className="mt-1 text-sm text-neutral-500">{activeTab.description}</p>
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
              {active === 'email'    && <EmailIntegrationsPanel />}
              {active === 'linkedin' && <LinkedInPanel />}
            </div>

            {active === 'email' && (
              <div className="mt-4 rounded-lg border border-neutral-800/60 bg-neutral-900/40 p-4">
                <p className="text-xs font-medium text-neutral-400 mb-1">How email sending works</p>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  Connect an email account above and set it as default. When you use the{' '}
                  <span className="text-neutral-400">Send Email</span> button in a database block,
                  emails will be sent from that account. Without a connected account, clicking Send
                  opens your local mail app via a <code className="text-neutral-500">mailto:</code> link.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}
