import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Library, ShieldCheck, FileText, BookOpen, Building2, Users,
  ChevronRight, Plus, Loader2, CheckCircle2, Settings,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Framework {
  id: string; name: string; shortName: string; version: string | null;
  source: string; controlCount: number; policyAreaCount: number; customerCount: number;
}

export function ComplianceAdminPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [tab, setTab] = useState('frameworks');
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState('');

  // Stats
  const [stats, setStats] = useState<any>(null);

  const loadFrameworks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Framework[]>('/compliance/frameworks');
      setFrameworks(data);
    } catch { /* */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadFrameworks(); }, [loadFrameworks]);
  useEffect(() => {
    api<any>('/compliance/dashboard').then(setStats).catch(() => {});
  }, []);

  async function importFramework(type: string) {
    setImporting(true); setImportResult('');
    try {
      const res = await api<any>(`/compliance/frameworks/seed/${type}`, { method: 'POST' });
      setImportResult(res.message || 'Imported');
      loadFrameworks();
    } catch (e: any) { setImportResult(`Error: ${e.message}`); }
    finally { setImporting(false); }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Compliance Administration</h2>
          <p className="text-sm text-muted-foreground">Manage frameworks, templates, and global compliance settings</p>
        </div>
      </div>

      {/* Quick Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <Library className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <div className="text-2xl font-bold">{frameworks.length}</div>
              <div className="text-xs text-muted-foreground">Frameworks</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <ShieldCheck className="h-5 w-5 mx-auto text-blue-500 mb-1" />
              <div className="text-2xl font-bold">{stats.scopedCustomers ?? 0}</div>
              <div className="text-xs text-muted-foreground">Scoped Customers</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{stats.totalAssessments ?? 0}</div>
              <div className="text-xs text-muted-foreground">Total Assessments</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.openPoamItems ?? 0}</div>
              <div className="text-xs text-muted-foreground">Open POA&M</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="frameworks"><Library className="h-4 w-4 mr-1" /> Frameworks</TabsTrigger>
          <TabsTrigger value="policies"><FileText className="h-4 w-4 mr-1" /> Policy Templates</TabsTrigger>
          <TabsTrigger value="training"><BookOpen className="h-4 w-4 mr-1" /> Training</TabsTrigger>
          <TabsTrigger value="vendors"><Building2 className="h-4 w-4 mr-1" /> Vendor Templates</TabsTrigger>
          <TabsTrigger value="personnel"><Users className="h-4 w-4 mr-1" /> Personnel</TabsTrigger>
        </TabsList>

        {/* Frameworks Tab */}
        <TabsContent value="frameworks">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => { setImportResult(''); setShowImport(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Import Framework
              </Button>
            </div>

            {loading ? <Skeleton className="h-64" /> : frameworks.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Library className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Frameworks</h3>
                  <p className="text-muted-foreground mb-4">Import a built-in compliance framework to get started.</p>
                  <Button onClick={() => setShowImport(true)}>Import Framework</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {frameworks.map(fw => (
                  <Card key={fw.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onNavigate(`/compliance/admin/frameworks/${fw.id}`)}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold">{fw.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">{fw.shortName}</Badge>
                            {fw.version && <span className="text-xs text-muted-foreground">v{fw.version}</span>}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{fw.policyAreaCount} areas</span>
                        <span>{fw.controlCount} controls</span>
                        <span>{fw.customerCount} customers</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Policy Templates */}
        <TabsContent value="policies">
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-2">Policy Templates</p>
              <p className="text-sm text-muted-foreground">Create reusable policy templates that can be deployed across customers.</p>
              <Button variant="outline" className="mt-4" onClick={() => onNavigate('/compliance/policies')}>Manage Policies</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Training */}
        <TabsContent value="training">
          <Card>
            <CardContent className="py-12 text-center">
              <BookOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-2">Training Management</p>
              <p className="text-sm text-muted-foreground">Track security awareness training, CJIS certification, and compliance training across all customers.</p>
              <Button variant="outline" className="mt-4" onClick={() => onNavigate('/compliance/training')}>Manage Training</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vendors */}
        <TabsContent value="vendors">
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-2">Vendor & Business Associate Templates</p>
              <p className="text-sm text-muted-foreground">Manage vendor compliance requirements, BAA tracking, and third-party risk across customers.</p>
              <Button variant="outline" className="mt-4" onClick={() => onNavigate('/compliance/vendors')}>Manage Vendors</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Personnel */}
        <TabsContent value="personnel">
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-2">Personnel Screening</p>
              <p className="text-sm text-muted-foreground">Background checks, CJIS fingerprinting, and personnel security for internal staff and customer contacts.</p>
              <Button variant="outline" className="mt-4" onClick={() => onNavigate('/compliance/personnel')}>Manage Personnel</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Import Framework Dialog */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Import Framework</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Select a compliance framework to import with all policy areas and controls.</p>
            {[
              { type: 'cjis', name: 'CJIS Security Policy v6.0', desc: 'FBI Criminal Justice Information Services' },
              { type: 'cmmc', name: 'CMMC Level 2 (NIST 800-171)', desc: 'Cybersecurity Maturity Model Certification' },
              { type: 'hipaa', name: 'HIPAA Security Rule', desc: 'Health Insurance Portability & Accountability' },
              { type: 'pci', name: 'PCI-DSS v4.0', desc: 'Payment Card Industry Data Security Standard' },
            ].map(fw => (
              <button key={fw.type} disabled={importing} onClick={() => importFramework(fw.type)}
                className="w-full text-left rounded-lg border p-3 hover:border-primary/50 transition-colors disabled:opacity-50">
                <div className="font-medium text-sm">{fw.name}</div>
                <div className="text-xs text-muted-foreground">{fw.desc}</div>
              </button>
            ))}
            {importing && <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Importing...</div>}
            {importResult && (
              <div className={`text-sm p-2 rounded ${importResult.startsWith('Error') ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'}`}>
                {!importResult.startsWith('Error') && <CheckCircle2 className="h-4 w-4 inline mr-1" />}{importResult}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
