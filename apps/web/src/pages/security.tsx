import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, ShieldCheck, ShieldAlert, Copy, Check } from 'lucide-react';

interface MfaStatus {
  enabled: boolean;
  provider: string | null;
  required: boolean;
}

interface MfaSetupData {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export function SecurityPage() {
  const { user } = useAuth();
  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
  const [setupData, setSetupData] = useState<MfaSetupData | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedCodes, setCopiedCodes] = useState(false);

  useEffect(() => {
    api<MfaStatus>('/auth/mfa/status').then(setMfaStatus).catch(() => {});
  }, []);

  async function startSetup() {
    setError('');
    setLoading(true);
    try {
      const data = await api<MfaSetupData>('/auth/mfa/setup', { method: 'POST' });
      setSetupData(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start MFA setup');
    } finally {
      setLoading(false);
    }
  }

  async function verifySetup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api('/auth/mfa/setup/verify', {
        method: 'POST',
        body: JSON.stringify({ code: verifyCode }),
      });
      setSuccess('MFA enabled successfully!');
      setSetupData(null);
      setVerifyCode('');
      setMfaStatus({ enabled: true, provider: 'built_in', required: mfaStatus?.required ?? false });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  async function disableMfa(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api('/auth/mfa/disable', {
        method: 'POST',
        body: JSON.stringify({ code: disableCode }),
      });
      setSuccess('MFA disabled');
      setShowDisable(false);
      setDisableCode('');
      setMfaStatus({ enabled: false, provider: null, required: mfaStatus?.required ?? false });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to disable MFA');
    } finally {
      setLoading(false);
    }
  }

  function copyBackupCodes() {
    if (!setupData) return;
    navigator.clipboard.writeText(setupData.backupCodes.join('\n'));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  }

  return (
    <div className="max-w-2xl space-y-6">
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 text-green-800 text-sm p-3 rounded-md border border-green-200">{success}</div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Two-Factor Authentication
              </CardTitle>
              <CardDescription className="mt-1">
                Add an extra layer of security to your account
              </CardDescription>
            </div>
            {mfaStatus && (
              <Badge variant={mfaStatus.enabled ? 'default' : 'outline'} className="flex items-center gap-1">
                {mfaStatus.enabled ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                {mfaStatus.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            )}
          </div>
          {mfaStatus?.required && !mfaStatus.enabled && (
            <div className="bg-yellow-50 text-yellow-800 text-sm p-3 rounded-md border border-yellow-200 mt-3">
              Your organization requires MFA. Please enable it below.
            </div>
          )}
        </CardHeader>
        <CardContent>
          {/* MFA is OFF — show enable button */}
          {mfaStatus && !mfaStatus.enabled && !setupData && (
            <Button onClick={startSetup} disabled={loading}>
              {loading ? 'Setting up...' : 'Enable MFA'}
            </Button>
          )}

          {/* MFA setup flow — show QR code */}
          {setupData && (
            <div className="space-y-6">
              <div className="space-y-3">
                <h3 className="font-medium">1. Scan this QR code with your authenticator app</h3>
                <p className="text-sm text-muted-foreground">
                  Use Google Authenticator, Microsoft Authenticator, Authy, or any TOTP-compatible app.
                </p>
                <div className="flex justify-center p-4 bg-white rounded-lg border">
                  <img src={setupData.qrCode} alt="MFA QR Code" className="w-48 h-48" />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Can't scan? Enter this key manually: <code className="bg-muted px-1 py-0.5 rounded text-xs">{setupData.secret}</code>
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-medium">2. Save your backup codes</h3>
                <p className="text-sm text-muted-foreground">
                  Store these in a safe place. Each code can only be used once.
                </p>
                <div className="bg-muted p-4 rounded-lg relative">
                  <div className="grid grid-cols-2 gap-1 font-mono text-sm">
                    {setupData.backupCodes.map((code) => (
                      <div key={code}>{code}</div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={copyBackupCodes}
                  >
                    {copiedCodes ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </div>

              <form onSubmit={verifySetup} className="space-y-3">
                <h3 className="font-medium">3. Verify setup</h3>
                <p className="text-sm text-muted-foreground">
                  Enter the 6-digit code from your authenticator app to complete setup.
                </p>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="000000"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    className="w-40 text-center text-lg tracking-widest"
                    autoComplete="one-time-code"
                  />
                  <Button type="submit" disabled={loading || verifyCode.length < 6}>
                    {loading ? 'Verifying...' : 'Verify & Enable'}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* MFA is ON — show disable option */}
          {mfaStatus?.enabled && !showDisable && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                MFA is enabled via {mfaStatus.provider === 'built_in' ? 'authenticator app' : mfaStatus.provider}.
              </p>
              <Button variant="destructive" size="sm" onClick={() => setShowDisable(true)}>
                Disable MFA
              </Button>
            </div>
          )}

          {/* Disable confirmation */}
          {showDisable && (
            <form onSubmit={disableMfa} className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Enter your current MFA code to disable two-factor authentication.
              </p>
              <div className="flex gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  className="w-40 text-center"
                />
                <Button type="submit" variant="destructive" disabled={loading || disableCode.length < 6}>
                  {loading ? 'Disabling...' : 'Confirm Disable'}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setShowDisable(false); setDisableCode(''); }}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SSO Configuration</CardTitle>
          <CardDescription>
            Single Sign-On integration with identity providers (coming soon)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Badge variant="outline">Planned</Badge>
            <span>Microsoft Entra ID, Duo, SAML 2.0, OIDC</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
