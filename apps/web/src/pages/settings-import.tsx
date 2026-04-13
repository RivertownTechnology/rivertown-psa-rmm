import { useEffect, useState } from 'react';
import {
  Upload, FileSpreadsheet, Users, Monitor, Package, Contact,
  Loader2, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, Lock, X, Plus, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError } from '@/lib/api';
import { useFeature } from '@/lib/auth';

interface TemplateInfo {
  entity: string;
  source: string;
  defaultMapping: Record<string, string>;
  targetFields: string[];
  expectedHeaders: string[];
}

interface PreviewRow {
  rowNumber: number;
  customer: {
    name: string;
    status: string;
    customerType: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    externalId: string | null;
    externalNumber: string | null;
    customFields: Record<string, unknown>;
  };
  warnings: string[];
}

interface PreviewResult {
  filename: string;
  headers: string[];
  totalRows: number;
  readyRows: number;
  errorCount: number;
  errors: { row: number; message: string }[];
  preview: PreviewRow[];
}

interface ExecuteResult {
  jobId: string;
  totalRows: number;
  importedRows: number;
  updatedRows: number;
  failedRows: number;
  errors: { row: number; message: string }[];
}

interface CustomField {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: 'text' | 'number' | 'date' | 'boolean' | 'select';
  displayOrder: number;
  required: boolean;
}

export function SettingsImport() {
  const canImport = useFeature('data_import');

  if (!canImport) {
    return (
      <div className="mt-6">
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lock className="h-5 w-5 text-amber-600" />
              Data import is a Pro feature
            </CardTitle>
            <CardDescription>
              Importing customer, contact, asset, and product-catalog data from ConnectWise, Autotask, Halo, or CSV files is
              included on the Pro plan and above.{' '}
              <a href="/billing" className="text-primary underline">Upgrade your plan</a> to unlock it.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <Tabs defaultValue="connectwise">
        <TabsList>
          <TabsTrigger value="connectwise">ConnectWise</TabsTrigger>
          <TabsTrigger value="custom-fields">Custom fields</TabsTrigger>
          <TabsTrigger value="history">Import history</TabsTrigger>
        </TabsList>

        <TabsContent value="connectwise" className="space-y-4 mt-4">
          <ConnectWiseHub />
        </TabsContent>

        <TabsContent value="custom-fields" className="space-y-4 mt-4">
          <CustomFieldsManager entity="customer" />
        </TabsContent>

        <TabsContent value="history" className="space-y-4 mt-4">
          <ImportHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------- ConnectWise hub: picker for which data to import ------------- */

function ConnectWiseHub() {
  const [active, setActive] = useState<'companies' | 'contacts' | 'configurations' | 'catalog' | null>(null);

  if (active === 'companies') return <CompanyImportWizard onExit={() => setActive(null)} />;

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Export your data from ConnectWise (Companies → Export), then upload the file here.
        Each importer auto-detects ConnectWise's default column names but you can remap them.
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <ImporterCard
          icon={<Users className="h-5 w-5" />}
          title="Companies"
          desc="Customer records — name, type, status, address, phone, territory, sales rep."
          ready
          onClick={() => setActive('companies')}
        />
        <ImporterCard
          icon={<Contact className="h-5 w-5" />}
          title="Contacts"
          desc="People at each company — emails, phone numbers, titles."
          comingSoon
        />
        <ImporterCard
          icon={<Monitor className="h-5 w-5" />}
          title="Configurations"
          desc="Managed assets — servers, workstations, network devices, software."
          comingSoon
        />
        <ImporterCard
          icon={<Package className="h-5 w-5" />}
          title="Product Catalog"
          desc="Items you sell — SKUs, costs, prices, categories, vendors."
          comingSoon
        />
      </div>
    </div>
  );
}

function ImporterCard({
  icon, title, desc, onClick, ready, comingSoon,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick?: () => void;
  ready?: boolean;
  comingSoon?: boolean;
}) {
  return (
    <button
      onClick={ready ? onClick : undefined}
      disabled={!ready}
      className={`text-left border rounded-lg p-4 transition-all ${
        ready
          ? 'hover:border-primary hover:shadow-md bg-card cursor-pointer'
          : 'bg-muted/30 cursor-not-allowed opacity-70'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="font-semibold">{title}</div>
            {comingSoon && <span className="text-xs bg-muted px-2 py-0.5 rounded">Coming soon</span>}
            {ready && <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />}
          </div>
          <div className="text-sm text-muted-foreground mt-1">{desc}</div>
        </div>
      </div>
    </button>
  );
}

/* ------------- Company import wizard ------------- */

type WizardStep = 'upload' | 'map' | 'preview' | 'done';

function CompanyImportWizard({ onExit }: { onExit: () => void }) {
  const [step, setStep] = useState<WizardStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [template, setTemplate] = useState<TemplateInfo | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [extraFields, setExtraFields] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<TemplateInfo>('/imports/connectwise/companies/template').then((t) => {
      setTemplate(t);
      setMapping(t.defaultMapping);
    });
  }, []);

  // Transition from Upload → Map: quickly preview to discover ACTUAL file headers
  // (not just the defaults). MapStep then shows every column the file has.
  async function detectHeadersAndAdvance() {
    if (!file || !template) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('mapping', JSON.stringify(template.defaultMapping));
      const res = await apiForm<PreviewResult>('/imports/connectwise/companies/preview', form);
      const merged: Record<string, string> = {};
      for (const h of res.headers) {
        merged[h] = template.defaultMapping[h] ?? 'ignore';
      }
      setMapping(merged);
      setStep('map');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file headers');
    } finally {
      setLoading(false);
    }
  }

  async function runPreview() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('mapping', JSON.stringify(mapping));
      form.append('extraFields', JSON.stringify(extraFields));
      const res = await apiForm<PreviewResult>('/imports/connectwise/companies/preview', form);
      setPreview(res);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setLoading(false);
    }
  }

  async function runExecute() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('mapping', JSON.stringify(mapping));
      form.append('extraFields', JSON.stringify(extraFields));
      const res = await apiForm<ExecuteResult>('/imports/connectwise/companies/execute', form);
      setResult(res);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Import Companies from ConnectWise
          </CardTitle>
          <CardDescription>Upload your CW Companies export (.xlsx, .xls, or .csv)</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={onExit}><X className="h-4 w-4" /></Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress */}
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <StepDot done={step !== 'upload'} active={step === 'upload'} label="Upload" n={1} />
          <StepLine done={step !== 'upload'} />
          <StepDot done={step === 'preview' || step === 'done'} active={step === 'map'} label="Map columns" n={2} />
          <StepLine done={step === 'preview' || step === 'done'} />
          <StepDot done={step === 'done'} active={step === 'preview'} label="Preview" n={3} />
          <StepLine done={step === 'done'} />
          <StepDot done={step === 'done'} active={step === 'done'} label="Done" n={4} />
        </div>

        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {step === 'upload' && (
          <UploadStep
            file={file}
            setFile={setFile}
            expectedHeaders={template?.expectedHeaders ?? []}
            onNext={detectHeadersAndAdvance}
            loading={loading}
          />
        )}

        {step === 'map' && template && (
          <MapStep
            mapping={mapping}
            setMapping={setMapping}
            defaultMapping={template.defaultMapping}
            targetFields={template.targetFields}
            extraFields={extraFields}
            setExtraFields={setExtraFields}
            onBack={() => setStep('upload')}
            onNext={runPreview}
            loading={loading}
          />
        )}

        {step === 'preview' && preview && (
          <PreviewStep
            preview={preview}
            onBack={() => setStep('map')}
            onImport={runExecute}
            loading={loading}
          />
        )}

        {step === 'done' && result && (
          <DoneStep result={result} onRestart={() => {
            setFile(null); setPreview(null); setResult(null); setStep('upload');
          }} onExit={onExit} />
        )}
      </CardContent>
    </Card>
  );
}

function StepDot({ n, done, active, label }: { n: number; done: boolean; active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${
        done ? 'bg-primary text-primary-foreground' : active ? 'bg-primary/10 text-primary ring-1 ring-primary' : 'bg-muted text-muted-foreground'
      }`}>
        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
      </div>
      <span className={`hidden sm:inline ${active || done ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
    </div>
  );
}
function StepLine({ done }: { done: boolean }) {
  return <div className={`h-0.5 flex-1 ${done ? 'bg-primary' : 'bg-muted'}`} />;
}

function UploadStep({
  file, setFile, expectedHeaders, onNext, loading,
}: {
  file: File | null;
  setFile: (f: File | null) => void;
  expectedHeaders: string[];
  onNext: () => void;
  loading?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md p-4">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Expected ConnectWise columns
        </div>
        <div className="flex flex-wrap gap-1.5">
          {expectedHeaders.map((h) => (
            <span
              key={h}
              className="text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded font-mono"
            >
              {h}
            </span>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          If your file has different headers we'll detect them and let you map them in the next step.
        </p>
      </div>

      <label className={`block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
        file ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground'
      }`}>
        <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
        {file ? (
          <>
            <div className="font-medium">{file.name}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {(file.size / 1024).toFixed(1)} KB — click to choose a different file
            </div>
          </>
        ) : (
          <>
            <div className="font-medium">Drop your file here or click to browse</div>
            <div className="text-xs text-muted-foreground mt-1">.xlsx, .xls, or .csv up to 10 MB</div>
          </>
        )}
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!file || loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Next: map columns <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function MapStep({
  mapping, setMapping, defaultMapping, targetFields, extraFields, setExtraFields, onBack, onNext, loading,
}: {
  mapping: Record<string, string>;
  setMapping: (m: Record<string, string>) => void;
  defaultMapping: Record<string, string>;
  targetFields: readonly string[];
  extraFields: Record<string, string>;
  setExtraFields: (f: Record<string, string>) => void;
  onBack: () => void;
  onNext: () => void;
  loading: boolean;
}) {
  const [customKey, setCustomKey] = useState<Record<string, string>>({});
  const [newExtraKey, setNewExtraKey] = useState('');
  const [newExtraValue, setNewExtraValue] = useState('');

  const commonOptions = [
    { v: 'ignore', label: 'Skip this column' },
    { v: 'name', label: 'Name (required)' },
    { v: 'status', label: 'Status' },
    { v: 'customer_type', label: 'Customer type' },
    { v: 'lead_flag', label: 'Lead indicator' },
    { v: 'external_id', label: 'External ID (used for re-imports)' },
    { v: 'external_number', label: 'External number (CW Company ID)' },
    { v: 'phone', label: 'Phone' },
    { v: 'address', label: 'Address' },
    { v: 'city', label: 'City' },
    { v: 'state', label: 'State' },
    { v: 'zip', label: 'Zip' },
    { v: 'county', label: 'County' },
    { v: 'website', label: 'Website' },
    { v: 'billing_email', label: 'Billing email' },
    { v: 'cc_billing_email', label: 'CC billing email' },
    { v: 'notes', label: 'Notes' },
    { v: '__custom', label: 'Custom field…' },
  ];

  function addExtraField() {
    const key = newExtraKey.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!key) return;
    setExtraFields({ ...extraFields, [key]: newExtraValue });
    setNewExtraKey('');
    setNewExtraValue('');
  }

  function removeExtraField(key: string) {
    const next = { ...extraFields };
    delete next[key];
    setExtraFields(next);
  }

  return (
    <div className="space-y-5">
      <div className="text-sm text-muted-foreground">
        Every column in your file is listed below. Columns ForgePSA recognized are pre-mapped;
        anything unmapped goes to <em>Skip</em>. Pick <em>Custom field…</em> to create a new
        tenant-defined field on the fly.
      </div>

      {/* Mapping table — explicit colors so headers/cells are readable in any theme */}
      <div className="border border-slate-300 dark:border-slate-700 rounded-md overflow-hidden bg-white dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs uppercase tracking-wide border-b border-slate-300 dark:border-slate-700">
              <th className="text-left px-3 py-2.5 font-semibold w-5/12">File column</th>
              <th className="text-left px-3 py-2.5 font-semibold">Maps to</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(mapping).map((header, i) => {
              const target = mapping[header];
              const isCustom = target?.startsWith('custom:');
              const currentKey = isCustom ? target.slice('custom:'.length) : '';
              return (
                <tr
                  key={header}
                  className={`${i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/50'} border-b border-slate-200 dark:border-slate-800 last:border-0`}
                >
                  <td className="px-3 py-2.5 font-mono text-sm text-slate-900 dark:text-slate-100 font-medium">{header}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <select
                        value={isCustom ? '__custom' : (target ?? 'ignore')}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '__custom') {
                            const key = customKey[header] ?? header.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                            setMapping({ ...mapping, [header]: `custom:${key}` });
                            setCustomKey({ ...customKey, [header]: key });
                          } else {
                            setMapping({ ...mapping, [header]: v });
                          }
                        }}
                        className="flex-1 h-9 px-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                      >
                        {commonOptions.map((o) => (
                          <option key={o.v} value={o.v}>{o.label}</option>
                        ))}
                        {!commonOptions.some((o) => o.v === target) && !isCustom && targetFields.includes(target as any) && (
                          <option value={target}>{target}</option>
                        )}
                      </select>
                      {isCustom && (
                        <Input
                          className="h-9 w-48 font-mono text-xs"
                          placeholder="field_key"
                          value={currentKey}
                          onChange={(e) => {
                            const k = e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                            setMapping({ ...mapping, [header]: `custom:${k}` });
                            setCustomKey({ ...customKey, [header]: k });
                          }}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Extra fields — applied to every imported row */}
      <div className="border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 overflow-hidden">
        <div className="bg-slate-100 dark:bg-slate-800 px-3 py-2.5 border-b border-slate-300 dark:border-slate-700">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Apply to every row (optional)</div>
          <div className="text-xs text-slate-500 mt-0.5">
            Add extra fields that aren't in your file. Values are written as custom fields on every imported company —
            useful for tagging (e.g. <code className="font-mono bg-white dark:bg-slate-950 px-1 rounded">import_batch=spring_2026</code>).
          </div>
        </div>
        <div className="p-3 space-y-2">
          {Object.entries(extraFields).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 rounded-md px-3 py-2">
              <code className="font-mono text-xs font-medium text-slate-900 dark:text-slate-100 w-40 truncate">{key}</code>
              <span className="text-slate-400">=</span>
              <span className="flex-1 text-sm text-slate-800 dark:text-slate-200 truncate">{value || <em className="text-slate-500">(empty)</em>}</span>
              <button onClick={() => removeExtraField(key)} className="text-slate-400 hover:text-red-500 transition-colors" aria-label="Remove field">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <Input
              placeholder="field_key"
              className="h-9 w-48 font-mono text-xs"
              value={newExtraKey}
              onChange={(e) => setNewExtraKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newExtraKey) { e.preventDefault(); addExtraField(); } }}
            />
            <Input
              placeholder="value applied to every row"
              className="h-9 flex-1"
              value={newExtraValue}
              onChange={(e) => setNewExtraValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newExtraKey) { e.preventDefault(); addExtraField(); } }}
            />
            <Button size="sm" onClick={addExtraField} disabled={!newExtraKey.trim()}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center pt-1">
        <Button variant="ghost" onClick={() => setMapping(defaultMapping)}>Reset mapping to defaults</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <Button onClick={onNext} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Preview rows <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function PreviewStep({
  preview, onBack, onImport, loading,
}: {
  preview: PreviewResult;
  onBack: () => void;
  onImport: () => void;
  loading: boolean;
}) {
  const canImport = preview.readyRows > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total rows" value={preview.totalRows} />
        <Stat label="Ready to import" value={preview.readyRows} tone="ok" />
        <Stat label="Errors" value={preview.errorCount} tone={preview.errorCount > 0 ? 'warn' : 'muted'} />
        <Stat label="File" value={preview.filename} small />
      </div>

      {preview.errors.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              Errors — these rows will be skipped
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-40 overflow-y-auto">
            <ul className="text-sm space-y-1">
              {preview.errors.slice(0, 50).map((e, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-mono text-xs w-12">Row {e.row}</span>
                  <span className="text-muted-foreground">{e.message}</span>
                </li>
              ))}
            </ul>
            {preview.errors.length > 50 && (
              <p className="text-xs text-muted-foreground mt-2">…and {preview.errors.length - 50} more.</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="border rounded-md overflow-x-auto max-h-80">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-medium">#</th>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Type</th>
              <th className="text-left px-3 py-2 font-medium">Location</th>
              <th className="text-left px-3 py-2 font-medium">External ID</th>
              <th className="text-left px-3 py-2 font-medium">Custom fields</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {preview.preview.slice(0, 50).map((r) => (
              <tr key={r.rowNumber}>
                <td className="px-3 py-2 text-muted-foreground font-mono">{r.rowNumber}</td>
                <td className="px-3 py-2 font-medium">{r.customer.name}</td>
                <td className="px-3 py-2">{r.customer.status}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.customer.customerType ?? '—'}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {[r.customer.city, r.customer.state].filter(Boolean).join(', ') || '—'}
                </td>
                <td className="px-3 py-2 text-muted-foreground font-mono text-xs">
                  {r.customer.externalNumber ?? r.customer.externalId ?? '—'}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {Object.keys(r.customer.customFields).length > 0
                    ? Object.entries(r.customer.customFields)
                        .map(([k, v]) => `${k}=${String(v).slice(0, 20)}`)
                        .join(' · ')
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {preview.preview.length > 50 && (
          <div className="bg-muted/30 px-3 py-2 text-xs text-muted-foreground text-center">
            Showing first 50 of {preview.readyRows} ready rows.
          </div>
        )}
      </div>

      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <Button onClick={onImport} disabled={!canImport || loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Import {preview.readyRows} {preview.readyRows === 1 ? 'company' : 'companies'}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, small }: { label: string; value: string | number; tone?: 'ok' | 'warn' | 'muted'; small?: boolean }) {
  const toneClass =
    tone === 'ok' ? 'text-green-700 bg-green-50 border-green-200'
    : tone === 'warn' ? 'text-amber-700 bg-amber-50 border-amber-200'
    : tone === 'muted' ? 'text-muted-foreground' : 'text-foreground';
  return (
    <div className={`border rounded-md p-3 ${toneClass}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className={`${small ? 'text-sm font-mono truncate' : 'text-2xl font-bold'} mt-0.5`}>{value}</div>
    </div>
  );
}

function DoneStep({ result, onRestart, onExit }: { result: ExecuteResult; onRestart: () => void; onExit: () => void }) {
  return (
    <div className="space-y-4">
      <div className="text-center py-4">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700 mb-3">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h3 className="text-xl font-bold">Import complete</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {result.importedRows} created · {result.updatedRows} updated · {result.failedRows} failed
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Created" value={result.importedRows} tone="ok" />
        <Stat label="Updated" value={result.updatedRows} tone="ok" />
        <Stat label="Failed" value={result.failedRows} tone={result.failedRows > 0 ? 'warn' : 'muted'} />
        <Stat label="Total" value={result.totalRows} />
      </div>

      {result.errors.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader>
            <CardTitle className="text-sm">Errors</CardTitle>
          </CardHeader>
          <CardContent className="max-h-40 overflow-y-auto">
            <ul className="text-sm space-y-1">
              {result.errors.map((e, i) => (
                <li key={i}><span className="font-mono text-xs mr-2">Row {e.row}</span>{e.message}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-center gap-2">
        <Button variant="outline" onClick={onRestart}>Import another file</Button>
        <Button onClick={onExit}>Done</Button>
      </div>
    </div>
  );
}

/* ------------- Custom fields manager ------------- */

function CustomFieldsManager({ entity }: { entity: 'customer' | 'contact' | 'configuration' | 'catalog_item' }) {
  const [fields, setFields] = useState<CustomField[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ fieldKey: '', label: '', fieldType: 'text' as const });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setFields(await api<CustomField[]>(`/custom-fields/${entity}`));
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [entity]);

  async function create() {
    setSaving(true);
    setErr(null);
    try {
      await api(`/custom-fields/${entity}`, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm({ fieldKey: '', label: '', fieldType: 'text' });
      setAdding(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed');
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Remove this custom field? Existing values stay in the database but are no longer shown.')) return;
    await api(`/custom-fields/${id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Customer custom fields</CardTitle>
          <CardDescription>Extra fields shown on every customer. Also used during import.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1" /> Add field</Button>
      </CardHeader>
      <CardContent>
        {adding && (
          <div className="border rounded-md p-4 mb-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Key</Label>
                <Input
                  value={form.fieldKey}
                  onChange={(e) => setForm({ ...form, fieldKey: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') })}
                  placeholder="territory"
                />
              </div>
              <div>
                <Label>Label</Label>
                <Input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Territory"
                />
              </div>
              <div>
                <Label>Type</Label>
                <select
                  value={form.fieldType}
                  onChange={(e) => setForm({ ...form, fieldType: e.target.value as any })}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="boolean">Yes / No</option>
                  <option value="select">Select</option>
                </select>
              </div>
            </div>
            {err && <div className="text-sm text-destructive">{err}</div>}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              <Button onClick={create} disabled={!form.fieldKey || !form.label || saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save field
              </Button>
            </div>
          </div>
        )}

        {!fields ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : fields.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No custom fields yet. Add one above, or run an import — custom fields in the mapping are auto-created.
          </p>
        ) : (
          <ul className="divide-y">
            {fields.map((f) => (
              <li key={f.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-sm">{f.label}</div>
                  <div className="text-xs text-muted-foreground font-mono">{f.fieldKey} · {f.fieldType}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => remove(f.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------- Import history ------------- */

interface ImportJob {
  id: string;
  source: string;
  entityType: string;
  status: string;
  totalRows: number;
  importedRows: number;
  updatedRows: number;
  failedRows: number;
  startedAt: string;
  completedAt: string | null;
}

function ImportHistory() {
  const [jobs, setJobs] = useState<ImportJob[] | null>(null);
  useEffect(() => { api<ImportJob[]>('/imports/history').then(setJobs); }, []);

  if (!jobs) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (jobs.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No imports yet.</p>;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">When</th>
              <th className="text-left px-4 py-3 font-medium">Source</th>
              <th className="text-left px-4 py-3 font-medium">Entity</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Results</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {jobs.map((j) => (
              <tr key={j.id}>
                <td className="px-4 py-3 text-muted-foreground">{new Date(j.startedAt).toLocaleString()}</td>
                <td className="px-4 py-3 capitalize">{j.source}</td>
                <td className="px-4 py-3 capitalize">{j.entityType}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded border ${
                    j.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200'
                    : j.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-muted text-muted-foreground'
                  }`}>{j.status}</span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className="text-green-700">{j.importedRows} created</span>
                  {j.updatedRows > 0 && <span className="text-muted-foreground"> · {j.updatedRows} updated</span>}
                  {j.failedRows > 0 && <span className="text-amber-700"> · {j.failedRows} failed</span>}
                  <span className="text-muted-foreground"> / {j.totalRows} total</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/* ------------- Helper: FormData-aware api() variant ------------- */

async function apiForm<T = unknown>(path: string, form: FormData): Promise<T> {
  const apiBase = (import.meta as any).env?.VITE_API_URL
    ? `${(import.meta as any).env.VITE_API_URL}/api/v1`
    : '/api/v1';
  const token = localStorage.getItem('accessToken');
  const res = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.message ?? body?.error ?? res.statusText);
  }
  return res.json();
}
