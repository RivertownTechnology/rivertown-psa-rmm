import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api, getAccessToken, API_BASE } from '@/lib/api';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Combobox } from '@/components/ui/combobox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Clock, Upload, FileText, Sparkles, ChevronDown,
  CheckCircle2, Circle, AlertTriangle, Minus, Plus, Send, X, Loader2,
  DollarSign, Pencil, Trash2, XCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Opportunity {
  id: string;
  title: string;
  agency: string;
  agencyType: string;
  status: string;
  estimatedValue: number;
  submissionDeadline: string | null;
  questionDeadline: string | null;
  winProbability: number | null;
  setAsideType: string | null;
  assignedTo: string | null;
  source: string | null;
  samNumber: string | null;
  naicsCodes: string | null;
  contractType: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  incumbentInfo: string | null;
  competitorNotes: string | null;
  certifications: string[] | null;
  tags: string[] | null;
  notes: string | null;
  description: string | null;
  aiAnalysis: Record<string, any> | null;
}

interface GovDocument {
  id: string;
  fileName: string;
  fileType: string;
  documentType: string;
  mimeType: string;
  uploadedAt: string;
  createdAt: string;
  aiSummary: string | null;
  aiExtractedData: Record<string, unknown> | null;
}

interface ProposalSection {
  id: string;
  title: string;
  content: string;
  isComplete: boolean;
  order: number;
}

interface Proposal {
  id: string;
  title: string;
  version: number;
  status: string;
  shareToken: string | null;
  sections: ProposalSection[];
}

interface ComplianceItem {
  id: string;
  requirement: string;
  status: string;
  category: string;
  assignedTo: string | null;
  dueDate: string | null;
}

interface Submission {
  id: string;
  method: string;
  submittedAt: string;
  confirmationNumber: string | null;
  notes: string | null;
}

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  userId: string | null;
  userName: string | null;
}

interface Tech { id: string; displayName: string }

interface AIAnalysisResult {
  summary: string;
  keyRequirements: string[];
  risks: string[];
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: 'discovered', label: 'Discovered' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'in_review', label: 'In Review' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'awarded', label: 'Awarded' },
  { value: 'lost', label: 'Lost' },
];

const STATUS_COLORS: Record<string, string> = {
  discovered: 'bg-gray-100 text-gray-700',
  qualified: 'bg-blue-100 text-blue-700',
  in_review: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-purple-100 text-purple-700',
  submitted: 'bg-indigo-100 text-indigo-700',
  awarded: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
};

const COMPLIANCE_STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  complete: CheckCircle2,
  pending: Circle,
  missing: X,
  at_risk: AlertTriangle,
  na: Minus,
};

const COMPLIANCE_STATUS_COLORS: Record<string, string> = {
  complete: 'text-green-600',
  pending: 'text-muted-foreground',
  missing: 'text-red-600',
  at_risk: 'text-yellow-600',
  na: 'text-gray-400',
};

const CATEGORY_COLORS: Record<string, string> = {
  form: 'bg-blue-100 text-blue-700',
  certification: 'bg-green-100 text-green-700',
  attachment: 'bg-purple-100 text-purple-700',
  format: 'bg-orange-100 text-orange-700',
  content: 'bg-indigo-100 text-indigo-700',
};

function formatDollars(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(0)}K`;
  return `$${dollars.toFixed(0)}`;
}

function deadlineCountdown(dateStr: string | null): { days: number; hours: number } | null {
  if (!dateStr) return null;
  const now = new Date();
  const deadline = new Date(dateStr);
  const diffMs = deadline.getTime() - now.getTime();
  if (diffMs < 0) return { days: 0, hours: 0 };
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  return { days, hours };
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface GovOpportunityDetailPageProps {
  opportunityId: string;
  onBack: () => void;
}

export function GovOpportunityDetailPage({ opportunityId, onBack }: GovOpportunityDetailPageProps) {
  const { confirm } = useConfirm();
  const toast = useToast();
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [techs, setTechs] = useState<Tech[]>([]);

  // Tab data
  const [documents, setDocuments] = useState<GovDocument[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedProposalVersion, setSelectedProposalVersion] = useState<number | null>(null);
  const [compliance, setCompliance] = useState<ComplianceItem[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  // SLA policies for proposal
  const [slaPolicies, setSlaPolicies] = useState<Array<{ id: string; name: string; isDefault: boolean }>>([]);
  const [selectedSlaPolicyId, setSelectedSlaPolicyId] = useState('');

  // Section generation dialog
  const [sectionGenDialog, setSectionGenDialog] = useState<{ proposalId: string; sectionIndex: number; sectionTitle: string } | null>(null);
  const [sectionGenInstructions, setSectionGenInstructions] = useState('');
  const [sectionGenStatus, setSectionGenStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');
  const [sectionGenError, setSectionGenError] = useState('');

  // Pricing
  const [pricingItems, setPricingItems] = useState<any[]>([]);
  const [catalogItems, setCatalogItems] = useState<Array<{id: string; name: string; category: string; defaultUnitPriceCents: number; defaultUnitCostCents: number | null}>>([]);
  const [showAddPricing, setShowAddPricing] = useState(false);
  const [editingPricingId, setEditingPricingId] = useState<string | null>(null);
  const [pricingForm, setPricingForm] = useState({ need: '', catalogItemId: '', quantity: '1', unitPriceCents: '', unitCostCents: '', frequency: 'monthly', notes: '', linkedToId: '', scenario: 'base' });
  const [generatingPricing, setGeneratingPricing] = useState(false);

  // AI states
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResult | null>(null);
  const [generatingProposal, setGeneratingProposal] = useState(false);
  const [generatingCompliance, setGeneratingCompliance] = useState(false);
  const [analyzingDocs, setAnalyzingDocs] = useState(false);
  const [improvingSection, setImprovingSection] = useState<string | null>(null);

  // Document panel
  const [selectedDoc, setSelectedDoc] = useState<GovDocument | null>(null);
  // Analyze dialog
  const [analyzeDocDialog, setAnalyzeDocDialog] = useState<GovDocument | null>(null);
  const [analyzeDocType, setAnalyzeDocType] = useState<'rfp' | 'addendum'>('rfp');
  const [analyzingDocId, setAnalyzingDocId] = useState<string | null>(null);

  // Paste RFP
  const [pasteRfpText, setPasteRfpText] = useState('');
  const [savingPastedRfp, setSavingPastedRfp] = useState(false);

  // Editing
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  // Submission form
  const [showSubmissionForm, setShowSubmissionForm] = useState(false);
  const [submissionForm, setSubmissionForm] = useState({ method: '', submittedAt: '', confirmationNumber: '', notes: '' });

  // Activity note
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Compliance add
  const [showAddCompliance, setShowAddCompliance] = useState(false);
  const [complianceForm, setComplianceForm] = useState({ requirement: '', category: 'form', dueDate: '' });

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchOpp = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Opportunity>(`/gov/opportunities/${opportunityId}`);
      setOpp(data);
      setNotesValue(data.notes ?? '');
      // Load saved AI analysis if available
      if (data.aiAnalysis && !analysisResult) {
        const ai = data.aiAnalysis;
        setAnalysisResult({
          summary: ai.summary || ai.scopeOfWork || '',
          keyRequirements: ai.keyRequirements || ai.technicalRequirements || [],
          risks: ai.risks || [],
          recommendations: ai.recommendations || ai.differentiators || [],
          ...ai, // preserve all extra fields like itemsToPriceOut, businessRequirements, staffingNeeds
        } as any);
      }
    } catch {
      // leave null
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await api<any>(`/gov/opportunities/${opportunityId}/documents`);
      setDocuments(Array.isArray(res) ? res : (res.data ?? []));
    } catch { setDocuments([]); }
  }, [opportunityId]);

  const fetchProposals = useCallback(async () => {
    try {
      const res = await api<any>(`/gov/opportunities/${opportunityId}/proposals`);
      const list = Array.isArray(res) ? res : (res.data ?? []);
      setProposals(list);
      if (list.length && !selectedProposalVersion) {
        setSelectedProposalVersion(list[0].version);
      }
    } catch { setProposals([]); }
  }, [opportunityId, selectedProposalVersion]);

  const fetchCompliance = useCallback(async () => {
    try {
      const res = await api<any>(`/gov/opportunities/${opportunityId}/compliance`);
      setCompliance(Array.isArray(res) ? res : (res.data ?? []));
    } catch { setCompliance([]); }
  }, [opportunityId]);

  const fetchSubmissions = useCallback(async () => {
    try {
      const res = await api<any>(`/gov/opportunities/${opportunityId}/submissions`);
      setSubmissions(Array.isArray(res) ? res : (res.data ?? []));
    } catch { setSubmissions([]); }
  }, [opportunityId]);

  const fetchActivities = useCallback(async () => {
    try {
      const res = await api<any>(`/gov/opportunities/${opportunityId}/activities`);
      setActivities(Array.isArray(res) ? res : (res.data ?? []));
    } catch { setActivities([]); }
  }, [opportunityId]);

  const fetchPricing = useCallback(async () => {
    try {
      const res = await api<any>(`/gov/opportunities/${opportunityId}/pricing`);
      setPricingItems(Array.isArray(res) ? res : (res.data ?? []));
    } catch { setPricingItems([]); }
  }, [opportunityId]);

  useEffect(() => {
    fetchOpp();
    fetchDocuments();
    fetchProposals();
    fetchCompliance();
    fetchSubmissions();
    fetchActivities();
    fetchPricing();
    api<Tech[]>('/dispatch/techs').then(setTechs).catch(() => {});
    api<any>('/service-catalog').then(d => {
      const items = Array.isArray(d) ? d : (d.data ?? []);
      setCatalogItems(items);
    }).catch(() => {});
    api<any>('/settings/sla-policies').then(d => {
      const policies = Array.isArray(d) ? d : (d.data ?? []);
      setSlaPolicies(policies);
      const def = policies.find((p: any) => p.isDefault);
      if (def) setSelectedSlaPolicyId(def.id);
    }).catch(() => {});
  }, [fetchOpp, fetchDocuments, fetchProposals, fetchCompliance, fetchSubmissions, fetchActivities, fetchPricing]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function updateStatus(newStatus: string) {
    if (!opp) return;
    setOpp({ ...opp, status: newStatus });
    setStatusDropdownOpen(false);
    try {
      await api(`/gov/opportunities/${opportunityId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      fetchActivities();
    } catch { fetchOpp(); }
  }

  async function updateField(field: string, value: unknown) {
    if (!opp) return;
    try {
      await api(`/gov/opportunities/${opportunityId}`, {
        method: 'PATCH',
        body: JSON.stringify({ [field]: value }),
      });
      fetchOpp();
    } catch { /* ignore */ }
  }

  async function saveNotes() {
    await updateField('notes', notesValue);
    setEditingNotes(false);
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      const result = await api<any>(`/gov/opportunities/${opportunityId}/analyze`, { method: 'POST' });
      // The API returns the full analysis object — normalize field names
      setAnalysisResult({
        summary: result.summary || result.scopeOfWork || 'Analysis complete',
        keyRequirements: result.keyRequirements || result.technicalRequirements || [],
        risks: result.risks || [],
        recommendations: result.recommendations || result.differentiators || [],
      });
      // Refresh opportunity to get updated winProbability
      fetchOpp();
    } catch (err: any) {
      toast.error('AI Analysis failed', err.message || 'Unknown error');
    }
    finally { setAnalyzing(false); }
  }

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const token = getAccessToken();
        const url = `${API_BASE}/gov/opportunities/${opportunityId}/documents`;
        console.log('[GOV-UPLOAD] Uploading to:', url, 'File:', file.name, file.size);
        const res = await fetch(url, {
          method: 'POST',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          body: formData,
        });
        if (!res.ok) {
          const err = await res.text();
          toast.error(`Upload failed (${res.status})`, err.substring(0, 200));
        } else {
          console.log('[GOV-UPLOAD] Success');
        }
      } catch (err: any) {
        toast.error('Upload error', err.message || 'Failed');
        console.error('[GOV-UPLOAD] Error:', err);
      }
    }
    fetchDocuments();
  }

  async function handleAnalyzeAllDocs() {
    setAnalyzingDocs(true);
    try {
      await api(`/gov/opportunities/${opportunityId}/analyze`, { method: 'POST' });
      fetchDocuments();
      fetchOpp();
    } catch (err: any) {
      toast.error('Analysis failed', err.message || 'Unknown error');
    }
    finally { setAnalyzingDocs(false); }
  }

  async function handleGenerateProposal(aiGenerate = false) {
    setGeneratingProposal(true);
    try {
      await api(`/gov/opportunities/${opportunityId}/proposals`, { method: 'POST', body: JSON.stringify({ aiGenerate }) });
      await fetchProposals();
    } catch (err: any) {
      toast.error('Proposal generation failed', err.message || 'Unknown error. The AI may have timed out — try again.');
    }
    finally { setGeneratingProposal(false); }
  }

  function openSectionGenDialog(proposalId: string, sectionIndex: number, sectionTitle: string) {
    setSectionGenDialog({ proposalId, sectionIndex, sectionTitle });
    setSectionGenInstructions('');
    setSectionGenStatus('idle');
    setSectionGenError('');
  }

  async function runSectionGeneration() {
    if (!sectionGenDialog) return;
    setSectionGenStatus('generating');
    setSectionGenError('');
    try {
      await api(`/gov/proposals/${sectionGenDialog.proposalId}/sections/${sectionGenDialog.sectionIndex}/generate`, {
        method: 'POST',
        body: JSON.stringify({
          instructions: sectionGenInstructions || undefined,
          slaPolicyId: sectionGenDialog.sectionTitle.toLowerCase().includes('sla') ? selectedSlaPolicyId : undefined,
        }),
      });
      await fetchProposals();
      setSectionGenStatus('done');
    } catch (err: any) {
      setSectionGenStatus('error');
      setSectionGenError(err.message || 'Generation failed');
    }
  }

  async function handleUpdateProposalSection(proposalId: string, sectionIndex: number, updates: Partial<ProposalSection>) {
    if (!currentProposal) return;
    const updatedSections = [...currentProposal.sections];
    updatedSections[sectionIndex] = { ...updatedSections[sectionIndex], ...updates };
    // Optimistic update
    setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, sections: updatedSections } : p));
    try {
      await api(`/gov/proposals/${proposalId}`, {
        method: 'PATCH',
        body: JSON.stringify({ sections: updatedSections }),
      });
    } catch { /* ignore */ }
  }

  async function handleImproveSection(proposalId: string, sectionIndex: number) {
    setImprovingSection(`improve-${sectionIndex}`);
    try {
      await api(`/gov/proposals/${proposalId}/ai-improve`, { method: 'POST', body: JSON.stringify({ sectionIndex }) });
      fetchProposals();
    } catch (err: any) {
      toast.error('Section improvement failed', err.message || 'Unknown error');
    }
    finally { setImprovingSection(null); }
  }

  function exportProposalPDF() {
    if (!currentProposal || !opp) return;
    const sections = (currentProposal.sections ?? []).sort((a: ProposalSection, b: ProposalSection) => a.order - b.order);

    // Convert markdown-like content to basic HTML
    function mdToHtml(md: string): string {
      return md
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
        .replace(/\|(.+)\|/g, (row) => {
          const cells = row.split('|').filter(c => c.trim());
          if (cells.every(c => /^[\s-:]+$/.test(c))) return '';
          const tag = cells.some(c => /^\*\*/.test(c.trim())) ? 'th' : 'td';
          return `<tr>${cells.map(c => `<${tag}>${c.trim().replace(/\*\*/g, '')}</${tag}>`).join('')}</tr>`;
        })
        .replace(/(<tr>.*<\/tr>\n?)+/g, (m) => `<table>${m}</table>`)
        .replace(/\n{2,}/g, '</p><p>')
        .replace(/\n/g, '<br>')
        ;
    }

    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const deadline = opp.submissionDeadline ? new Date(opp.submissionDeadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

    const sectionsHtml = sections.map((s: ProposalSection, i: number) => `
      <div class="section" id="section-${i + 1}">
        <h1 class="section-title">${s.title}</h1>
        <div class="section-content"><p>${mdToHtml(s.content || '')}</p></div>
      </div>
    `).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${currentProposal.title || 'Proposal'}</title>
<style>
  @page { size: letter; margin: 0.75in 1in 1in 1in; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    /* Running footer via fixed positioning */
    .page-footer { position: fixed; bottom: 0; left: 0; right: 0; height: 30px; font-size: 7.5pt; color: #999; display: flex; justify-content: space-between; align-items: center; padding: 0 1in; border-top: 1px solid #ddd; }
    /* Reserve space at bottom so content doesn't overlap footer */
    .page-content { padding-bottom: 40px; }
    /* Hide footer on cover page */
    .cover ~ .page-footer { display: flex; }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #1a1a1a; }

  /* Cover page */
  .cover { page-break-after: always; display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 90vh; text-align: center; padding: 2in 1in; }
  .cover-logo { width: 180px; margin-bottom: 40px; }
  .cover-title { font-size: 28pt; font-weight: 700; color: #1e3a5f; margin-bottom: 12px; line-height: 1.2; }
  .cover-subtitle { font-size: 16pt; color: #4a6f8a; margin-bottom: 40px; }
  .cover-meta { font-size: 11pt; color: #555; line-height: 2; }
  .cover-meta strong { color: #1a1a1a; }
  .cover-divider { width: 80px; height: 3px; background: #1e3a5f; margin: 30px auto; }

  /* Table of Contents */
  .toc { page-break-after: always; padding-top: 40px; }
  .toc h1 { font-size: 20pt; color: #1e3a5f; margin-bottom: 24px; border-bottom: 2px solid #1e3a5f; padding-bottom: 8px; }
  .toc-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dotted #ccc; font-size: 12pt; text-decoration: none; color: inherit; transition: color 0.15s; }
  .toc-item:hover { color: #1e3a5f; }
  .toc-item span:first-child { color: #1a1a1a; }
  .toc-item span:last-child { color: #888; }

  /* Sections */
  .section { page-break-before: always; }
  .section-title { font-size: 20pt; color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: 8px; margin-bottom: 20px; }
  .section-content h2 { font-size: 14pt; color: #1e3a5f; margin: 20px 0 8px; }
  .section-content h3 { font-size: 12pt; color: #2a5a7f; margin: 16px 0 6px; }
  .section-content p { margin-bottom: 10px; }
  .section-content ul { margin: 8px 0 12px 24px; }
  .section-content li { margin-bottom: 4px; }
  .section-content table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10pt; }
  .section-content th, .section-content td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  .section-content th { background: #f0f4f8; font-weight: 600; color: #1e3a5f; }
  .section-content strong { color: #1e3a5f; }

  /* Screen-only footer (non-print preview) */
  .screen-footer { font-size: 8pt; color: #888; border-top: 1px solid #ddd; padding: 8px 0; display: flex; justify-content: space-between; margin-top: 40px; }
  @media print { .screen-footer { display: none; } }
  .page-footer { display: none; }

  .no-print { margin: 20px; text-align: center; }
  .no-print button { padding: 10px 24px; background: #1e3a5f; color: white; border: none; border-radius: 6px; font-size: 12pt; cursor: pointer; margin: 0 8px; }
  .no-print button:hover { background: #2a5a7f; }
</style>
</head>
<body>

<div class="no-print">
  <button onclick="window.print()">Print / Save as PDF</button>
  <button onclick="window.close()">Close</button>
</div>

<!-- Cover Page (no footer) -->
<div class="cover">
  <img src="/logo.png" class="cover-logo" alt="Rivertown Technology" onerror="this.style.display='none'" />
  <div class="cover-title">${currentProposal.title || `Proposal for ${opp.title}`}</div>
  <div class="cover-subtitle">Information Technology Services Proposal</div>
  <div class="cover-divider"></div>
  <div class="cover-meta">
    <strong>Prepared for:</strong> ${opp.agency}<br>
    <strong>Prepared by:</strong> Rivertown Technology Group<br>
    <strong>Date:</strong> ${today}<br>
    ${deadline ? `<strong>Submission Deadline:</strong> ${deadline}<br>` : ''}
    ${opp.samNumber ? `<strong>SAM Number:</strong> ${opp.samNumber}<br>` : ''}
    <strong>Status:</strong> ${currentProposal.status.replace(/_/g, ' ').toUpperCase()}
  </div>
</div>

<!-- Page footer (prints on all pages after cover) -->
<div class="page-footer">
  <span>Rivertown Technology Group — Confidential</span>
  <span>${opp.title}</span>
</div>

<!-- Content area with bottom padding for footer clearance -->
<div class="page-content">

<!-- Table of Contents -->
<div class="toc">
  <h1>Table of Contents</h1>
  ${sections.map((s: ProposalSection, i: number) => `
    <a href="#section-${i + 1}" class="toc-item">
      <span>${s.title}</span>
      <span>${i + 1}</span>
    </a>
  `).join('')}
</div>

<!-- Sections -->
${sectionsHtml}

</div>

<div class="screen-footer">
  <span>Rivertown Technology Group — Confidential</span>
  <span>${opp.title}</span>
</div>

</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  }

  async function handleUpdateProposalStatus(proposalId: string, status: string) {
    try {
      await api(`/gov/proposals/${proposalId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      fetchProposals();
    } catch { /* ignore */ }
  }

  async function handleToggleCompliance(itemId: string, currentStatus: string) {
    const statusCycle = ['pending', 'complete', 'missing', 'at_risk', 'na'];
    const nextIdx = (statusCycle.indexOf(currentStatus) + 1) % statusCycle.length;
    try {
      await api(`/gov/compliance/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: statusCycle[nextIdx] }),
      });
      fetchCompliance();
    } catch { /* ignore */ }
  }

  async function handleGenerateCompliance() {
    setGeneratingCompliance(true);
    try {
      await api(`/gov/opportunities/${opportunityId}/compliance/generate`, { method: 'POST' });
      fetchCompliance();
    } catch { /* ignore */ }
    finally { setGeneratingCompliance(false); }
  }

  async function handleAddCompliance() {
    if (!complianceForm.requirement) return;
    try {
      await api(`/gov/opportunities/${opportunityId}/compliance`, {
        method: 'POST',
        body: JSON.stringify(complianceForm),
      });
      setShowAddCompliance(false);
      setComplianceForm({ requirement: '', category: 'form', dueDate: '' });
      fetchCompliance();
    } catch { /* ignore */ }
  }

  async function handleSubmission() {
    if (!submissionForm.method) return;
    try {
      await api(`/gov/opportunities/${opportunityId}/submissions`, {
        method: 'POST',
        body: JSON.stringify(submissionForm),
      });
      setShowSubmissionForm(false);
      setSubmissionForm({ method: '', submittedAt: '', confirmationNumber: '', notes: '' });
      fetchSubmissions();
      fetchActivities();
    } catch { /* ignore */ }
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await api(`/gov/opportunities/${opportunityId}/activities`, {
        method: 'POST',
        body: JSON.stringify({ type: 'note', description: noteText }),
      });
      setNoteText('');
      fetchActivities();
    } catch { /* ignore */ }
    finally { setAddingNote(false); }
  }

  // ---------------------------------------------------------------------------
  // Pricing actions
  // ---------------------------------------------------------------------------

  function resetPricingForm() {
    setPricingForm({ need: '', catalogItemId: '', quantity: '1', unitPriceCents: '', unitCostCents: '', frequency: 'monthly', notes: '', linkedToId: '', scenario: 'base' });
  }

  function handleCatalogSelect(catalogItemId: string) {
    const cat = catalogItems.find(c => c.id === catalogItemId);
    setPricingForm(f => ({
      ...f,
      catalogItemId,
      unitPriceCents: cat ? String((cat.defaultUnitPriceCents / 100).toFixed(2)) : f.unitPriceCents,
      unitCostCents: cat?.defaultUnitCostCents != null ? String((cat.defaultUnitCostCents / 100).toFixed(2)) : f.unitCostCents,
    }));
  }

  async function handleAddPricing() {
    if (!pricingForm.need) return;
    try {
      await api(`/gov/opportunities/${opportunityId}/pricing`, {
        method: 'POST',
        body: JSON.stringify({
          need: pricingForm.need,
          catalogItemId: pricingForm.catalogItemId || null,
          quantity: pricingForm.quantity || '1',
          unitPriceCents: pricingForm.unitPriceCents ? Math.round(parseFloat(pricingForm.unitPriceCents) * 100) : 0,
          unitCostCents: pricingForm.unitCostCents ? Math.round(parseFloat(pricingForm.unitCostCents) * 100) : 0,
          frequency: pricingForm.frequency,
          notes: pricingForm.notes || null,
          linkedToId: pricingForm.linkedToId || null,
          scenario: pricingForm.scenario || 'base',
        }),
      });
      setShowAddPricing(false);
      resetPricingForm();
      fetchPricing();
      fetchOpp();
    } catch { /* ignore */ }
  }

  async function handleUpdatePricing() {
    if (!editingPricingId) return;
    try {
      await api(`/gov/pricing/${editingPricingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          need: pricingForm.need,
          catalogItemId: pricingForm.catalogItemId || null,
          quantity: pricingForm.quantity || '1',
          unitPriceCents: pricingForm.unitPriceCents ? Math.round(parseFloat(pricingForm.unitPriceCents) * 100) : 0,
          unitCostCents: pricingForm.unitCostCents ? Math.round(parseFloat(pricingForm.unitCostCents) * 100) : 0,
          frequency: pricingForm.frequency,
          notes: pricingForm.notes || null,
          linkedToId: pricingForm.linkedToId || null,
          scenario: pricingForm.scenario || 'base',
        }),
      });
      setEditingPricingId(null);
      setShowAddPricing(false);
      resetPricingForm();
      fetchPricing();
      fetchOpp();
    } catch { /* ignore */ }
  }

  async function handleDeletePricing(itemId: string) {
    try {
      await api(`/gov/pricing/${itemId}`, { method: 'DELETE' });
      fetchPricing();
      fetchOpp();
    } catch { /* ignore */ }
  }

  async function unlinkPricingItem(itemId: string) {
    try {
      await api(`/gov/pricing/${itemId}`, { method: 'PATCH', body: JSON.stringify({ linkedToId: null }) });
      fetchPricing();
    } catch { /* ignore */ }
  }

  async function linkPricingItem(itemId: string, parentId: string) {
    try {
      await api(`/gov/pricing/${itemId}`, { method: 'PATCH', body: JSON.stringify({ linkedToId: parentId, unitPriceCents: 0, unitCostCents: 0 }) });
      fetchPricing();
      fetchOpp();
    } catch { /* ignore */ }
  }

  async function handleGeneratePricing() {
    setGeneratingPricing(true);
    try {
      await api(`/gov/opportunities/${opportunityId}/pricing/generate`, { method: 'POST' });
      fetchPricing();
      fetchOpp();
    } catch { /* ignore */ }
    finally { setGeneratingPricing(false); }
  }

  function openEditPricing(item: any) {
    setEditingPricingId(item.id);
    setPricingForm({
      need: item.need || '',
      catalogItemId: item.catalogItemId || '',
      quantity: item.quantity || '1',
      unitPriceCents: item.unitPriceCents != null ? (item.unitPriceCents / 100).toFixed(2) : '',
      unitCostCents: item.unitCostCents != null ? (item.unitCostCents / 100).toFixed(2) : '',
      frequency: item.frequency || 'monthly',
      notes: item.notes || '',
      linkedToId: item.linkedToId || '',
      scenario: item.scenario || 'base',
    });
    setShowAddPricing(true);
  }

  // Pricing calculations
  const pricingTotals = (() => {
    let totalMonthlyCents = 0;
    let totalMonthlyCostCents = 0;
    for (const item of pricingItems) {
      const qty = parseFloat(item.quantity ?? '1');
      const price = item.unitPriceCents ?? 0;
      const cost = item.unitCostCents ?? 0;
      if (item.frequency === 'annually') {
        totalMonthlyCents += Math.round((price * qty) / 12);
        totalMonthlyCostCents += Math.round((cost * qty) / 12);
      } else {
        totalMonthlyCents += Math.round(price * qty);
        totalMonthlyCostCents += Math.round(cost * qty);
      }
    }
    const annualRevenue = totalMonthlyCents * 12;
    const annualCost = totalMonthlyCostCents * 12;
    const margin = annualRevenue > 0 ? Math.round(((annualRevenue - annualCost) / annualRevenue) * 100) : 0;
    return { totalMonthlyCents, totalMonthlyCostCents, annualRevenue, annualCost, margin };
  })();

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const techOptions = [
    { value: '', label: 'Unassigned' },
    ...techs.map(t => ({ value: t.id, label: t.displayName })),
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-64 col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!opp) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-muted-foreground">Opportunity not found</div>
        <Button variant="outline" onClick={onBack}>Go Back</Button>
      </div>
    );
  }

  const countdown = deadlineCountdown(opp.submissionDeadline);
  const currentProposal = proposals.find(p => p.version === selectedProposalVersion) ?? proposals[0];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-4 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{opp.title}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="secondary">{opp.agency}</Badge>
            {/* Status with dropdown */}
            <div className="relative">
              <button
                onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                className="inline-flex items-center"
              >
                <Badge className={`${STATUS_COLORS[opp.status]} cursor-pointer`}>
                  {STATUS_OPTIONS.find(s => s.value === opp.status)?.label ?? opp.status}
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Badge>
              </button>
              {statusDropdownOpen && (
                <div className="absolute z-50 top-full mt-1 left-0 bg-popover border rounded-md shadow-md py-1 min-w-[140px]">
                  {STATUS_OPTIONS.map(s => (
                    <button
                      key={s.value}
                      onClick={() => updateStatus(s.value)}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Deadline countdown */}
        <div className="text-right shrink-0">
          {countdown && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className={`font-semibold ${
                countdown.days <= 7 ? 'text-red-600' : countdown.days <= 14 ? 'text-yellow-600' : 'text-green-600'
              }`}>
                {countdown.days}d {countdown.hours}h
              </span>
              <span className="text-xs">remaining</span>
            </div>
          )}
          {/* Win probability gauge */}
          {opp.winProbability !== null && (
            <div className="flex items-center gap-2 mt-1 justify-end">
              <div className="relative w-12 h-12">
                <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-muted"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray={`${opp.winProbability}, 100`}
                    className="text-primary"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                  {opp.winProbability}%
                </div>
              </div>
              <span className="text-xs text-muted-foreground">win</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="proposal">Proposal</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* ---- OVERVIEW ---- */}
        <TabsContent value="overview">
          {/* Executive Health Panel */}
          {opp && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <Card><CardContent className="p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Win Probability</div>
                <div className={`text-xl font-bold ${(opp.winProbability ?? 0) >= 60 ? 'text-emerald-500' : (opp.winProbability ?? 0) >= 30 ? 'text-amber-500' : 'text-red-500'}`}>{opp.winProbability ?? 0}%</div>
              </CardContent></Card>
              <Card><CardContent className="p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Proposal</div>
                <div className="text-xl font-bold">{proposals.length > 0 ? `v${proposals[0]?.version || 1}` : 'None'}</div>
                <div className="text-[10px] text-muted-foreground">{proposals.length > 0 ? proposals[0]?.status : 'Not started'}</div>
              </CardContent></Card>
              <Card><CardContent className="p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Pricing</div>
                <div className="text-xl font-bold">{pricingItems.length}</div>
                <div className="text-[10px] text-muted-foreground">items mapped</div>
              </CardContent></Card>
              <Card><CardContent className="p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Documents</div>
                <div className="text-xl font-bold">{documents.length}</div>
                <div className="text-[10px] text-muted-foreground">{documents.filter((d: any) => d.aiSummary).length} analyzed</div>
              </CardContent></Card>
              <Card><CardContent className="p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Compliance</div>
                <div className="text-xl font-bold">{compliance.length}</div>
                <div className="text-[10px] text-muted-foreground">{compliance.filter((c: any) => c.status === 'complete').length} complete</div>
              </CardContent></Card>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left column */}
            <div className="lg:col-span-2 space-y-4">
              {/* Description / Notes */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Description & Notes</CardTitle>
                    {!editingNotes && (
                      <Button variant="ghost" size="sm" onClick={() => setEditingNotes(true)}>Edit</Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {editingNotes ? (
                    <div className="space-y-2">
                      <textarea
                        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[120px] max-h-[400px] resize-y"
                        value={notesValue}
                        onChange={e => setNotesValue(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveNotes}>Save</Button>
                        <Button variant="outline" size="sm" onClick={() => { setEditingNotes(false); setNotesValue(opp.notes ?? ''); }}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="max-h-[300px] overflow-y-auto">
                      <p className="text-sm whitespace-pre-wrap">{opp.notes || opp.description || 'No description or notes yet.'}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Agency info */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Details</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted-foreground">Agency Type:</span> <span className="font-medium capitalize">{opp.agencyType}</span></div>
                    <div><span className="text-muted-foreground">Source:</span> <span className="font-medium">{opp.source ?? '-'}</span></div>
                    <div><span className="text-muted-foreground">NAICS:</span> <span className="font-medium">{opp.naicsCodes ?? '-'}</span></div>
                    <div><span className="text-muted-foreground">Set-Aside:</span> <span className="font-medium">{opp.setAsideType ?? 'None'}</span></div>
                    <div><span className="text-muted-foreground">Contract Type:</span> <span className="font-medium capitalize">{opp.contractType?.replace(/_/g, ' ') ?? '-'}</span></div>
                    <div>
                      <span className="text-muted-foreground">Certifications:</span>{' '}
                      {(opp as any).requiredCertifications?.length ? ((opp as any).requiredCertifications ?? []).map((c: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-[10px] mr-1">{c}</Badge>
                      )) : <span className="font-medium">-</span>}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* AI Analysis */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">AI Analysis</CardTitle>
                    <Button size="sm" onClick={handleAnalyze} disabled={analyzing}>
                      {analyzing ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Analyzing...</> : <><Sparkles className="h-4 w-4 mr-1" /> Analyze with AI</>}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {analysisResult ? (
                    <div className="space-y-3 text-sm">
                      <div><strong>Summary:</strong> <p className="mt-1">{analysisResult.summary || (analysisResult as any).scopeOfWork || 'No summary available'}</p></div>
                      {((analysisResult.keyRequirements ?? (analysisResult as any).technicalRequirements) || []).length > 0 && (
                        <div>
                          <strong>Key Requirements:</strong>
                          <ul className="list-disc ml-4 mt-1 space-y-0.5">{(analysisResult.keyRequirements ?? (analysisResult as any).technicalRequirements ?? []).map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                        </div>
                      )}
                      {((analysisResult.risks ?? (analysisResult as any).risks) || []).length > 0 && (
                        <div>
                          <strong>Risks:</strong>
                          <ul className="list-disc ml-4 mt-1 space-y-0.5">{(analysisResult.risks ?? []).map((r: string, i: number) => <li key={i} className="text-red-600">{r}</li>)}</ul>
                        </div>
                      )}
                      {((analysisResult.recommendations ?? (analysisResult as any).differentiators) || []).length > 0 && (
                        <div>
                          <strong>Recommendations:</strong>
                          <ul className="list-disc ml-4 mt-1 space-y-0.5">{(analysisResult.recommendations ?? (analysisResult as any).differentiators ?? []).map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                        </div>
                      )}
                      {((analysisResult as any).itemsToPriceOut || []).length > 0 && (
                        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                          <strong className="text-blue-700 dark:text-blue-300">Items to Price Out:</strong>
                          <ul className="list-disc ml-4 mt-1 space-y-0.5">{((analysisResult as any).itemsToPriceOut ?? []).map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                        </div>
                      )}
                      {((analysisResult as any).businessRequirements || []).length > 0 && (
                        <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800">
                          <strong className="text-orange-700 dark:text-orange-300">Business Requirements (What They Need From You):</strong>
                          <ul className="list-disc ml-4 mt-1 space-y-0.5">{((analysisResult as any).businessRequirements ?? []).map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                        </div>
                      )}
                      {((analysisResult as any).staffingNeeds || []).length > 0 && (
                        <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800">
                          <strong className="text-purple-700 dark:text-purple-300">Staffing Needs:</strong>
                          <ul className="list-disc ml-4 mt-1 space-y-0.5">{((analysisResult as any).staffingNeeds ?? []).map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Click "Analyze with AI" to get insights about this opportunity.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              {/* Submission Readiness */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Submission Readiness</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {(() => {
                    const checks = [
                      { label: 'RFP Uploaded', done: documents.length > 0 },
                      { label: 'RFP Analyzed', done: !!(opp as any)?.aiAnalysis },
                      { label: 'Pricing Complete', done: pricingItems.filter((p: any) => !p.linkedToId).length > 0 },
                      { label: 'Proposal Created', done: proposals.length > 0 },
                      { label: 'Proposal Sections Done', done: proposals.length > 0 && (proposals[0]?.sections ?? []).every((s: any) => s.content?.trim()?.length > 20) },
                      { label: 'Compliance Items', done: compliance.length > 0 },
                    ];
                    const doneCount = checks.filter(c => c.done).length;
                    const pct = Math.round((doneCount / checks.length) * 100);
                    return (
                      <>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-medium">{pct}%</span>
                        </div>
                        {checks.map((c, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            {c.done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />}
                            <span className={c.done ? 'text-foreground' : 'text-muted-foreground'}>{c.label}</span>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Assignment</CardTitle></CardHeader>
                <CardContent>
                  <Combobox
                    options={techOptions}
                    value={opp.assignedTo ?? ''}
                    onValueChange={v => updateField('assignedTo', v || null)}
                    placeholder="Assign to..."
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Estimated Value</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatDollars(opp.estimatedValue)}</div>
                  {pricingItems.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDollars(pricingTotals.totalMonthlyCents)}/mo &middot; {pricingTotals.margin}% margin
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Contact Info</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-1">
                  <div><span className="text-muted-foreground">Name:</span> {opp.contactName ?? '-'}</div>
                  <div><span className="text-muted-foreground">Email:</span> {opp.contactEmail ?? '-'}</div>
                  <div><span className="text-muted-foreground">Phone:</span> {opp.contactPhone ?? '-'}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Incumbent / Competitors</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-1">
                  <div><span className="text-muted-foreground">Incumbent:</span> {opp.incumbentInfo ?? '-'}</div>
                  <div><span className="text-muted-foreground">Competitors:</span> {opp.competitorNotes ?? '-'}</div>
                </CardContent>
              </Card>

              {(opp.tags ?? []).length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Tags</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1">
                      {(opp.tags ?? []).map((tag, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ---- PRICING ---- */}
        <TabsContent value="pricing">
          <div className="space-y-4">
            {/* Pricing Summary */}
            {pricingItems.length > 0 && (() => {
              const SCENARIO_LABELS: Record<string, string> = { base: 'Base Proposal', option_a: 'Option A', option_b: 'Option B', option_c: 'Option C' };
              const scenarios = [...new Set(pricingItems.map(i => i.scenario || 'base'))].sort();
              const unmappedCount = pricingItems.filter(i => !i.catalogItemId && !i.linkedToId).length;
              return (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-xs text-muted-foreground mb-1">Monthly Revenue</div>
                      <div className="text-lg font-bold text-green-600">{formatDollars(pricingTotals.totalMonthlyCents)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-xs text-muted-foreground mb-1">Annual Revenue</div>
                      <div className="text-lg font-bold text-green-600">{formatDollars(pricingTotals.annualRevenue)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-xs text-muted-foreground mb-1">Annual Cost</div>
                      <div className="text-lg font-bold text-red-600">{formatDollars(pricingTotals.annualCost)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-xs text-muted-foreground mb-1">Margin</div>
                      <div className={`text-lg font-bold ${pricingTotals.margin >= 30 ? 'text-green-600' : pricingTotals.margin >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {pricingTotals.margin}%
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 mt-1 overflow-hidden">
                        <div className={`h-full transition-all ${pricingTotals.margin >= 30 ? 'bg-green-500' : pricingTotals.margin >= 15 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${Math.min(pricingTotals.margin, 100)}%` }} />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-xs text-muted-foreground mb-1">Line Items</div>
                      <div className="text-lg font-bold">{pricingItems.filter(i => !i.linkedToId).length}</div>
                      {unmappedCount > 0 && (
                        <div className="text-[10px] text-yellow-600 mt-0.5">{unmappedCount} unmapped</div>
                      )}
                      {scenarios.length > 1 && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">{scenarios.length} scenarios</div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })()}

            {/* Action buttons */}
            <div className="flex items-center gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={handleGeneratePricing} disabled={generatingPricing}>
                {generatingPricing ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Generating...</> : <><Sparkles className="h-4 w-4 mr-1" /> Generate from AI Analysis</>}
              </Button>
              <Button size="sm" onClick={() => { resetPricingForm(); setEditingPricingId(null); setShowAddPricing(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>

            {/* Pricing Table — grouped by scenario */}
            {pricingItems.length > 0 ? (() => {
              const SCENARIO_LABELS: Record<string, string> = { base: 'Base Proposal', option_a: 'Option A', option_b: 'Option B', option_c: 'Option C' };
              const scenarios = [...new Set(pricingItems.map(i => i.scenario || 'base'))].sort();
              return scenarios.map(scenario => {
                const items = pricingItems.filter(i => (i.scenario || 'base') === scenario);
                const topLevelItems = items.filter(i => !i.linkedToId);
                const scenarioRevenue = topLevelItems.reduce((s, i) => {
                  const qty = parseFloat(i.quantity ?? '1');
                  const price = (i.unitPriceCents ?? 0) * qty;
                  return s + (i.frequency === 'annually' ? Math.round(price / 12) : price);
                }, 0);
                const scenarioCost = topLevelItems.reduce((s, i) => {
                  const qty = parseFloat(i.quantity ?? '1');
                  const cost = (i.unitCostCents ?? 0) * qty;
                  return s + (i.frequency === 'annually' ? Math.round(cost / 12) : cost);
                }, 0);
                const scenarioMargin = scenarioRevenue > 0 ? Math.round(((scenarioRevenue - scenarioCost) / scenarioRevenue) * 100) : 0;
                return (
              <Card key={scenario}>
                <CardHeader className="pb-2 pt-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-sm">{SCENARIO_LABELS[scenario] || scenario}</CardTitle>
                      <span className="text-xs text-muted-foreground">{topLevelItems.length} items</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-muted-foreground">{formatDollars(scenarioRevenue)}/mo</span>
                      <span className={`font-medium ${scenarioMargin >= 30 ? 'text-green-600' : scenarioMargin >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>{scenarioMargin}% margin</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left px-4 py-2 font-medium">Need / Requirement</th>
                          <th className="text-left px-4 py-2 font-medium">Product</th>
                          <th className="text-right px-4 py-2 font-medium">Qty</th>
                          <th className="text-right px-4 py-2 font-medium">Unit Price</th>
                          <th className="text-right px-4 py-2 font-medium">Unit Cost</th>
                          <th className="text-left px-4 py-2 font-medium">Freq</th>
                          <th className="text-right px-4 py-2 font-medium">Line Total</th>
                          <th className="text-right px-4 py-2 font-medium">Margin</th>
                          <th className="text-right px-4 py-2 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topLevelItems.map(item => {
                          const qty = parseFloat(item.quantity ?? '1');
                          const lineTotal = (item.unitPriceCents ?? 0) * qty;
                          const lineCost = (item.unitCostCents ?? 0) * qty;
                          const lineMargin = lineTotal > 0 ? Math.round(((lineTotal - lineCost) / lineTotal) * 100) : 0;
                          const linkedItems = items.filter(i => i.linkedToId === item.id);
                          return (
                            <React.Fragment key={item.id}>
                            <tr className="border-b hover:bg-muted/30">
                              <td className="px-4 py-2 max-w-[200px]">
                                <div className="truncate font-medium" title={item.need}>{item.need}</div>
                                {linkedItems.length > 0 && (
                                  <div className="mt-1 space-y-0.5">
                                    {linkedItems.map((li: any) => (
                                      <div key={li.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <span className="text-primary">↳</span> {li.need}
                                        <button onClick={() => unlinkPricingItem(li.id)} className="ml-1 text-muted-foreground/50 hover:text-destructive" title="Unlink">
                                          <X className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {item.notes && <div className="text-xs text-muted-foreground truncate">{item.notes}</div>}
                              </td>
                              <td className="px-4 py-2">
                                {item.catalogItemName ? (
                                  <Badge variant="secondary" className="text-xs">{item.catalogItemName}</Badge>
                                ) : (
                                  <span className="text-xs text-yellow-600 italic">Unmapped</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right">{item.quantity ?? '1'}</td>
                              <td className="px-4 py-2 text-right">${((item.unitPriceCents ?? 0) / 100).toFixed(2)}</td>
                              <td className="px-4 py-2 text-right">${((item.unitCostCents ?? 0) / 100).toFixed(2)}</td>
                              <td className="px-4 py-2">
                                <Badge variant="outline" className="text-[10px]">{item.frequency ?? 'monthly'}</Badge>
                              </td>
                              <td className="px-4 py-2 text-right font-medium">${(lineTotal / 100).toFixed(2)}</td>
                              <td className="px-4 py-2 text-right">
                                <span className={`text-xs font-medium ${lineMargin >= 30 ? 'text-green-600' : lineMargin >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                                  {lineMargin}%
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditPricing(item)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeletePricing(item.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                      {/* Subtotals row */}
                      <tfoot>
                        <tr className="border-t-2 bg-muted/30 font-medium">
                          <td className="px-4 py-2" colSpan={2}>Subtotal ({SCENARIO_LABELS[scenario] || scenario})</td>
                          <td className="px-4 py-2 text-right">{topLevelItems.reduce((s, i) => s + parseFloat(i.quantity ?? '1'), 0)}</td>
                          <td className="px-4 py-2" colSpan={2}></td>
                          <td className="px-4 py-2"></td>
                          <td className="px-4 py-2 text-right">{formatDollars(topLevelItems.reduce((s, i) => s + (i.unitPriceCents ?? 0) * parseFloat(i.quantity ?? '1'), 0))}</td>
                          <td className="px-4 py-2 text-right">
                            <span className={`${scenarioMargin >= 30 ? 'text-green-600' : scenarioMargin >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {scenarioMargin}%
                            </span>
                          </td>
                          <td className="px-4 py-2"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
                );
              });
            })() : (
              <Card>
                <CardContent className="py-12 text-center">
                  <DollarSign className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-1">No pricing items yet</p>
                  <p className="text-xs text-muted-foreground">Generate from the AI analysis or add line items manually.</p>
                </CardContent>
              </Card>
            )}

            {/* Scenario Comparison (if multiple scenarios) */}
            {pricingItems.length > 0 && (() => {
              const scenarios = [...new Set(pricingItems.map(i => i.scenario || 'base'))].sort();
              if (scenarios.length < 2) return null;
              const SCENARIO_LABELS: Record<string, string> = { base: 'Base Proposal', option_a: 'Option A', option_b: 'Option B', option_c: 'Option C' };
              return (
                <Card>
                  <CardHeader className="pb-2 pt-3 px-4">
                    <CardTitle className="text-sm">Scenario Comparison</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left px-4 py-2 font-medium">Scenario</th>
                            <th className="text-right px-4 py-2 font-medium">Items</th>
                            <th className="text-right px-4 py-2 font-medium">Monthly</th>
                            <th className="text-right px-4 py-2 font-medium">Annual</th>
                            <th className="text-right px-4 py-2 font-medium">Cost</th>
                            <th className="text-right px-4 py-2 font-medium">Margin</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scenarios.map(s => {
                            const sItems = pricingItems.filter(i => (i.scenario || 'base') === s && !i.linkedToId);
                            const sMonthly = sItems.reduce((sum, i) => {
                              const qty = parseFloat(i.quantity ?? '1');
                              const price = (i.unitPriceCents ?? 0) * qty;
                              return sum + (i.frequency === 'annually' ? Math.round(price / 12) : price);
                            }, 0);
                            const sCost = sItems.reduce((sum, i) => {
                              const qty = parseFloat(i.quantity ?? '1');
                              const cost = (i.unitCostCents ?? 0) * qty;
                              return sum + (i.frequency === 'annually' ? Math.round(cost / 12) : cost);
                            }, 0);
                            const sMargin = sMonthly > 0 ? Math.round(((sMonthly - sCost) / sMonthly) * 100) : 0;
                            return (
                              <tr key={s} className="border-b hover:bg-muted/30">
                                <td className="px-4 py-2 font-medium">{SCENARIO_LABELS[s] || s}</td>
                                <td className="px-4 py-2 text-right">{sItems.length}</td>
                                <td className="px-4 py-2 text-right">{formatDollars(sMonthly)}</td>
                                <td className="px-4 py-2 text-right">{formatDollars(sMonthly * 12)}</td>
                                <td className="px-4 py-2 text-right text-red-600">{formatDollars(sCost * 12)}</td>
                                <td className="px-4 py-2 text-right">
                                  <span className={`font-medium ${sMargin >= 30 ? 'text-green-600' : sMargin >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>{sMargin}%</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Add/Edit pricing dialog */}
            <Dialog open={showAddPricing} onOpenChange={(open) => { setShowAddPricing(open); if (!open) { setEditingPricingId(null); resetPricingForm(); } }}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingPricingId ? 'Edit Pricing Item' : 'Add Pricing Item'}</DialogTitle>
                  <DialogDescription>Map an RFP requirement to a product from your service catalog.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Need / Requirement *</Label>
                    <Input
                      value={pricingForm.need}
                      onChange={e => setPricingForm(f => ({ ...f, need: e.target.value }))}
                      placeholder="e.g. Endpoint Protection for 55 workstations"
                    />
                  </div>
                  <div>
                    <Label>Product (from Catalog)</Label>
                    <Combobox
                      options={[
                        { value: '', label: 'No product mapped' },
                        ...catalogItems.map(c => ({ value: c.id, label: `${c.name} (${c.category})` })),
                      ]}
                      value={pricingForm.catalogItemId}
                      onValueChange={handleCatalogSelect}
                      placeholder="Search catalog..."
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={pricingForm.quantity}
                        onChange={e => setPricingForm(f => ({ ...f, quantity: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Unit Price ($)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={pricingForm.unitPriceCents}
                        onChange={e => setPricingForm(f => ({ ...f, unitPriceCents: e.target.value }))}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label>Unit Cost ($)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={pricingForm.unitCostCents}
                        onChange={e => setPricingForm(f => ({ ...f, unitCostCents: e.target.value }))}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Frequency</Label>
                      <Select value={pricingForm.frequency} onValueChange={v => setPricingForm(f => ({ ...f, frequency: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="annually">Annually</SelectItem>
                          <SelectItem value="one_time">One Time</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Pricing Scenario</Label>
                      <Select value={pricingForm.scenario} onValueChange={v => setPricingForm(f => ({ ...f, scenario: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="base">Base Proposal</SelectItem>
                          <SelectItem value="option_a">Option A</SelectItem>
                          <SelectItem value="option_b">Option B</SelectItem>
                          <SelectItem value="option_c">Option C</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Input
                      value={pricingForm.notes}
                      onChange={e => setPricingForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Optional notes..."
                    />
                  </div>
                  <div>
                    <Label>Included In (link to another item)</Label>
                    <Combobox
                      options={[
                        { value: '', label: 'None — standalone item' },
                        ...pricingItems
                          .filter(i => !i.linkedToId && i.id !== editingPricingId && (i.catalogItemId || i.unitPriceCents > 0))
                          .map(i => ({ value: i.id, label: `${i.catalogItemName || i.need}` })),
                      ]}
                      value={pricingForm.linkedToId}
                      onValueChange={v => {
                        setPricingForm(f => ({
                          ...f,
                          linkedToId: v,
                          ...(v ? { unitPriceCents: '0', unitCostCents: '0' } : {}),
                        }));
                      }}
                      placeholder="Select parent item..."
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      If this need is already covered by another product, link it here. Price will be set to $0.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setShowAddPricing(false); setEditingPricingId(null); resetPricingForm(); }}>Cancel</Button>
                  <Button onClick={editingPricingId ? handleUpdatePricing : handleAddPricing} disabled={!pricingForm.need}>
                    {editingPricingId ? 'Update' : 'Add'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>

        {/* ---- DOCUMENTS ---- */}
        <TabsContent value="documents">
          <div className="space-y-4">
            {/* Paste RFP Text */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Paste RFP Content</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <textarea
                  rows={6}
                  value={pasteRfpText}
                  onChange={e => setPasteRfpText(e.target.value)}
                  placeholder="Paste the full RFP / solicitation text here..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y font-mono"
                  disabled={savingPastedRfp}
                />
                <div className="flex gap-2">
                  <Button size="sm" disabled={pasteRfpText.length < 50 || savingPastedRfp} onClick={async () => {
                    setSavingPastedRfp(true);
                    try {
                      // Save to notes
                      await api(`/gov/opportunities/${opportunityId}`, { method: 'PATCH', body: JSON.stringify({ notes: pasteRfpText.substring(0, 50000) }) });
                      // Run AI analysis
                      const result = await api<any>(`/gov/opportunities/${opportunityId}/analyze`, { method: 'POST' });
                      setAnalysisResult({
                        summary: result.summary || result.scopeOfWork || 'Analysis complete',
                        keyRequirements: result.keyRequirements || result.technicalRequirements || [],
                        risks: result.risks || [],
                        recommendations: result.recommendations || result.differentiators || [],
                      });
                      fetchOpp();
                      setPasteRfpText('');
                      toast.success('RFP saved and analyzed');
                    } catch (err: any) {
                      toast.error('Failed', err.message || 'Unknown error');
                    } finally { setSavingPastedRfp(false); }
                  }}>
                    {savingPastedRfp ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Saving & Analyzing...</> : <><Sparkles className="h-4 w-4 mr-1" /> Save & Analyze RFP</>}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Paste the full RFP text here. It will be saved to the opportunity and analyzed by AI.</p>
              </CardContent>
            </Card>

            {/* File Upload */}
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); handleUpload(e.dataTransfer.files); }}
            >
              <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
              <p className="text-xs text-muted-foreground">Drag & drop files or click to upload</p>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => { handleUpload(e.target.files); e.target.value = ''; }} />
            </div>

            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                {documents.length > 0 ? documents.map(doc => (
                  <div
                    key={doc.id}
                    className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${selectedDoc?.id === doc.id ? 'border-primary bg-primary/5' : ''}`}
                    onClick={() => setSelectedDoc(doc)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{doc.fileName}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(doc.createdAt || doc.uploadedAt).toLocaleDateString()}
                          {doc.aiSummary && <span className="ml-2 text-green-600">AI analyzed</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <select
                        className="text-[10px] h-6 rounded border bg-muted px-1 cursor-pointer"
                        value={doc.documentType || 'other'}
                        onClick={e => e.stopPropagation()}
                        onChange={async (e) => {
                          e.stopPropagation();
                          await api(`/gov/documents/${doc.id}`, { method: 'PATCH', body: JSON.stringify({ documentType: e.target.value }) }).catch(() => {});
                          fetchDocuments();
                        }}
                      >
                        <option value="rfp">RFP</option>
                        <option value="amendment">Addendum</option>
                        <option value="attachment">Attachment</option>
                        <option value="response">Response</option>
                        <option value="other">Other</option>
                      </select>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                        disabled={analyzingDocId === doc.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setAnalyzeDocType(doc.documentType === 'amendment' ? 'addendum' : 'rfp');
                          setAnalyzeDocDialog(doc);
                        }}>
                        {analyzingDocId === doc.id ? <><Loader2 className="h-3 w-3 animate-spin" /> Analyzing...</> : <><Sparkles className="h-3 w-3" /> Analyze</>}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const ok = await confirm({ title: 'Delete Document?', description: `Are you sure you want to delete "${doc.fileName}"?`, confirmLabel: 'Delete' });
                          if (!ok) return;
                          await api(`/gov/documents/${doc.id}`, { method: 'DELETE' }).catch(() => {});
                          fetchDocuments();
                          if (selectedDoc?.id === doc.id) setSelectedDoc(null);
                        }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-8 text-sm text-muted-foreground">No documents uploaded yet</div>
                )}
              </div>

              {/* Side panel for selected doc */}
              {selectedDoc && (
                <div className="w-80 shrink-0">
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm truncate">{selectedDoc.fileName}</CardTitle>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedDoc(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm space-y-3">
                      {selectedDoc.aiSummary ? (
                        <>
                          <div><strong>AI Summary:</strong><p className="mt-1">{selectedDoc.aiSummary}</p></div>
                          {selectedDoc.aiExtractedData && (
                            <div>
                              <strong>Extracted Data:</strong>
                              <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto max-h-48">
                                {JSON.stringify(selectedDoc.aiExtractedData, null, 2)}
                              </pre>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-muted-foreground">No AI analysis available for this document.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ---- PROPOSAL ---- */}
        <TabsContent value="proposal">
          <div className="space-y-4">
            {proposals.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Sparkles className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground mb-4">No proposals yet for this opportunity.</p>
                  <div className="flex items-center justify-center gap-3">
                    <Button variant="outline" onClick={() => handleGenerateProposal(false)} disabled={generatingProposal}>
                      Create Empty Draft
                    </Button>
                    <Button onClick={() => handleGenerateProposal(true)} disabled={generatingProposal}>
                      {generatingProposal ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Generating...</> : <><Sparkles className="h-4 w-4 mr-1" /> Generate All with AI</>}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Label>Version:</Label>
                    <Select
                      value={String(selectedProposalVersion ?? proposals[0]?.version)}
                      onValueChange={v => setSelectedProposalVersion(Number(v))}
                    >
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {proposals.map(p => (
                          <SelectItem key={p.version} value={String(p.version)}>v{p.version}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {currentProposal && (
                      <Badge className={`text-xs ${
                        currentProposal.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                        currentProposal.status === 'in_review' ? 'bg-yellow-100 text-yellow-700' :
                        currentProposal.status === 'final' ? 'bg-blue-100 text-blue-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {currentProposal.status.replace(/_/g, ' ')}
                      </Badge>
                    )}
                  </div>
                  {currentProposal && (
                    <div className="flex gap-2">
                      {/* Sync Template */}
                      <Button variant="outline" size="sm" onClick={async () => {
                        const res = await api<any>(`/gov/proposals/${currentProposal.id}/sync-template`, { method: 'POST' });
                        if (res.error) { toast.error(res.error); return; }
                        if (res.added?.length > 0) {
                          const ok = await confirm({ title: 'Sync Template?', description: `Add ${res.added.length} new section${res.added.length > 1 ? 's' : ''}: ${res.added.join(', ')}`, confirmLabel: 'Add Sections' });
                          if (ok) {
                            await api(`/gov/proposals/${currentProposal.id}/sync-template`, { method: 'POST', body: JSON.stringify({ apply: true }) });
                            fetchProposals();
                            toast.success(`${res.added.length} sections added`);
                          }
                        } else { toast.info('Already in sync — no new sections'); }
                      }}>
                        Sync Template
                      </Button>
                      {/* New Version */}
                      <Button variant="outline" size="sm" onClick={async () => {
                        const ok = await confirm({ title: 'Create New Version?', description: `This will lock v${currentProposal.version} and create v${(currentProposal.version || 1) + 1} as a draft.`, confirmLabel: 'Create Version', variant: 'default' });
                        if (!ok) return;
                        await api(`/gov/proposals/${currentProposal.id}/clone`, { method: 'POST' });
                        fetchProposals();
                        toast.success(`Version ${(currentProposal.version || 1) + 1} created`);
                      }}>
                        New Version
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => exportProposalPDF()}>
                        <FileText className="h-4 w-4 mr-1" /> Export Document
                      </Button>
                      <Button variant="outline" size="sm" onClick={async () => {
                        if (currentProposal.shareToken) {
                          // Copy existing link
                          const url = `${window.location.origin}/proposal/${currentProposal.shareToken}`;
                          await navigator.clipboard.writeText(url);
                          toast.success('Link copied to clipboard');
                        } else {
                          // Generate new share link
                          const res = await api<{ shareToken: string }>(`/gov/proposals/${currentProposal.id}/share`, { method: 'POST' });
                          const url = `${window.location.origin}/proposal/${res.shareToken}`;
                          await navigator.clipboard.writeText(url);
                          fetchProposals();
                          toast.success('Share link created and copied to clipboard');
                        }
                      }}>
                        <Send className="h-4 w-4 mr-1" /> {currentProposal.shareToken ? 'Copy Link' : 'Share Link'}
                      </Button>
                      {currentProposal.status === 'draft' && (
                        <Button variant="outline" size="sm" onClick={() => handleUpdateProposalStatus(currentProposal.id, 'in_review')}>Move to Review</Button>
                      )}
                      {currentProposal.status === 'in_review' && (
                        <Button variant="outline" size="sm" onClick={() => handleUpdateProposalStatus(currentProposal.id, 'final')}>Mark Final</Button>
                      )}
                      {currentProposal.status === 'final' && (
                        <Button variant="outline" size="sm" onClick={() => handleUpdateProposalStatus(currentProposal.id, 'submitted')}>Mark Submitted</Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Completion indicator */}
                {(() => {
                  const secs = currentProposal?.sections ?? [];
                  const complete = secs.filter((s: any) => s.isComplete).length;
                  const withContent = secs.filter((s: any) => s.content?.trim()?.length > 20).length;
                  const total = secs.length;
                  const pct = total > 0 ? Math.round((withContent / total) * 100) : 0;
                  return (
                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{withContent}/{total} sections ({pct}%)</span>
                      {(currentProposal as any)?.isLocked && <Badge variant="secondary" className="text-[10px]">Locked</Badge>}
                    </div>
                  );
                })()}

                {(currentProposal?.sections ?? []).sort((a, b) => a.order - b.order).map((section, sectionIdx) => (
                  <Card key={sectionIdx}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleUpdateProposalSection(currentProposal.id, sectionIdx, { isComplete: !section.isComplete })}
                            className="shrink-0"
                          >
                            {section.isComplete ? (
                              <CheckCircle2 className="h-5 w-5 text-green-600" />
                            ) : (
                              <Circle className="h-5 w-5 text-muted-foreground" />
                            )}
                          </button>
                          <CardTitle className="text-sm">{section.title}</CardTitle>
                        </div>
                        <div className="flex gap-1">
                          {(!section.content || section.content.trim().length < 20) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openSectionGenDialog(currentProposal.id, sectionIdx, section.title)}
                            >
                              <Sparkles className="h-4 w-4 mr-1" /> AI Generate
                            </Button>
                          )}
                          {section.content && section.content.trim().length >= 20 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleImproveSection(currentProposal.id, sectionIdx)}
                              disabled={improvingSection === `improve-${sectionIdx}`}
                            >
                              {improvingSection === `improve-${sectionIdx}` ? (
                                <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Improving...</>
                              ) : (
                                <><Sparkles className="h-4 w-4 mr-1" /> AI Improve</>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <textarea
                        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[120px] resize-y"
                        value={section.content}
                        onChange={e => handleUpdateProposalSection(currentProposal.id, sectionIdx, { content: e.target.value })}
                      />
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </div>
        </TabsContent>

        {/* ---- COMPLIANCE ---- */}
        <TabsContent value="compliance">
          <div className="space-y-4">
            {/* Summary + Actions */}
            {compliance.length > 0 && (() => {
              const total = compliance.length;
              const complete = compliance.filter(c => c.status === 'complete').length;
              const missing = compliance.filter(c => c.status === 'missing').length;
              const atRisk = compliance.filter(c => c.status === 'at_risk').length;
              const pct = Math.round((complete / total) * 100);
              const categories = [...new Set(compliance.map(c => c.category))].sort();
              return (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="text-2xl font-bold">{pct}%</div>
                          <div className="text-xs text-muted-foreground">{complete} of {total} complete</div>
                        </div>
                        {missing > 0 && (
                          <div className="flex items-center gap-1 text-red-600">
                            <XCircle className="h-4 w-4" />
                            <span className="text-sm font-medium">{missing} missing</span>
                          </div>
                        )}
                        {atRisk > 0 && (
                          <div className="flex items-center gap-1 text-yellow-600">
                            <AlertTriangle className="h-4 w-4" />
                            <span className="text-sm font-medium">{atRisk} at risk</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowAddCompliance(true)}>
                          <Plus className="h-4 w-4 mr-1" /> Add Item
                        </Button>
                        <Button size="sm" onClick={handleGenerateCompliance} disabled={generatingCompliance}>
                          {generatingCompliance ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Generating...</> : <><Sparkles className="h-4 w-4 mr-1" /> Generate from RFP</>}
                        </Button>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    {/* Category breakdown */}
                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                      {categories.map(cat => {
                        const catItems = compliance.filter(c => c.category === cat);
                        const catComplete = catItems.filter(c => c.status === 'complete').length;
                        return (
                          <div key={cat} className="flex items-center gap-1.5">
                            <Badge className={`text-[10px] ${CATEGORY_COLORS[cat] ?? 'bg-gray-100 text-gray-700'}`}>{cat}</Badge>
                            <span className="text-xs text-muted-foreground">{catComplete}/{catItems.length}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {compliance.length === 0 && (
              <div className="flex items-center gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowAddCompliance(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>
                <Button size="sm" onClick={handleGenerateCompliance} disabled={generatingCompliance}>
                  {generatingCompliance ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Generating...</> : <><Sparkles className="h-4 w-4 mr-1" /> Generate from RFP</>}
                </Button>
              </div>
            )}

            {/* Grouped by category */}
            {compliance.length > 0 ? (() => {
              const categories = [...new Set(compliance.map(c => c.category))].sort();
              return categories.map(cat => {
                const catItems = compliance.filter(c => c.category === cat);
                const catComplete = catItems.filter(c => c.status === 'complete').length;
                const catPct = Math.round((catComplete / catItems.length) * 100);
                return (
                  <Card key={cat}>
                    <CardHeader className="pb-2 pt-3 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge className={`text-[11px] ${CATEGORY_COLORS[cat] ?? 'bg-gray-100 text-gray-700'}`}>{cat}</Badge>
                          <span className="text-xs text-muted-foreground">{catComplete}/{catItems.length} complete</span>
                        </div>
                        <div className="w-24 bg-muted rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-green-500 transition-all" style={{ width: `${catPct}%` }} />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y">
                        {catItems.map(item => {
                          const StatusIcon = COMPLIANCE_STATUS_ICONS[item.status] ?? Circle;
                          const overdue = item.dueDate && new Date(item.dueDate) < new Date() && item.status !== 'complete' && item.status !== 'na';
                          return (
                            <div key={item.id} className={`flex items-center gap-3 px-4 py-3 group ${overdue ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}>
                              <button
                                onClick={() => handleToggleCompliance(item.id, item.status)}
                                className="shrink-0"
                                title={`Status: ${item.status} — Click to cycle`}
                              >
                                <StatusIcon className={`h-5 w-5 ${COMPLIANCE_STATUS_COLORS[item.status]} transition-transform hover:scale-110`} />
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className={`text-sm ${item.status === 'complete' ? 'line-through text-muted-foreground' : ''}`}>{item.requirement}</div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className={`text-[10px] font-medium capitalize ${COMPLIANCE_STATUS_COLORS[item.status]}`}>{item.status.replace('_', ' ')}</span>
                                  {item.dueDate && (
                                    <span className={`text-[10px] ${overdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                                      {overdue ? 'Overdue: ' : 'Due: '}{new Date(item.dueDate).toLocaleDateString()}
                                    </span>
                                  )}
                                  {item.assignedTo && (
                                    <span className="text-[10px] text-muted-foreground">
                                      {techs.find(t => t.id === item.assignedTo)?.displayName ?? 'Assigned'}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                  onClick={async () => {
                                    await api(`/gov/compliance/${item.id}`, { method: 'DELETE' }).catch(() => {});
                                    fetchCompliance();
                                  }}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              });
            })() : (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-1">No compliance items yet</p>
                  <p className="text-xs text-muted-foreground">Generate from the RFP analysis or add requirements manually.</p>
                </CardContent>
              </Card>
            )}

            {/* Add compliance dialog */}
            <Dialog open={showAddCompliance} onOpenChange={setShowAddCompliance}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Compliance Item</DialogTitle>
                  <DialogDescription>Add a manual compliance requirement to track.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Requirement</Label>
                    <Input value={complianceForm.requirement} onChange={e => setComplianceForm(f => ({ ...f, requirement: e.target.value }))} placeholder="e.g. SAM.gov registration required" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Category</Label>
                      <Select value={complianceForm.category} onValueChange={v => setComplianceForm(f => ({ ...f, category: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="form">Form</SelectItem>
                          <SelectItem value="certification">Certification</SelectItem>
                          <SelectItem value="attachment">Attachment</SelectItem>
                          <SelectItem value="format">Format</SelectItem>
                          <SelectItem value="content">Content</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Due Date</Label>
                      <Input type="date" value={complianceForm.dueDate} onChange={e => setComplianceForm(f => ({ ...f, dueDate: e.target.value }))} />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddCompliance(false)}>Cancel</Button>
                  <Button onClick={handleAddCompliance} disabled={!complianceForm.requirement}>Add</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>

        {/* ---- SUBMISSIONS ---- */}
        <TabsContent value="submissions">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowSubmissionForm(true)}>
                <Send className="h-4 w-4 mr-1" /> Record Submission
              </Button>
            </div>

            {submissions.length > 0 ? (
              <div className="space-y-3">
                {submissions.map(sub => (
                  <Card key={sub.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="secondary">{sub.method}</Badge>
                        <span className="text-sm text-muted-foreground">{new Date(sub.submittedAt).toLocaleString()}</span>
                      </div>
                      {sub.confirmationNumber && (
                        <div className="text-sm"><span className="text-muted-foreground">Confirmation:</span> {sub.confirmationNumber}</div>
                      )}
                      {sub.notes && <p className="text-sm mt-1">{sub.notes}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No submissions recorded yet.
                </CardContent>
              </Card>
            )}

            {/* Submission form dialog */}
            <Dialog open={showSubmissionForm} onOpenChange={setShowSubmissionForm}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Record Submission</DialogTitle>
                  <DialogDescription>Record a proposal submission for this opportunity.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Method *</Label>
                    <Select value={submissionForm.method} onValueChange={v => setSubmissionForm(f => ({ ...f, method: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="portal">Portal</SelectItem>
                        <SelectItem value="mail">Mail</SelectItem>
                        <SelectItem value="in_person">In Person</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Submission Date</Label>
                    <Input type="datetime-local" value={submissionForm.submittedAt} onChange={e => setSubmissionForm(f => ({ ...f, submittedAt: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Confirmation Number</Label>
                    <Input value={submissionForm.confirmationNumber} onChange={e => setSubmissionForm(f => ({ ...f, confirmationNumber: e.target.value }))} placeholder="If applicable" />
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <textarea
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px] resize-y"
                      value={submissionForm.notes}
                      onChange={e => setSubmissionForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Additional notes..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowSubmissionForm(false)}>Cancel</Button>
                  <Button onClick={handleSubmission} disabled={!submissionForm.method}>Submit</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>

        {/* ---- ACTIVITY ---- */}
        <TabsContent value="activity">
          <div className="space-y-4">
            {/* Add note */}
            <Card>
              <CardContent className="p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a note..."
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={handleAddNote} disabled={addingNote || !noteText.trim()}>
                    {addingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            {activities.length > 0 ? (
              <div className="space-y-3">
                {activities.map(a => (
                  <div key={a.id} className="flex items-start gap-3 pl-2">
                    <div className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{a.description}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {a.userName && <span>{a.userName} &middot; </span>}
                        <Badge variant="secondary" className="text-[10px] mr-1">{a.type}</Badge>
                        {timeAgo(a.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No activity recorded yet.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Analyze Document Dialog */}
      <Dialog open={!!analyzeDocDialog} onOpenChange={(open) => { if (!analyzingDocId) { if (!open) setAnalyzeDocDialog(null); } }}>
        <DialogContent className="max-w-sm overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 shrink-0" /> Analyze Document
            </DialogTitle>
            <DialogDescription>
              Classify this document so the AI knows how to process it.
            </DialogDescription>
          </DialogHeader>

          {analyzeDocDialog && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/50 p-3 overflow-hidden">
                <p className="text-sm font-medium break-all line-clamp-2">{analyzeDocDialog.fileName}</p>
              </div>

              <div className="space-y-2">
                <Label>Document Type</Label>
                <div className="flex gap-2">
                  {([['rfp', 'RFP / Solicitation'], ['addendum', 'Addendum / Amendment']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setAnalyzeDocType(val)}
                      className={`flex-1 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors ${
                        analyzeDocType === val
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:border-muted-foreground/50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {analyzeDocType === 'rfp'
                    ? 'The extracted text will replace the opportunity notes and be used as the primary RFP content for AI analysis.'
                    : 'The extracted text will be appended to the existing opportunity notes as an addendum.'}
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setAnalyzeDocDialog(null)}>Cancel</Button>
                <Button disabled={!!analyzingDocId} onClick={async () => {
                  const docId = analyzeDocDialog.id;
                  setAnalyzingDocId(docId);
                  try {
                    // Update document type
                    await api(`/gov/documents/${docId}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ documentType: analyzeDocType === 'rfp' ? 'rfp' : 'amendment' }),
                    }).catch(() => {});

                    // Analyze with the type hint
                    const result = await api<any>(`/gov/documents/${docId}/analyze`, {
                      method: 'POST',
                      body: JSON.stringify({ documentType: analyzeDocType }),
                    });

                    if (result.error) {
                      toast.error('Analysis error', result.error);
                    } else {
                      setAnalyzeDocDialog(null);
                      fetchDocuments();
                      fetchOpp();
                      fetchCompliance();
                    }
                  } catch (err: any) {
                    toast.error('Analysis failed', err.message);
                  } finally {
                    setAnalyzingDocId(null);
                  }
                }}>
                  {analyzingDocId ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Analyzing...</> : <><Sparkles className="h-4 w-4 mr-1" /> Analyze</>}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Section Generation Dialog */}
      <Dialog open={!!sectionGenDialog} onOpenChange={(open) => { if (sectionGenStatus !== 'generating') { if (!open) setSectionGenDialog(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Generate: {sectionGenDialog?.sectionTitle}
            </DialogTitle>
          </DialogHeader>

          {sectionGenStatus === 'idle' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                AI will generate the <strong>{sectionGenDialog?.sectionTitle}</strong> section using the opportunity details
                {sectionGenDialog?.sectionTitle?.toLowerCase().includes('pricing') && pricingItems.length > 0 && ', your pricing items,'}
                {' '}and any uploaded RFP analysis.
              </p>

              {sectionGenDialog?.sectionTitle?.toLowerCase().includes('pricing') && pricingItems.length > 0 && (
                <div className="rounded-md border p-3 space-y-1.5 max-h-40 overflow-y-auto bg-muted/30">
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Pricing items to include</div>
                  {pricingItems.filter(p => !p.linkedToId).map((p: any) => (
                    <div key={p.id} className="text-xs flex justify-between">
                      <span>{p.catalogItemName || p.need}</span>
                      <span className="text-muted-foreground">
                        ${((p.unitPriceCents || 0) / 100).toFixed(2)} x{p.quantity} /{p.frequency}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {sectionGenDialog?.sectionTitle?.toLowerCase().includes('sla') && slaPolicies.length > 0 && (
                <div className="space-y-2">
                  <Label>SLA Policy</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={selectedSlaPolicyId}
                    onChange={e => setSelectedSlaPolicyId(e.target.value)}
                  >
                    {slaPolicies.map(p => (
                      <option key={p.id} value={p.id}>{p.name}{p.isDefault ? ' (Default)' : ''}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">The selected SLA response/resolution times will be included in the generated section.</p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Additional instructions <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <textarea
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px] resize-y"
                  value={sectionGenInstructions}
                  onChange={e => setSectionGenInstructions(e.target.value)}
                  placeholder={`e.g. "Focus on our CJIS compliance experience" or "Include specific product pricing from the pricing tab"`}
                />
              </div>

              {/* Prompt Stack Viewer */}
              <details className="text-xs">
                <summary className="text-muted-foreground cursor-pointer hover:text-foreground font-medium">
                  View AI Prompt Sources
                </summary>
                <div className="mt-2 space-y-2 rounded-md border p-3 bg-muted/30">
                  <div><span className="font-medium text-foreground">Company Profile:</span> <span className="text-muted-foreground">{opp ? 'Loaded from Gov Settings' : 'Not configured'}</span></div>
                  <div><span className="font-medium text-foreground">Section Template:</span> <span className="text-muted-foreground">"{sectionGenDialog?.sectionTitle}" instructions from Gov Settings</span></div>
                  <div><span className="font-medium text-foreground">Opportunity:</span> <span className="text-muted-foreground">{opp?.title || 'N/A'} — {opp?.agency || 'N/A'}</span></div>
                  <div><span className="font-medium text-foreground">RFP Analysis:</span> <span className="text-muted-foreground">{opp?.aiAnalysis ? 'Available' : 'Not analyzed'}</span></div>
                  <div><span className="font-medium text-foreground">Pricing Items:</span> <span className="text-muted-foreground">{pricingItems.length} items loaded</span></div>
                  {sectionGenInstructions && <div><span className="font-medium text-foreground">Your Instructions:</span> <span className="text-muted-foreground">"{sectionGenInstructions.substring(0, 100)}"</span></div>}
                </div>
              </details>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSectionGenDialog(null)}>Cancel</Button>
                <Button onClick={runSectionGeneration}>
                  <Sparkles className="h-4 w-4 mr-1" /> Generate Section
                </Button>
              </DialogFooter>
            </div>
          )}

          {sectionGenStatus === 'generating' && (
            <div className="py-8 text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <div>
                <p className="font-medium">Generating {sectionGenDialog?.sectionTitle}...</p>
                <p className="text-sm text-muted-foreground mt-1">This may take 15-30 seconds</p>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <div className="bg-primary h-full rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          )}

          {sectionGenStatus === 'done' && (
            <div className="space-y-4">
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-4 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                <div>
                  <p className="font-medium text-green-800 dark:text-green-300">Section generated successfully</p>
                  <p className="text-sm text-muted-foreground mt-0.5">Review the content and use "AI Improve" to refine it further.</p>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setSectionGenDialog(null)}>Done</Button>
              </DialogFooter>
            </div>
          )}

          {sectionGenStatus === 'error' && (
            <div className="space-y-4">
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 flex items-center gap-3">
                <XCircle className="h-5 w-5 text-red-600 shrink-0" />
                <div>
                  <p className="font-medium text-red-800 dark:text-red-300">Generation failed</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{sectionGenError}</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSectionGenDialog(null)}>Close</Button>
                <Button onClick={() => { setSectionGenStatus('idle'); }}>Try Again</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
