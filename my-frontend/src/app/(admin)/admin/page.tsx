'use client';

/**
 * app/(admin)/admin/page.tsx — /admin
 *
 * Staff-only read-only monitoring dashboard.
 * Dangerous operations (tier changes, user management) live in Django admin.
 *
 * Auth gate:
 *   - useAppStore(s => s.user) provides the logged-in user (or null while loading)
 *   - If user is loaded and is_staff is false, redirect to /
 *   - Backend also enforces IsAdminUser on every endpoint (403 if not staff)
 *
 * Tabs:
 *   overview  — stat cards + tier breakdown
 *   users     — searchable paginated user table
 *   ai        — action chart + daily trend + top users
 *   security  — new staff accounts, unlimited tier, never-logged-in
 */

import { useEffect, useState } from 'react';
import { useRouter }           from 'next/navigation';
import { useQuery }            from '@tanstack/react-query';
import {
  adminApi,
  type AdminOverview,
  type AdminUserPage,
  type AdminAiStats,
  type AdminSecurity,
  type AdminAiActionRow,
  type AdminDailyRow,
  type AdminTopUserRow,
  type AdminUserRow,
} from '@/lib/api';
import { useAppStore } from '@/lib/store';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type Tab = 'overview' | 'users' | 'ai' | 'security';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SMALL PRESENTATIONAL HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-neutral-100">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p className="text-xs text-neutral-600 mt-1">{sub}</p>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const cls =
    tier === 'unlimited'
      ? 'bg-violet-900/30 text-violet-400'
      : tier === 'pro'
      ? 'bg-blue-900/30 text-blue-400'
      : 'bg-neutral-800 text-neutral-500';
  return (
    <span className={`text-xs rounded px-2 py-0.5 ${cls}`}>{tier}</span>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OVERVIEW TAB
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function OverviewTab({ data }: { data: AdminOverview }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Users"
          value={data.users.total}
          sub={`+${data.users.new_30d} this month`}
        />
        <StatCard
          label="Active (7d)"
          value={data.users.active_7d}
          sub="unique logins"
        />
        <StatCard
          label="Total Pages"
          value={data.content.pages}
          sub={`${data.content.blocks.toLocaleString()} blocks`}
        />
        <StatCard
          label="AI Calls Today"
          value={data.ai.calls_today}
          sub={`${data.ai.tokens_today.toLocaleString()} tokens`}
        />
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <h3 className="text-sm font-medium text-neutral-300 mb-3">
          AI Tier Distribution
        </h3>
        <div className="flex flex-wrap gap-5">
          {Object.entries(data.tiers ?? {}).map(([tier, count]) => (
            <div key={tier} className="flex items-center gap-2">
              <div
                className={[
                  'w-2 h-2 rounded-full',
                  tier === 'unlimited'
                    ? 'bg-violet-400'
                    : tier === 'pro'
                    ? 'bg-blue-400'
                    : 'bg-neutral-500',
                ].join(' ')}
              />
              <span className="text-sm text-neutral-300 capitalize">{tier}</span>
              <span className="text-sm font-medium text-neutral-100">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <h3 className="text-sm font-medium text-neutral-300 mb-3">Content</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { label: 'Workspaces', value: data.content.workspaces },
            { label: 'Pages',      value: data.content.pages },
            { label: 'Blocks',     value: data.content.blocks },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-xl font-bold text-neutral-100">
                {item.value.toLocaleString()}
              </p>
              <p className="text-xs text-neutral-500">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// USERS TAB
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function UsersTab({
  data,
  search,
  onSearch,
  page,
  onPage,
}: {
  data:     AdminUserPage | undefined;
  search:   string;
  onSearch: (v: string) => void;
  page:     number;
  onPage:   (p: number) => void;
}) {
  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Search by email or username…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        className="w-full max-w-md rounded-lg border border-neutral-700
                   bg-neutral-800 px-3 py-2 text-sm text-neutral-200
                   placeholder-neutral-600 outline-none
                   focus:border-violet-500 transition-colors"
      />

      <div className="rounded-xl border border-neutral-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 border-b border-neutral-800">
            <tr>
              {['Email', 'Joined', 'Last Login', 'Tier', 'AI Today', 'Pages', 'Staff'].map(
                (h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs text-neutral-500 font-medium whitespace-nowrap"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {data?.results.map((u: AdminUserRow) => (
              <tr
                key={u.id}
                className="border-b border-neutral-800/50 hover:bg-neutral-900/50 transition-colors"
              >
                <td className="px-4 py-3 text-neutral-200 max-w-[220px] truncate">
                  {u.email}
                </td>
                <td className="px-4 py-3 text-neutral-500 text-xs whitespace-nowrap">
                  {new Date(u.date_joined).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-neutral-500 text-xs whitespace-nowrap">
                  {u.last_login
                    ? new Date(u.last_login).toLocaleDateString()
                    : 'Never'}
                </td>
                <td className="px-4 py-3">
                  <TierBadge tier={u.ai_tier} />
                </td>
                <td className="px-4 py-3 text-neutral-400 text-center">
                  {u.ai_calls_today}
                </td>
                <td className="px-4 py-3 text-neutral-400 text-center">
                  {u.page_count}
                </td>
                <td className="px-4 py-3">
                  {u.is_staff && (
                    <span className="text-xs text-amber-400 font-medium">
                      staff
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-xs rounded border border-neutral-700
                       text-neutral-400 disabled:opacity-40 hover:bg-neutral-800
                       transition-colors"
          >
            ← Prev
          </button>
          <span className="text-xs text-neutral-500">
            Page {page} of {data.pages}
          </span>
          <button
            onClick={() => onPage(Math.min(data.pages, page + 1))}
            disabled={page === data.pages}
            className="px-3 py-1.5 text-xs rounded border border-neutral-700
                       text-neutral-400 disabled:opacity-40 hover:bg-neutral-800
                       transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI USAGE TAB
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AiTab({ data }: { data: AdminAiStats }) {
  const maxCalls = data.by_action[0]?.count ?? 1;

  return (
    <div className="space-y-6">
      {/* Top actions */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <h3 className="text-sm font-medium text-neutral-300 mb-4">
          Top Actions — last 30 days
        </h3>
        <div className="space-y-3">
          {data.by_action.map((a: AdminAiActionRow) => (
            <div key={a.action_name || 'chat'} className="flex items-center gap-3">
              <span className="text-xs text-neutral-500 w-36 truncate shrink-0">
                {a.action_name || 'chat'}
              </span>
              <div className="flex-1 bg-neutral-800 rounded-full h-1.5">
                <div
                  className="bg-violet-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (a.count / maxCalls) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-neutral-400 w-10 text-right shrink-0">
                {a.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Daily trend (mini sparkline via widths) */}
      {data.daily.length > 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <h3 className="text-sm font-medium text-neutral-300 mb-4">
            Daily Call Volume — last 30 days
          </h3>
          <div className="flex items-end gap-0.5 h-16">
            {(() => {
              const maxCls = Math.max(...data.daily.map((d: AdminDailyRow) => d.calls), 1);
              return data.daily.map((d: AdminDailyRow) => (
                <div
                  key={String(d.date)}
                  title={`${d.date}: ${d.calls} calls, ${d.tokens.toLocaleString()} tokens`}
                  className="flex-1 bg-violet-500/50 hover:bg-violet-400/70
                             rounded-t transition-colors cursor-default"
                  style={{ height: `${Math.max(4, (d.calls / maxCls) * 100)}%` }}
                />
              ));
            })()}
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-neutral-600">
            <span>{data.daily[0] ? String(data.daily[0].date) : ''}</span>
            <span>{data.daily[data.daily.length - 1] ? String(data.daily[data.daily.length - 1].date) : ''}</span>
          </div>
        </div>
      )}

      {/* Top users */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <h3 className="text-sm font-medium text-neutral-300 mb-3">
          Top Users by AI Usage
        </h3>
        <div className="space-y-1">
          {data.top_users.map((u: AdminTopUserRow) => (
            <div
              key={u.user__email}
              className="flex justify-between items-center py-2
                         border-b border-neutral-800/50 last:border-0"
            >
              <span className="text-sm text-neutral-300 truncate max-w-[240px]">
                {u.user__email}
              </span>
              <span className="text-xs text-neutral-500 shrink-0 ml-4">
                {u.calls} calls · {u.tokens.toLocaleString()} tokens
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECURITY TAB
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SecurityTab({ data }: { data: AdminSecurity }) {
  return (
    <div className="space-y-4">
      {data.new_staff_accounts.length > 0 && (
        <div className="rounded-xl border border-amber-700/50 bg-amber-900/10 p-4">
          <h3 className="text-sm font-medium text-amber-400 mb-2">
            ⚠ New Staff Accounts — last 7 days
          </h3>
          <div className="space-y-1">
            {data.new_staff_accounts.map((s) => (
              <div key={s.email} className="text-sm text-neutral-300">
                {s.email}{' '}
                <span className="text-xs text-neutral-600">
                  — joined {new Date(s.date_joined).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.new_staff_accounts.length === 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <p className="text-sm text-neutral-500">
            No new staff accounts in the last 7 days.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <h3 className="text-sm font-medium text-neutral-300 mb-3">
          Unlimited AI Users
        </h3>
        {data.unlimited_ai_users.length === 0 ? (
          <p className="text-sm text-neutral-600">None</p>
        ) : (
          <div className="space-y-1">
            {data.unlimited_ai_users.map((u) => (
              <div
                key={u.user__email}
                className="flex justify-between items-center py-1.5
                           border-b border-neutral-800/50 last:border-0"
              >
                <span className="text-sm text-neutral-300">{u.user__email}</span>
                <span className="text-xs text-neutral-600">
                  updated {new Date(u.updated_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <h3 className="text-sm font-medium text-neutral-300 mb-1">
          Never Logged In
        </h3>
        <p className="text-2xl font-bold text-neutral-100">
          {data.never_logged_in}
        </p>
        <p className="text-xs text-neutral-600 mt-1">
          Accounts joined 30+ days ago that have never logged in
        </p>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function AdminDashboard() {
  const router = useRouter();
  const user   = useAppStore((s) => s.user);

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [search,    setSearch]    = useState('');
  const [userPage,  setUserPage]  = useState(1);

  // Reset to page 1 whenever search changes
  const handleSearch = (v: string) => {
    setSearch(v);
    setUserPage(1);
  };

  // Redirect non-staff once user is loaded
  useEffect(() => {
    if (user && !user.is_staff) router.push('/');
  }, [user, router]);

  const isStaff = !!user?.is_staff;

  const { data: overview } = useQuery<AdminOverview>({
    queryKey:       ['admin-overview'],
    queryFn:        adminApi.getOverview,
    enabled:        isStaff,
    refetchInterval: 30_000,
  });

  const { data: users } = useQuery<AdminUserPage>({
    queryKey: ['admin-users', userPage, search],
    queryFn:  () => adminApi.getUsers(userPage, search),
    enabled:  isStaff && activeTab === 'users',
  });

  const { data: aiStats } = useQuery<AdminAiStats>({
    queryKey: ['admin-ai-stats'],
    queryFn:  adminApi.getAiStats,
    enabled:  isStaff && activeTab === 'ai',
  });

  const { data: security } = useQuery<AdminSecurity>({
    queryKey: ['admin-security'],
    queryFn:  adminApi.getSecurity,
    enabled:  isStaff && activeTab === 'security',
  });

  // Show nothing while auth resolves or if not staff
  if (!user || !user.is_staff) return null;

  const TAB_LABELS: Record<Tab, string> = {
    overview: 'Overview',
    users:    'Users',
    ai:       'AI Usage',
    security: 'Security',
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-violet-400 text-lg select-none">✦</span>
          <h1 className="font-semibold text-neutral-100">Admin Dashboard</h1>
          <span className="text-xs bg-violet-900/30 text-violet-400
                           border border-violet-700/50 rounded px-2 py-0.5">
            Staff only
          </span>
        </div>
        <a
          href="/admin/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          Django Admin →
        </a>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────── */}
      <div className="border-b border-neutral-800 px-6 flex gap-1">
        {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={[
              'px-3 py-3 text-sm transition-colors border-b-2',
              activeTab === tab
                ? 'border-violet-500 text-violet-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-300',
            ].join(' ')}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* ── Content ────────────────────────────────────────────── */}
      <div className="p-6 max-w-7xl mx-auto">

        {activeTab === 'overview' && (
          overview
            ? <OverviewTab data={overview} />
            : <p className="text-sm text-neutral-600 animate-pulse">Loading…</p>
        )}

        {activeTab === 'users' && (
          <UsersTab
            data={users}
            search={search}
            onSearch={handleSearch}
            page={userPage}
            onPage={setUserPage}
          />
        )}

        {activeTab === 'ai' && (
          aiStats
            ? <AiTab data={aiStats} />
            : <p className="text-sm text-neutral-600 animate-pulse">Loading…</p>
        )}

        {activeTab === 'security' && (
          security
            ? <SecurityTab data={security} />
            : <p className="text-sm text-neutral-600 animate-pulse">Loading…</p>
        )}
      </div>
    </div>
  );
}
