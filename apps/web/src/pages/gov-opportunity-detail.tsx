import { useEffect, useState, useCallback, useRef } from 'react';
import { api, getAccessToken, API_BASE } from '@/lib/api';
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
  DollarSign, Pencil, Trash2,
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
  version: number;
  status: string;
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
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [techs, setTechs] = useState<Tech[]>([]);

  // Tab data
  const [documents, setDocuments] = useState<GovDocument[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedProposalVersion, setSelectedProposalVersion] = useState<number | null>(null);
  const [compliance, setCompliance] = useState<ComplianceItem[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  // Pricing
  const [pricingItems, setPricingItems] = useState<any[]>([]);
  const [catalogItems, setCatalogItems] = useState<Array<{id: string; name: string; category: string; defaultUnitPriceCents: number; defaultUnitCostCents: number | null}>>([]);
  const [showAddPricing, setShowAddPricing] = useState(false);
  const [editingPricingId, setEditingPricingId] = useState<string | null>(null);
  const [pricingForm, setPricingForm] = useState({ need: '', catalogItemId: '', quantity: '1', unitPriceCents: '', unitCostCents: '', frequency: 'monthly', notes: '' });
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
      alert(`AI Analysis failed: ${err.message || 'Unknown error'}`);
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
          alert(`Upload failed (${res.status}): ${err.substring(0, 200)}`);
        } else {
          console.log('[GOV-UPLOAD] Success');
        }
      } catch (err: any) {
        alert(`Upload error: ${err.message || 'Failed'}`);
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
      alert(`Analysis failed: ${err.message || 'Unknown error'}`);
    }
    finally { setAnalyzingDocs(false); }
  }

  async function handleGenerateProposal() {
    setGeneratingProposal(true);
    try {
      await api(`/gov/opportunities/${opportunityId}/proposals`, { method: 'POST', body: JSON.stringify({ aiGenerate: true }) });
      await fetchProposals();
    } catch (err: any) {
      alert(`Proposal generation failed: ${err.message || 'Unknown error. The AI may have timed out — try again.'}`);
    }
    finally { setGeneratingProposal(false); }
  }

  async function handleUpdateProposalSection(proposalId: string, sectionId: string, updates: Partial<ProposalSection>) {
    try {
      await api(`/gov/opportunities/${opportunityId}/proposals/${proposalId}/sections/${sectionId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      fetchProposals();
    } catch { /* ignore */ }
  }

  async function handleImproveSection(proposalId: string, sectionId: string) {
    setImprovingSection(sectionId);
    try {
      await api(`/gov/opportunities/${opportunityId}/proposals/${proposalId}/sections/${sectionId}/improve`, { method: 'POST' });
      fetchProposals();
    } catch { /* ignore */ }
    finally { setImprovingSection(null); }
  }

  async function handleUpdateProposalStatus(proposalId: string, status: string) {
    try {
      await api(`/gov/opportunities/${opportunityId}/proposals/${proposalId}`, {
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
    setPricingForm({ need: '', catalogItemId: '', quantity: '1', unitPriceCents: '', unitCostCents: '', frequency: 'monthly', notes: '' });
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
      <Tabs defaultValue="overview">
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
            {pricingItems.length > 0 && (
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
                    <div className={`text-lg font-bold ${pricingTotals.margin >= 30 ? 'text-green-600' : pricingTotals.margin >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>{pricingTotals.margin}%</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-xs text-muted-foreground mb-1">Contract Value</div>
                    <div className="text-lg font-bold">{formatDollars(pricingTotals.annualRevenue)}</div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={handleGeneratePricing} disabled={generatingPricing}>
                {generatingPricing ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Generating...</> : <><Sparkles className="h-4 w-4 mr-1" /> Generate from AI Analysis</>}
              </Button>
              <Button size="sm" onClick={() => { resetPricingForm(); setEditingPricingId(null); setShowAddPricing(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>

            {/* Pricing Table */}
            {pricingItems.length > 0 ? (
              <Card>
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
                        {pricingItems.map(item => {
                          const qty = parseFloat(item.quantity ?? '1');
                          const lineTotal = (item.unitPriceCents ?? 0) * qty;
                          const lineCost = (item.unitCostCents ?? 0) * qty;
                          const lineMargin = lineTotal > 0 ? Math.round(((lineTotal - lineCost) / lineTotal) * 100) : 0;
                          return (
                            <tr key={item.id} className="border-b hover:bg-muted/30">
                              <td className="px-4 py-2 max-w-[200px]">
                                <div className="truncate" title={item.need}>{item.need}</div>
                                {item.notes && <div className="text-xs text-muted-foreground truncate">{item.notes}</div>}
                              </td>
                              <td className="px-4 py-2">
                                {item.catalogItemName ? (
                                  <Badge variant="secondary" className="text-xs">{item.catalogItemName}</Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">Unmapped</span>
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
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted/50 font-medium">
                          <td className="px-4 py-2" colSpan={6}>Totals</td>
                          <td className="px-4 py-2 text-right">{formatDollars(pricingTotals.totalMonthlyCents)}/mo</td>
                          <td className="px-4 py-2 text-right">
                            <span className={pricingTotals.margin >= 30 ? 'text-green-600' : pricingTotals.margin >= 15 ? 'text-yellow-600' : 'text-red-600'}>
                              {pricingTotals.margin}%
                            </span>
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <DollarSign className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground mb-4">No pricing items yet. Generate from the AI analysis or add manually.</p>
                </CardContent>
              </Card>
            )}

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
                    <Label>Notes</Label>
                    <Input
                      value={pricingForm.notes}
                      onChange={e => setPricingForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Optional notes..."
                    />
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
                      alert('RFP saved and analyzed successfully');
                    } catch (err: any) {
                      alert(`Failed: ${err.message || 'Unknown error'}`);
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
                      <Badge variant="secondary" className="text-[10px]">{doc.documentType || doc.fileName?.split('.').pop()}</Badge>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const result = await api<any>(`/gov/documents/${doc.id}/analyze`, { method: 'POST' });
                            if (result.error) { alert(result.error); return; }
                            alert('Document analyzed! Check Overview for results.');
                            fetchDocuments();
                            fetchOpp();
                            fetchCompliance();
                          } catch (err: any) { alert(`Analysis failed: ${err.message}`); }
                        }}>
                        <Sparkles className="h-3 w-3" /> Analyze
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Delete ${doc.fileName}?`)) return;
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
                  <Button onClick={handleGenerateProposal} disabled={generatingProposal}>
                    {generatingProposal ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Generating...</> : <><Sparkles className="h-4 w-4 mr-1" /> Generate Proposal with AI</>}
                  </Button>
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

                {(currentProposal?.sections ?? []).sort((a, b) => a.order - b.order).map(section => (
                  <Card key={section.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleUpdateProposalSection(currentProposal.id, section.id, { isComplete: !section.isComplete })}
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleImproveSection(currentProposal.id, section.id)}
                          disabled={improvingSection === section.id}
                        >
                          {improvingSection === section.id ? (
                            <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Improving...</>
                          ) : (
                            <><Sparkles className="h-4 w-4 mr-1" /> AI Improve</>
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <textarea
                        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[120px] resize-y"
                        value={section.content}
                        onChange={e => handleUpdateProposalSection(currentProposal.id, section.id, { content: e.target.value })}
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
            <div className="flex items-center gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowAddCompliance(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
              <Button size="sm" onClick={handleGenerateCompliance} disabled={generatingCompliance}>
                {generatingCompliance ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Generating...</> : <><Sparkles className="h-4 w-4 mr-1" /> Generate from RFP</>}
              </Button>
            </div>

            {compliance.length > 0 ? (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {compliance.map(item => {
                      const StatusIcon = COMPLIANCE_STATUS_ICONS[item.status] ?? Circle;
                      return (
                        <div key={item.id} className="flex items-center gap-3 px-4 py-3 group">
                          <button
                            onClick={() => handleToggleCompliance(item.id, item.status)}
                            className="shrink-0"
                            title={`Status: ${item.status} — Click to cycle: pending → complete → missing → at risk → N/A`}
                          >
                            <StatusIcon className={`h-5 w-5 ${COMPLIANCE_STATUS_COLORS[item.status]} transition-transform hover:scale-110`} />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm ${item.status === 'complete' ? 'line-through text-muted-foreground' : ''}`}>{item.requirement}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-[10px] font-medium capitalize ${COMPLIANCE_STATUS_COLORS[item.status]}`}>{item.status.replace('_', ' ')}</span>
                              {item.dueDate && (
                                <span className="text-[10px] text-muted-foreground">Due: {new Date(item.dueDate).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                          <Badge className={`text-[10px] ${CATEGORY_COLORS[item.category] ?? 'bg-gray-100 text-gray-700'}`}>
                            {item.category}
                          </Badge>
                          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                            onClick={async () => {
                              await api(`/gov/compliance/${item.id}`, { method: 'DELETE' }).catch(() => {});
                              fetchCompliance();
                            }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No compliance items yet. Generate from the RFP or add manually.
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
                    <Input value={complianceForm.requirement} onChange={e => setComplianceForm(f => ({ ...f, requirement: e.target.value }))} placeholder="Compliance requirement" />
                  </div>
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
    </div>
  );
}
