import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageSquare, ArrowLeft } from 'lucide-react';

export function MfaChallenge({
  phoneHint, onVerify, onCancel,
}: {
  phoneHint: string;
  onVerify: (code: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await onVerify(code);
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-blue-100 text-blue-700 mb-4">
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
          <div className="space-y-2">
            <Label>Verification Code</Label>
            <Input
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
          <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
            <ArrowLeft className="h-4 w-4 mr-1" />Back to login
          </Button>
        </form>
      </div>
    </div>
  );
}
