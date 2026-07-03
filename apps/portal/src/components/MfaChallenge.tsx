import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandLockup } from '@/components/ui/brand-lockup';
import { MessageSquare, ArrowLeft } from 'lucide-react';

const RESEND_COOLDOWN = 30; // seconds

export function MfaChallenge({
  phoneHint, onVerify, onCancel, onResend,
}: {
  phoneHint: string;
  onVerify: (code: string) => Promise<void>;
  onCancel: () => void;
  onResend?: () => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resending, setResending] = useState(false);
  const [resentNotice, setResentNotice] = useState('');
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await onVerify(code);
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally { setLoading(false); }
  }

  async function handleResend() {
    if (!onResend || resending || cooldown > 0) return;
    setResending(true); setError(''); setResentNotice('');
    try {
      await onResend();
      setResentNotice('A new code is on its way.');
      setCooldown(RESEND_COOLDOWN);
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    } finally { setResending(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <BrandLockup size="md" />
        </div>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 mb-4">
            <MessageSquare className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">Verify it's you</h1>
          <p className="text-muted-foreground mt-2">
            We sent a 6-digit code to <strong>{phoneHint}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          {resentNotice && !error && (
            <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800 dark:bg-green-900/30 dark:border-green-900 dark:text-green-300">
              {resentNotice}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="mfa-code">Verification Code</Label>
            <Input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
              className="h-12 text-center text-2xl tracking-widest font-mono"
            />
          </div>
          <Button type="submit" className="w-full h-11" disabled={loading || code.length !== 6}>
            {loading ? 'Verifying...' : 'Verify'}
          </Button>
          {onResend && (
            <div className="text-center text-sm text-muted-foreground">
              Didn't get a code?{' '}
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || cooldown > 0}
                className="font-medium text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
              >
                {resending ? 'Sending...' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          )}
          <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
            <ArrowLeft className="h-4 w-4 mr-1" />Back to login
          </Button>
        </form>
      </div>
    </div>
  );
}
