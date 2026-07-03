import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { api } from '@/lib/api';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, User, Sun, Moon, Menu, Settings as SettingsIcon, Bell, Play, Square, Ticket, Receipt, FileText, DollarSign, AlertCircle } from 'lucide-react';
import { useTimer } from '@/lib/timer';
import { useToast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils';

// Compact relative-time helper for notification items ("2h ago")
function relativeTime(dateStr: string): string {
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// Icon per notification entity/type
function NotificationIcon({ entityType }: { entityType: string }) {
  const cls = 'h-4 w-4';
  switch (entityType) {
    case 'ticket': return <Ticket className={`${cls} text-blue-500`} />;
    case 'invoice': return <Receipt className={`${cls} text-emerald-500`} />;
    case 'quote': return <FileText className={`${cls} text-violet-500`} />;
    case 'payment': return <DollarSign className={`${cls} text-emerald-500`} />;
    default: return <AlertCircle className={`${cls} text-amber-500`} />;
  }
}

interface HeaderProps {
  title: string;
  onNavigate: (path: string) => void;
  onMenuToggle: () => void;
}

export function Header({ title, onNavigate, onMenuToggle }: HeaderProps) {
  const { user, logout } = useAuth();
  const { mode, setMode } = useTheme();
  const timer = useTimer();
  const toast = useToast();

  async function handleStopTimer() {
    const result = await timer.stopTimer();
    if (!result) return;
    if (timer.ticketId) {
      // Auto-create time entry
      const now = new Date().toISOString();
      try {
        await api(`/tickets/${timer.ticketId}/time-entries`, {
          method: 'POST',
          body: JSON.stringify({
            ticketId: timer.ticketId,
            startedAt: now, endedAt: now,
            durationMinutes: result.durationMinutes,
            isBillable: true,
            notes: 'Timer entry',
          }),
        });
      } catch (e) {
        // Keep the tracked time so it isn't lost — let the user retry.
        toast.error('Failed to save time entry', e instanceof Error ? e.message : 'Timer was kept — try again.');
        return;
      }
      timer.clearTimer();
    } else {
      // No ticket associated
      timer.clearTimer();
      console.log(`Timer stopped: ${result.durationMinutes} minutes. No ticket was associated.`);
    }
  }

  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationList, setNotificationList] = useState<Array<{id: string; type: string; title: string; body: string; entityType: string; entityId: string; isRead: boolean; createdAt: string}>>([]);

  useEffect(() => {
    api<{count: number}>('/notifications/unread-count').then(d => setUnreadCount(d.count)).catch(() => {});
    const interval = setInterval(() => {
      api<{count: number}>('/notifications/unread-count').then(d => setUnreadCount(d.count)).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const initials = user?.displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '??';

  function openCommandPalette() {
    window.dispatchEvent(new CustomEvent('open-command-palette'));
  }

  return (
    <header className="h-14 border-b bg-card px-3 sm:px-6 flex items-center justify-between sticky top-0 z-10 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 lg:hidden" onClick={onMenuToggle} aria-label="Toggle navigation menu">
          <Menu className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-semibold tracking-tight truncate">{title}</h2>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Command palette search hint */}
        <button
          onClick={openCommandPalette}
          className="hidden sm:flex items-center text-muted-foreground text-sm border rounded-md px-3 py-1 hover:bg-accent transition-colors"
        >
          Search... <kbd className="ml-2 text-[10px] opacity-50 bg-muted px-1 py-0.5 rounded font-mono">Ctrl+K</kbd>
        </button>

        {/* Global timer */}
        {timer.isRunning && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
            <span className="font-mono text-sm font-bold text-red-600 dark:text-red-400">{timer.elapsed}</span>
            {timer.ticketNumber && (
              <span className="text-xs text-red-500 dark:text-red-400">#{timer.ticketNumber}</span>
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-600 hover:text-red-700" onClick={handleStopTimer}>
              <Square className="h-3 w-3 fill-current" />
            </Button>
          </div>
        )}
        {!timer.isRunning && (
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Start timer"
            onClick={() => timer.startTimer()}>
            <Play className="h-4 w-4" />
          </Button>
        )}

        {/* Notification bell */}
        <DropdownMenu onOpenChange={(open) => {
          if (open) {
            api<Array<{id: string; type: string; title: string; body: string; entityType: string; entityId: string; isRead: boolean; createdAt: string}> | {data: Array<{id: string; type: string; title: string; body: string; entityType: string; entityId: string; isRead: boolean; createdAt: string}>}>('/notifications?limit=10')
              .then(d => setNotificationList(Array.isArray(d) ? d : (d as any).data || []))
              .catch(() => {});
          }
        }}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 relative" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              Notifications
              {unreadCount > 0 && (
                <button className="text-xs text-primary hover:underline" onClick={async () => {
                  await api('/notifications/read-all', { method: 'POST' });
                  setUnreadCount(0);
                  setNotificationList(prev => prev.map(n => ({...n, isRead: true})));
                }}>Mark all read</button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notificationList.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">No notifications</div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                {notificationList.slice(0, 10).map(n => (
                  <DropdownMenuItem key={n.id} className={`flex items-start gap-2.5 p-3 ${!n.isRead ? 'bg-primary/5' : ''}`}
                    onClick={() => {
                      api(`/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => {});
                      setNotificationList(prev => prev.map(x => x.id === n.id ? { ...x, isRead: true } : x));
                      setUnreadCount(c => Math.max(0, c - (n.isRead ? 0 : 1)));
                      if (n.entityType === 'ticket' && n.entityId) onNavigate(`/tickets/${n.entityId}`);
                    }}>
                    <div className="mt-0.5 shrink-0"><NotificationIcon entityType={n.entityType} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {!n.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                        <span className={`text-sm truncate ${!n.isRead ? 'font-semibold' : 'font-medium'}`}>{n.title}</span>
                      </div>
                      {n.body && <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-2">{n.body}</span>}
                      <span className="mt-0.5 block text-[11px] text-muted-foreground" title={formatDateTime(n.createdAt)}>{relativeTime(n.createdAt)}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </div>
            )}
            <DropdownMenuSeparator />
            <button
              className="w-full py-2 text-center text-xs font-medium text-primary hover:underline"
              onClick={() => onNavigate('/notifications')}
            >
              View all notifications
            </button>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Dark/Light toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
          aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 outline-none">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium hidden sm:inline">{user?.displayName}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>
              <div className="text-sm font-medium">{user?.displayName}</div>
              <div className="text-xs text-muted-foreground">{user?.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onNavigate('/account')}>
              <User className="mr-2 h-4 w-4" />
              My Account
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNavigate('/settings')}>
              <SettingsIcon className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
