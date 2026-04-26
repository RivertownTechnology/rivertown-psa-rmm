import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Library, Plus, ShieldCheck, ChevronRight, Loader2, CheckCircle2 } from 'lucide-react';

interface Framework {
  id: string;
  name: string;
  shortName: string;
  version: string | null;
  description: string | null;
  source: string;
  controlCount: number;
  policyAreaCount: number;
  customerCount: number;
}

export function ComplianceFrameworksPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSeedDialog, setShowSeedDialog] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState('');
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [customForm, setCustomForm] = useState({ name: '', shortName: '', version: '', description: '' });
  const [savingCustom, setSavingCustom] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Framework[]>('/compliance/frameworks');
      setFrameworks(data);
    } catch { /* */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function seedFramework(type: string) {
    setSeeding(true);
    setSeedResult('');
    try {
      const res = await api<any>(`/compliance/frameworks/seed/${type}`, { method: 'POST' });
      setSeedResult(res.message || `${type} framework created with ${res.controlCount ?? 0} controls`);
      load();
    } catch (e: any) {
      setSeedResult(`Error: ${e.message}`);
    }
    finally { setSeeding(false); }
  }

  async function createCustom() {
    setSavingCustom(true);
    try {
      await api('/compliance/frameworks', { method: 'POST', body: JSON.stringify(customForm) });
      setShowCustomDialog(false);
      load();
    } catch { /* */ }
    finally { setSavingCustom(false); }
  }

  if (loading) return <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setShowSeedDialog(true)}>
          <ShieldCheck className="h-4 w-4 mr-1" /> Import Built-in Framework
        </Button>
        <Button onClick={() => { setCustomForm({ name: '', shortName: '', version: '', description: '' }); setShowCustomDialog(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Custom Framework
        </Button>
      </div>

      {frameworks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Library className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Frameworks</h3>
            <p className="text-muted-foreground mb-4">Import a built-in compliance framework to get started.</p>
            <Button onClick={() => setShowSeedDialog(true)}>
              <ShieldCheck className="h-4 w-4 mr-1" /> Import CJIS, HIPAA, or PCI-DSS
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {frameworks.map(fw => (
            <Card key={fw.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onNavigate(`/compliance/frameworks/${fw.id}`)}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold">{fw.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">{fw.shortName}</Badge>
                      {fw.version && <span className="text-xs text-muted-foreground">v{fw.version}</span>}
                      <Badge variant="secondary" className="text-[10px]">{fw.source}</Badge>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
                </div>
                {fw.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{fw.description}</p>}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{fw.policyAreaCount} policy areas</span>
                  <span>{fw.controlCount} controls</span>
                  <span>{fw.customerCount} customers</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Seed Dialog */}
      <Dialog open={showSeedDialog} onOpenChange={setShowSeedDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Import Built-in Framework</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Select a compliance framework to import with all policy areas and controls pre-configured.</p>
            {(['cjis', 'hipaa', 'pci'] as const).map(type => {
              const labels: Record<string, { name: string; desc: string }> = {
                cjis: { name: 'CJIS Security Policy v6.0', desc: 'FBI Criminal Justice Information Services — for law enforcement IT' },
                hipaa: { name: 'HIPAA Security Rule', desc: 'Health Insurance Portability — for healthcare IT' },
                pci: { name: 'PCI-DSS v4.0', desc: 'Payment Card Industry — for payment processing' },
              };
              const info = labels[type];
              return (
                <button
                  key={type}
                  disabled={seeding}
                  onClick={() => seedFramework(type)}
                  className="w-full text-left rounded-lg border p-3 hover:border-primary/50 transition-colors disabled:opacity-50"
                >
                  <div className="font-medium text-sm">{info.name}</div>
                  <div className="text-xs text-muted-foreground">{info.desc}</div>
                </button>
              );
            })}
            {seeding && <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Importing...</div>}
            {seedResult && (
              <div className={`text-sm p-2 rounded ${seedResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {seedResult.startsWith('Error') ? seedResult : <><CheckCircle2 className="h-4 w-4 inline mr-1" />{seedResult}</>}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom Framework Dialog */}
      <Dialog open={showCustomDialog} onOpenChange={setShowCustomDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create Custom Framework</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={customForm.name} onChange={e => setCustomForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. SOC 2 Type II" /></div>
            <div><Label>Short Name</Label><Input value={customForm.shortName} onChange={e => setCustomForm(f => ({ ...f, shortName: e.target.value }))} placeholder="e.g. SOC2" /></div>
            <div><Label>Version</Label><Input value={customForm.version} onChange={e => setCustomForm(f => ({ ...f, version: e.target.value }))} placeholder="e.g. 2.0" /></div>
            <div><Label>Description</Label><Input value={customForm.description} onChange={e => setCustomForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomDialog(false)}>Cancel</Button>
            <Button disabled={savingCustom || !customForm.name || !customForm.shortName} onClick={createCustom}>
              {savingCustom ? 'Creating...' : 'Create Framework'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
