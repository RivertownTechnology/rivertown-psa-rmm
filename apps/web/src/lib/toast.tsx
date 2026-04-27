import { useState, useCallback, createContext, useContext, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
}

interface ToastAPI {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastCtx = createContext<ToastAPI>({
  success: () => {}, error: () => {}, warning: () => {}, info: () => {},
});

export const useToast = () => useContext(ToastCtx);

const ICONS = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };
const STYLES = {
  success: 'border-emerald-500/30 bg-emerald-950/90 text-emerald-400',
  error: 'border-red-500/30 bg-red-950/90 text-red-400',
  warning: 'border-amber-500/30 bg-amber-950/90 text-amber-400',
  info: 'border-blue-500/30 bg-blue-950/90 text-blue-400',
};

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const add = useCallback((type: ToastItem['type'], title: string, description?: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev.slice(-4), { id, type, title, description }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const api: ToastAPI = {
    success: (t, d) => add('success', t, d),
    error: (t, d) => add('error', t, d),
    warning: (t, d) => add('warning', t, d),
    info: (t, d) => add('info', t, d),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 pointer-events-none">
        {toasts.map(t => {
          const Icon = ICONS[t.type];
          return (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm',
                'animate-in slide-in-from-right-5 fade-in duration-200',
                STYLES[t.type],
              )}
            >
              <Icon className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{t.title}</p>
                {t.description && <p className="text-xs opacity-70 mt-0.5">{t.description}</p>}
              </div>
              <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} className="shrink-0 opacity-50 hover:opacity-100 pointer-events-auto">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
