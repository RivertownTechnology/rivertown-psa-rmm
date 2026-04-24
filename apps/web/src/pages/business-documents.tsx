import { useEffect, useState, useCallback } from 'react';
import { api, getAccessToken, API_BASE } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  FileText, Download, Upload, Shield, Building, FileCheck,
  ScrollText, DollarSign, Briefcase, AlertTriangle, Search,
  Trash2, Edit2, Plus, FolderOpen,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BusinessDocument {
  id: string;
  tenantId: string;
  name: string;
  category: string;
  subcategory: string | null;
  description: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  storageKey: string | null;
  issuer: string | null;
  documentNumber: string | null;
  issueDate: string | null;
  expirationDate: string | null;
  state: string | null;
  tags: string | null;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { value: '', label: 'All', icon: FolderOpen, color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  { value: 'license', label: 'Business Licenses', icon: FileCheck, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  { value: 'registration', label: 'Registrations', icon: Building, color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  { value: 'insurance', label: 'Insurance Policies', icon: Shield, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' },
  { value: 'certification', label: 'Certifications', icon: FileCheck, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
  { value: 'policy', label: 'Policies & Procedures', icon: ScrollText, color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' },
  { value: 'tax', label: 'Tax Documents', icon: DollarSign, color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  { value: 'contract', label: 'Agreements & Contracts', icon: Briefcase, color: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300' },
  { value: 'other', label: 'Other', icon: FileText, color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.filter(c => c.value).map(c => [c.value, c]));

const US_STATES = [
  '', 'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY',
  'LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND',
  'OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

const _REMOVED_API_BASE = (import.meta as any).env?.VITE_API_URL
  ? `${(import.meta as any).env.VITE_API_URL}/api/v1`
  : '/api/v1';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isExpiringSoon(dateStr: string | null): 'expired' | 'warning' | null {
  if (!dateStr) return null;
  const exp = new Date(dateStr);
  const now = new Date();
  if (exp < now) return 'expired';
  const diff = exp.getTime() - now.getTime();
  if (diff < 30 * 24 * 60 * 60 * 1000) return 'warning';
  return null;
}

const EMPTY_FORM = {
  name: '',
  category: 'other',
  subcategory: '',
  description: '',
  issuer: '',
  documentNumber: '',
  issueDate: '',
  expirationDate: '',
  state: '',
  tags: '',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BusinessDocumentsPage() {
  const [docs, setDocs] = useState<BusinessDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<BusinessDocument | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.set('category', categoryFilter);
      if (searchQuery) params.set('search', searchQuery);
      const qs = params.toString();
      const res = await api<BusinessDocument[]>(`/business-documents${qs ? `?${qs}` : ''}`);
      setDocs(Array.isArray(res) ? res : []);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, searchQuery]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function openCreate() {
    setEditingDoc(null);
    setForm({ ...EMPTY_FORM });
    setSelectedFile(null);
    setDialogOpen(true);
  }

  function openEdit(doc: BusinessDocument) {
    setEditingDoc(doc);
    setForm({
      name: doc.name,
      category: doc.category,
      subcategory: doc.subcategory ?? '',
      description: doc.description ?? '',
      issuer: doc.issuer ?? '',
      documentNumber: doc.documentNumber ?? '',
      issueDate: doc.issueDate ?? '',
      expirationDate: doc.expirationDate ?? '',
      state: doc.state ?? '',
      tags: doc.tags ?? '',
    });
    setSelectedFile(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editingDoc) {
        // Update metadata only (PATCH)
        await api(`/business-documents/${editingDoc.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            category: form.category,
            subcategory: form.subcategory || null,
            description: form.description || null,
            issuer: form.issuer || null,
            documentNumber: form.documentNumber || null,
            issueDate: form.issueDate || null,
            expirationDate: form.expirationDate || null,
            state: form.state || null,
            tags: form.tags || null,
          }),
        });
      } else {
        // Create with multipart (file optional)
        const formData = new FormData();
        if (selectedFile) formData.append('file', selectedFile);
        formData.append('name', form.name);
        formData.append('category', form.category);
        formData.append('subcategory', form.subcategory);
        formData.append('description', form.description);
        formData.append('issuer', form.issuer);
        formData.append('documentNumber', form.documentNumber);
        formData.append('issueDate', form.issueDate);
        formData.append('expirationDate', form.expirationDate);
        formData.append('state', form.state);
        formData.append('tags', form.tags);

        const token = getAccessToken();
        await fetch(`${API_BASE}/business-documents`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
      }
      setDialogOpen(false);
      fetchDocs();
    } catch (err) {
      console.error('Save failed', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await api(`/business-documents/${deleteId}`, { method: 'DELETE' });
      fetchDocs();
    } catch (err) {
      console.error('Delete failed', err);
    } finally {
      setDeleteId(null);
      setDeleteConfirmOpen(false);
    }
  }

  function confirmDelete(id: string) {
    setDeleteId(id);
    setDeleteConfirmOpen(true);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const filteredDocs = docs;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Business Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Licenses, certifications, insurance policies, and other business documents
          </p>
        </div>
        <Button onClick={openCreate}>
          <Upload className="h-4 w-4 mr-2" />
          Upload Document
        </Button>
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = categoryFilter === cat.value;
          return (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                isActive
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {cat.value === '' ? 'All' : cat.label}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Document cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : filteredDocs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FileText className="h-12 w-12 mb-4 opacity-40" />
            <p className="text-lg font-medium">No documents found</p>
            <p className="text-sm mt-1">Upload your first business document to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredDocs.map((doc) => {
            const cat = CATEGORY_MAP[doc.category] || CATEGORY_MAP['other']!;
            const CatIcon = cat?.icon ?? FileText;
            const expStatus = isExpiringSoon(doc.expirationDate);

            return (
              <Card key={doc.id} className="group relative hover:shadow-md transition-shadow">
                <CardContent className="p-5 space-y-3">
                  {/* Top row: badge + expiration warning */}
                  <div className="flex items-start justify-between gap-2">
                    <Badge className={`${cat?.color ?? ''} border-0`}>
                      <CatIcon className="h-3 w-3 mr-1" />
                      {cat?.label ?? doc.category}
                    </Badge>
                    {expStatus && (
                      <div className={`flex items-center gap-1 text-xs font-medium ${
                        expStatus === 'expired' ? 'text-red-600' : 'text-amber-600'
                      }`}>
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {expStatus === 'expired' ? 'Expired' : 'Expiring soon'}
                      </div>
                    )}
                  </div>

                  {/* Document name */}
                  <div>
                    <h3 className="font-semibold text-base leading-tight">{doc.name}</h3>
                    {doc.subcategory && (
                      <p className="text-sm text-muted-foreground mt-0.5">{doc.subcategory}</p>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="text-sm text-muted-foreground space-y-1">
                    {doc.issuer && (
                      <div className="flex items-center gap-1.5">
                        <Building className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{doc.issuer}</span>
                        {doc.documentNumber && (
                          <span className="text-xs">#{doc.documentNumber}</span>
                        )}
                      </div>
                    )}
                    {doc.expirationDate && (
                      <div className={`flex items-center gap-1.5 ${
                        expStatus === 'expired' ? 'text-red-600 font-medium' :
                        expStatus === 'warning' ? 'text-amber-600 font-medium' : ''
                      }`}>
                        <span>Expires: {new Date(doc.expirationDate).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>

                  {/* File info */}
                  {doc.fileName && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate flex-1">{doc.fileName}</span>
                      {doc.fileSize && <span>{formatFileSize(doc.fileSize)}</span>}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {doc.storageKey && (
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={`${API_BASE}/business-documents/${doc.id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.preventDefault();
                            const token = getAccessToken();
                            window.open(
                              `${API_BASE}/business-documents/${doc.id}/download`,
                              '_blank'
                            );
                          }}
                        >
                          <Download className="h-3.5 w-3.5 mr-1" />
                          Download
                        </a>
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => openEdit(doc)}>
                      <Edit2 className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => confirmDelete(doc.id)}
                      className="text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Upload / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDoc ? 'Edit Document' : 'Upload Document'}</DialogTitle>
            <DialogDescription>
              {editingDoc ? 'Update document metadata.' : 'Upload a new business document or create a metadata entry.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* File upload (create only) */}
            {!editingDoc && (
              <div>
                <Label>File (optional)</Label>
                <div
                  className="mt-1.5 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => document.getElementById('biz-doc-file')?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      setSelectedFile(file);
                      if (!form.name) setForm(f => ({ ...f, name: file.name.replace(/\.[^.]+$/, '') }));
                    }
                  }}
                >
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <FileText className="h-5 w-5 text-primary" />
                      <span className="font-medium">{selectedFile.name}</span>
                      <span className="text-muted-foreground">({formatFileSize(selectedFile.size)})</span>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      <Upload className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Drop a file here or click to browse</p>
                    </div>
                  )}
                  <input
                    id="biz-doc-file"
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setSelectedFile(file);
                      if (file && !form.name) setForm(f => ({ ...f, name: file.name.replace(/\.[^.]+$/, '') }));
                    }}
                  />
                </div>
              </div>
            )}

            {/* Name */}
            <div>
              <Label htmlFor="doc-name">Name</Label>
              <Input
                id="doc-name"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Document name"
                className="mt-1.5"
              />
            </div>

            {/* Category */}
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.filter(c => c.value).map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Subcategory */}
            <div>
              <Label htmlFor="doc-sub">Subcategory</Label>
              <Input
                id="doc-sub"
                value={form.subcategory}
                onChange={(e) => setForm(f => ({ ...f, subcategory: e.target.value }))}
                placeholder="e.g. General Liability, CJIS Compliance, SC Business License"
                className="mt-1.5"
              />
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="doc-desc">Description</Label>
              <textarea
                id="doc-desc"
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional description..."
                rows={3}
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            {/* Issuer */}
            <div>
              <Label htmlFor="doc-issuer">Issuer</Label>
              <Input
                id="doc-issuer"
                value={form.issuer}
                onChange={(e) => setForm(f => ({ ...f, issuer: e.target.value }))}
                placeholder="Who issued this document"
                className="mt-1.5"
              />
            </div>

            {/* Document Number */}
            <div>
              <Label htmlFor="doc-number">Document / License Number</Label>
              <Input
                id="doc-number"
                value={form.documentNumber}
                onChange={(e) => setForm(f => ({ ...f, documentNumber: e.target.value }))}
                placeholder="License or certificate number"
                className="mt-1.5"
              />
            </div>

            {/* Dates row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="doc-issue-date">Issue Date</Label>
                <Input
                  id="doc-issue-date"
                  type="date"
                  value={form.issueDate}
                  onChange={(e) => setForm(f => ({ ...f, issueDate: e.target.value }))}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="doc-exp-date">Expiration Date</Label>
                <Input
                  id="doc-exp-date"
                  type="date"
                  value={form.expirationDate}
                  onChange={(e) => setForm(f => ({ ...f, expirationDate: e.target.value }))}
                  className="mt-1.5"
                />
              </div>
            </div>

            {/* State */}
            <div>
              <Label>State</Label>
              <Select value={form.state} onValueChange={(v) => setForm(f => ({ ...f, state: v }))}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select state (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {US_STATES.filter(Boolean).map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tags */}
            <div>
              <Label htmlFor="doc-tags">Tags</Label>
              <Input
                id="doc-tags"
                value={form.tags}
                onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="Comma-separated tags"
                className="mt-1.5"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving...' : editingDoc ? 'Update' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Document"
        description="Are you sure you want to delete this document? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
