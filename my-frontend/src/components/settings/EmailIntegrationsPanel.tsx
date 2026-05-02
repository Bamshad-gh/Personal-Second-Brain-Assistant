'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Star, Trash2, Send, Plus, X, Loader2 } from 'lucide-react';
import { integrationApi } from '@/lib/api';
import type { EmailIntegration, SmtpConnectPayload } from '@/types';
import toast from 'react-hot-toast';

const PROVIDER_LABELS: Record<string, string> = {
  gmail:   'Gmail',
  outlook: 'Outlook',
  smtp:    'SMTP',
};

const PROVIDER_COLORS: Record<string, string> = {
  gmail:   'bg-red-900/30 text-red-400',
  outlook: 'bg-blue-900/30 text-blue-400',
  smtp:    'bg-neutral-800 text-neutral-400',
};

function SmtpForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<SmtpConnectPayload>({
    host: '', port: 587, use_tls: true, username: '', password: '', email: '', label: '',
  });

  const connect = useMutation({
    mutationFn: integrationApi.connectSmtp,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-integrations'] });
      toast.success('SMTP account connected');
      onClose();
    },
    onError: () => toast.error('Failed to connect SMTP — check your settings'),
  });

  const field = (key: keyof SmtpConnectPayload, label: string, type = 'text') => (
    <div>
      <label className="block text-xs text-neutral-500 mb-1">{label}</label>
      <input
        type={type}
        value={String(form[key])}
        onChange={(e) => setForm((f) => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
        className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5
                   text-sm text-neutral-200 placeholder-neutral-600 focus:border-violet-500
                   focus:outline-none"
      />
    </div>
  );

  return (
    <div className="mt-4 rounded-lg border border-neutral-700 bg-neutral-800/50 p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-neutral-200">Add SMTP Account</span>
        <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300">
          <X size={14} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('host', 'SMTP Host')}
        {field('port', 'Port', 'number')}
        {field('username', 'Username')}
        {field('password', 'Password', 'password')}
        {field('email', 'From Email')}
        {field('label', 'Label (optional)')}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="tls"
          checked={form.use_tls}
          onChange={(e) => setForm((f) => ({ ...f, use_tls: e.target.checked }))}
          className="accent-violet-500"
        />
        <label htmlFor="tls" className="text-xs text-neutral-400">Use TLS/STARTTLS</label>
      </div>
      <button
        onClick={() => connect.mutate(form)}
        disabled={connect.isPending}
        className="flex items-center gap-2 rounded-md bg-violet-600 px-3 py-1.5 text-sm
                   text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
      >
        {connect.isPending && <Loader2 size={12} className="animate-spin" />}
        Connect
      </button>
    </div>
  );
}

export function EmailIntegrationsPanel() {
  const qc = useQueryClient();
  const [showSmtp, setShowSmtp] = useState(false);

  const { data: accounts = [], isLoading } = useQuery<EmailIntegration[]>({
    queryKey: ['email-integrations'],
    queryFn: integrationApi.listEmail,
  });

  const setDefault = useMutation({
    mutationFn: integrationApi.setDefault,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-integrations'] });
      toast.success('Default email account updated');
    },
  });

  const test = useMutation({
    mutationFn: integrationApi.test,
    onSuccess: () => toast.success('Test email sent to your address'),
    onError: () => toast.error('Test email failed'),
  });

  const remove = useMutation({
    mutationFn: integrationApi.removeEmail,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-integrations'] });
      toast.success('Account removed');
    },
  });

  const connectGmail = async () => {
    try {
      const { url } = await integrationApi.getGmailOAuthUrl();
      window.location.href = url;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'Gmail not configured — add GOOGLE_GMAIL_CLIENT_ID to .env');
    }
  };

  const connectOutlook = async () => {
    try {
      const { url } = await integrationApi.getOutlookOAuthUrl();
      window.location.href = url;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'Outlook not configured — add OUTLOOK_CLIENT_ID to .env');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={connectGmail}
          className="flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-800
                     px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-600 hover:bg-neutral-700
                     transition-colors"
        >
          <Mail size={14} /> Connect Gmail
        </button>
        <button
          onClick={connectOutlook}
          className="flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-800
                     px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-600 hover:bg-neutral-700
                     transition-colors"
        >
          <Mail size={14} /> Connect Outlook
        </button>
        <button
          onClick={() => setShowSmtp((v) => !v)}
          className="flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-800
                     px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-600 hover:bg-neutral-700
                     transition-colors"
        >
          <Plus size={14} /> Add SMTP
        </button>
      </div>

      {showSmtp && <SmtpForm onClose={() => setShowSmtp(false)} />}

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-neutral-600">
          <Loader2 size={12} className="animate-spin" /> Loading accounts…
        </div>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-neutral-600">No email accounts connected yet.</p>
      ) : (
        <div className="space-y-2">
          {accounts.map((acct) => (
            <div
              key={acct.id}
              className="flex items-center gap-3 rounded-lg border border-neutral-800
                         bg-neutral-900 px-3 py-2.5"
            >
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${PROVIDER_COLORS[acct.provider] ?? 'bg-neutral-800 text-neutral-400'}`}>
                {PROVIDER_LABELS[acct.provider] ?? acct.provider}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-neutral-200 truncate">{acct.email || acct.label || '—'}</p>
                {acct.label && acct.email && (
                  <p className="text-xs text-neutral-600 truncate">{acct.label}</p>
                )}
              </div>
              {acct.is_default && (
                <Star size={12} className="shrink-0 fill-yellow-400 text-yellow-400" />
              )}
              <div className="flex items-center gap-1 shrink-0">
                {!acct.is_default && (
                  <button
                    onClick={() => setDefault.mutate(acct.id)}
                    className="rounded px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-800
                               hover:text-neutral-300 transition-colors"
                  >
                    Set default
                  </button>
                )}
                <button
                  onClick={() => test.mutate(acct.id)}
                  title="Send test email"
                  className="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
                >
                  <Send size={12} />
                </button>
                <button
                  onClick={() => remove.mutate(acct.id)}
                  title="Remove"
                  className="rounded p-1 text-neutral-500 hover:bg-red-900/30 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
