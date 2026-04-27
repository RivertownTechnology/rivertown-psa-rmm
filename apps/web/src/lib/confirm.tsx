import { useState, useCallback, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'default' | 'destructive';
}

interface ConfirmAPI {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmCtx = createContext<ConfirmAPI>({ confirm: async () => false });

export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<{
    options: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const confirmFn = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setDialog({ options, resolve });
    });
  }, []);

  function handleConfirm() {
    dialog?.resolve(true);
    setDialog(null);
  }

  function handleCancel() {
    dialog?.resolve(false);
    setDialog(null);
  }

  return (
    <ConfirmCtx.Provider value={{ confirm: confirmFn }}>
      {children}
      {dialog && (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => { if (!open) handleCancel(); }}
          title={dialog.options.title}
          description={dialog.options.description}
          confirmLabel={dialog.options.confirmLabel || 'Confirm'}
          variant={dialog.options.variant || 'destructive'}
          onConfirm={handleConfirm}
          loading={loading}
        />
      )}
    </ConfirmCtx.Provider>
  );
}
