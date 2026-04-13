import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

export type ConfirmTone = 'default' | 'warning' | 'danger';

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  requirePhrase?: string; // if set, user must type this phrase to enable the confirm button
}

interface OpenState extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

let _open: ((opts: ConfirmOptions) => Promise<boolean>) | null = null;

/**
 * Imperative API: `await confirm({ title: '...', description: '...' })`
 * Returns true if the user clicked confirm, false if they cancelled.
 * The provider must be mounted somewhere at the root of the app.
 */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  if (!_open) {
    // Fallback to native if provider isn't mounted
    return Promise.resolve(window.confirm(opts.description ? `${opts.title}\n\n${String(opts.description)}` : opts.title));
  }
  return _open(opts);
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OpenState | null>(null);
  const [phrase, setPhrase] = useState('');
  const [working, setWorking] = useState(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const open = useCallback((opts: ConfirmOptions) => {
    setPhrase('');
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  useEffect(() => { _open = open; return () => { _open = null; }; }, [open]);

  useEffect(() => {
    if (state && cancelRef.current) cancelRef.current.focus();
  }, [state]);

  if (!state) return <>{children}</>;

  const phraseRequired = !!state.requirePhrase;
  const phraseOk = !phraseRequired || phrase.trim() === state.requirePhrase!.trim();

  const toneStyles = {
    default: { ring: 'ring-slate-700', icon: 'text-brand-400 bg-brand-500/10', btn: 'bg-brand-600 hover:bg-brand-700' },
    warning: { ring: 'ring-amber-700/50', icon: 'text-amber-400 bg-amber-500/10', btn: 'bg-amber-600 hover:bg-amber-700' },
    danger: { ring: 'ring-red-700/50', icon: 'text-red-400 bg-red-500/10', btn: 'bg-red-600 hover:bg-red-700' },
  }[state.tone ?? 'default'];

  function close(confirmed: boolean) {
    if (!state) return;
    setWorking(true);
    // Give the resolve a tick so the UI state changes visibly
    queueMicrotask(() => {
      state.resolve(confirmed);
      setState(null);
      setWorking(false);
      setPhrase('');
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); close(false); }
    if (e.key === 'Enter' && phraseOk && !working) { e.preventDefault(); close(true); }
  }

  return (
    <>
      {children}
      <div
        className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        onClick={(e) => { if (e.target === e.currentTarget) close(false); }}
        onKeyDown={onKeyDown}
      >
        <div className={`bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-md ring-1 ${toneStyles.ring}`}>
          <div className="flex items-start justify-between px-6 pt-5 pb-3">
            <div className="flex items-start gap-3">
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-md shrink-0 ${toneStyles.icon}`}>
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-semibold text-white">{state.title}</div>
                {state.description && (
                  <div className="text-sm text-slate-400 mt-1 leading-relaxed">{state.description}</div>
                )}
              </div>
            </div>
            <button
              onClick={() => close(false)}
              className="text-slate-500 hover:text-slate-200 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {phraseRequired && (
            <div className="px-6 pb-2">
              <label className="block text-xs text-slate-400 mb-1.5">
                Type <span className="font-mono text-slate-200 bg-slate-950 px-1.5 py-0.5 rounded">{state.requirePhrase}</span> to confirm
              </label>
              <input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 rounded-md bg-slate-950 border border-slate-800 focus:border-red-600 focus:ring-2 focus:ring-red-600/20 outline-none text-sm text-white"
              />
            </div>
          )}

          <div className="px-6 pb-5 pt-3 flex gap-2 justify-end">
            <button
              ref={cancelRef}
              onClick={() => close(false)}
              disabled={working}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            >
              {state.cancelLabel ?? 'Cancel'}
            </button>
            <button
              onClick={() => close(true)}
              disabled={working || !phraseOk}
              className={`${toneStyles.btn} text-white px-4 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2`}
            >
              {working && <Loader2 className="h-4 w-4 animate-spin" />}
              {state.confirmLabel ?? 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
