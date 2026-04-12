import { useEffect, useState } from 'react';
import { UserPlus, ShieldAlert, LifeBuoy, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { navigate } from '../App';

interface ActivityItem {
  kind: 'signup' | 'audit' | 'support';
  at: string;
  text: string;
  tenantId?: string;
  ref?: string;
}

export function ActivityPage() {
  const [items, setItems] = useState<ActivityItem[] | null>(null);

  useEffect(() => {
    api<ActivityItem[]>('/admin/activity?limit=100').then(setItems);
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-1">Activity</h1>
      <p className="text-slate-400 mb-6">Recent signups, subscription events, and support submissions.</p>

      <div className="bg-slate-900 border border-slate-800 rounded-xl">
        {!items ? (
          <div className="py-16 flex items-center justify-center text-slate-500 text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">No activity yet.</div>
        ) : (
          <ul className="divide-y divide-slate-800">
            {items.map((item, i) => (
              <li
                key={i}
                onClick={() => item.tenantId && navigate(`/tenants/${item.tenantId}`)}
                className={`px-4 py-3 flex items-start gap-3 ${
                  item.tenantId ? 'hover:bg-slate-800/40 cursor-pointer' : ''
                }`}
              >
                <ActivityIcon kind={item.kind} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white">{item.text}</div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    {new Date(item.at).toLocaleString()}
                    {item.ref && <> • {item.ref}</>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ActivityIcon({ kind }: { kind: ActivityItem['kind'] }) {
  if (kind === 'signup') {
    return (
      <div className="h-8 w-8 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
        <UserPlus className="h-4 w-4" />
      </div>
    );
  }
  if (kind === 'support') {
    return (
      <div className="h-8 w-8 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
        <LifeBuoy className="h-4 w-4" />
      </div>
    );
  }
  return (
    <div className="h-8 w-8 rounded-full bg-violet-500/10 text-violet-400 flex items-center justify-center shrink-0">
      <ShieldAlert className="h-4 w-4" />
    </div>
  );
}
