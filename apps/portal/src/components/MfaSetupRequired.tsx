import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandLockup } from '@/components/ui/brand-lockup';
import { Shield, Fingerprint, MessageSquare, LogOut, Check } from 'lucide-react';

export function MfaSetupRequired({ onDone, onLogout }: { onDone: () => void; onLogout: () => void }) {
  const [choice, setChoice] = useState<'passkey' | 'sms' | null>(null);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'choose' | 'phone' | 'verify'>('choose');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phoneHint, setPhoneHint] = useState('');

  async function setupPasskey() {
    setLoading(true); setError('');
    try {
      const { startRegistration } = await import('@simplewebauthn/browser');
      const options = await api<any>('/portal/auth/passkey/register-options', { method: 'POST', body: JSON.stringify({}) });
      const attResp = await startRegistration({ optionsJSON: options });
      await api('/portal/auth/passkey/register', { method: 'POST', body: JSON.stringify(attResp) });
      onDone();
    } catch (err: any) {
      setError(err.message || 'Failed to register passkey');
    } finally { setLoading(false); }
  }

  async function startSmsSetup() {
    setLoading(true); setError('');
    try {
      const res = await api<{ phoneHint: string }>('/portal/me/mfa/sms/setup', {
        method: 'POST', body: JSON.stringify({ phone, password }),
      });
      setPhoneHint(res.phoneHint);
      setStep('verify');
    } catch (err: any) {
      setError(err.message || 'Failed to send SMS');
    } finally { setLoading(false); }
  }

  async function verifySms() {
    setLoading(true); setError('');
    try {
      await api('/portal/me/mfa/sms/verify', { method: 'POST', body: JSON.stringify({ code }) });
      onDone();
    } catch (err: any) {
      setError(err.message || 'Invalid code');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-4 flex justify-center">
            <BrandLockup size="md" />
          </div>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Shield className="h-7 w-7" />
          </div>
          <CardTitle className="text-center">Secure your account</CardTitle>
          <p className="text-center text-sm text-muted-foreground mt-2">
            You've signed in 3+ times without two-factor authentication. Please set up a passkey or SMS verification to continue.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {step === 'choose' && !choice && (
            <div className="space-y-3">
              <button onClick={() => setChoice('passkey')} className="w-full text-left border rounded-lg p-4 hover:bg-muted/50 transition-colors flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0"><Fingerprint className="h-5 w-5" /></div>
                <div>
                  <div className="font-semibold">Use a Passkey (Recommended)</div>
                  <div className="text-sm text-muted-foreground">Sign in with your fingerprint, face, or security key. No codes to type.</div>
                </div>
              </button>
              <button onClick={() => { setChoice('sms'); setStep('phone'); }} className="w-full text-left border rounded-lg p-4 hover:bg-muted/50 transition-colors flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0"><MessageSquare className="h-5 w-5" /></div>
                <div>
                  <div className="font-semibold">Use SMS Text Message</div>
                  <div className="text-sm text-muted-foreground">Get a 6-digit code sent to your phone when you sign in.</div>
                </div>
              </button>
            </div>
          )}

          {choice === 'passkey' && step === 'choose' && (
            <div className="space-y-3">
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-900 dark:bg-blue-900/30">
                When you click below, your device will prompt you to create a passkey using your fingerprint, face, or PIN.
              </div>
              <Button onClick={setupPasskey} className="w-full h-11" disabled={loading}>
                <Fingerprint className="h-4 w-4 mr-2" />
                {loading ? 'Setting up...' : 'Create Passkey'}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setChoice(null)}>Back</Button>
            </div>
          )}

          {choice === 'sms' && step === 'phone' && (
            <div className="space-y-3">
              <Label>Phone Number</Label>
              <Input
                type="tel"
                placeholder="(555) 555-5555"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">We'll send a 6-digit verification code to confirm this number.</p>
              <Label>Confirm your password</Label>
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="Your account password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">For your security, confirm your password to set the verification number.</p>
              <Button onClick={startSmsSetup} className="w-full h-11" disabled={loading || phone.length < 10 || !password}>
                {loading ? 'Sending...' : 'Send Code'}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => { setChoice(null); setStep('choose'); }}>Back</Button>
            </div>
          )}

          {choice === 'sms' && step === 'verify' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-900/30">
                <Check className="h-4 w-4 text-green-700 dark:text-green-400" /> Code sent to {phoneHint}
              </div>
              <Label>Enter 6-digit code</Label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                className="h-12 text-center text-2xl tracking-widest font-mono"
              />
              <Button onClick={verifySms} className="w-full h-11" disabled={loading || code.length !== 6}>
                {loading ? 'Verifying...' : 'Verify & Enable'}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setStep('phone')}>Try a different number</Button>
            </div>
          )}

          <div className="pt-4 border-t text-center">
            <Button variant="ghost" size="sm" onClick={onLogout} className="text-muted-foreground">
              <LogOut className="h-3.5 w-3.5 mr-1" />Sign out instead
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
