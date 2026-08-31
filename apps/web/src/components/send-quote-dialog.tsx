import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Send } from 'lucide-react';

interface Recipients {
  contactEmail: string | null;
  billingEmail: string | null;
}

export function SendQuoteDialog({ quoteId, quoteNumber, isResend, open, onOpenChange, onSent }: {
  quoteId: string;
  quoteNumber: number;
  isResend: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState('');
  const [prefillSource, setPrefillSource] = useState<'contact' | 'billing' | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    api<Recipients>(`/quotes/${quoteId}/recipients`)
      .then(r => {
        if (r.contactEmail) {
          setTo(r.contactEmail);
          setPrefillSource('contact');
        } else if (r.billingEmail) {
          setTo(r.billingEmail);
          setPrefillSource('billing');
        } else {
          setTo('');
          setPrefillSource(null);
        }
      })
      .catch(() => { setTo(''); setPrefillSource(null); });
  }, [open, quoteId]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      await api(`/quotes/${quoteId}/send`, { method: 'POST', body: JSON.stringify({ to }) });
      onOpenChange(false);
      onSent();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isResend ? 'Resend' : 'Send'} Quote #{quoteNumber}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSend} className="space-y-4">
          <div className="space-y-2">
            <Label>Recipient email</Label>
            <Input
              type="email"
              required
              value={to}
              onChange={e => setTo(e.target.value)}
              placeholder="customer@company.com"
            />
            {prefillSource && (
              <p className="text-xs text-muted-foreground">
                Prefilled from the {prefillSource === 'contact' ? "quote's contact" : "customer's billing email"} — edit if needed.
              </p>
            )}
            {!prefillSource && (
              <p className="text-xs text-amber-600">
                No contact or billing email on file — enter the recipient manually.
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            The email includes the quote PDF and a secure link for the customer to review, approve, and e-sign.
            {isResend && ' Resending invalidates any previously emailed approval link.'}
          </p>
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm p-3 rounded-md border border-red-200 dark:border-red-800">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={sending || !to}>
              <Send className="h-4 w-4 mr-1" />
              {sending ? 'Sending…' : isResend ? 'Resend Quote' : 'Send Quote'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
