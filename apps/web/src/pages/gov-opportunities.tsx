import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import {
  Plus, LayoutGrid, List, Search, Calendar, DollarSign, Sparkles, Loader2,
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
  winProbability: number | null;
  setAsideType: string | null;
  assignedTo: string | null;
  source: string | null;
  naicsCodes: string | null;
  contractType: string | null;
  questionDeadline: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  tags: string[] | null;
  notes: string | null;
}

interface Tech {
  id: string;
  displayName: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLUMNS = [
  { status: 'discovered', label: 'Discovered' },
  { status: 'qualified', label: 'Qualified' },
  { status: 'in_review', label: 'In Review' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'submitted', label: 'Submitted' },
  { status: 'awarded', label: 'Awarded' },
  { status: 'lost', label: 'Lost' },
];

const AGENCY_TYPE_OPTIONS = [
  { value: '', label: 'All Agency Types' },
  { value: 'federal', label: 'Federal' },
  { value: 'state', label: 'State' },
  { value: 'county', label: 'County' },
  { value: 'city', label: 'City' },
];

const SET_ASIDE_OPTIONS = [
  { value: '', label: 'All Set-Asides' },
  { value: 'small_business', label: 'Small Business' },
  { value: '8a', label: '8(a)' },
  { value: 'hubzone', label: 'HUBZone' },
  { value: 'sdvosb', label: 'SDVOSB' },
  { value: 'wosb', label: 'WOSB' },
  { value: 'none', label: 'None' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  ...COLUMNS.map(c => ({ value: c.status, label: c.label })),
];

const CONTRACT_TYPE_OPTIONS = [
  { value: '', label: 'Select contract type' },
  { value: 'firm_fixed_price', label: 'Firm Fixed Price' },
  { value: 'time_and_materials', label: 'Time & Materials' },
  { value: 'cost_plus', label: 'Cost Plus' },
  { value: 'idiq', label: 'IDIQ' },
  { value: 'bpa', label: 'BPA' },
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

const AGENCY_TYPE_COLORS: Record<string, string> = {
  federal: 'bg-blue-100 text-blue-700',
  state: 'bg-purple-100 text-purple-700',
  county: 'bg-teal-100 text-teal-700',
  city: 'bg-orange-100 text-orange-700',
};

function formatDollars(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(0)}K`;
  return `$${dollars.toFixed(0)}`;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const now = new Date();
  const deadline = new Date(dateStr);
  return Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface GovOpportunitiesPageProps {
  onNavigate: (path: string) => void;
}

export function GovOpportunitiesPage({ onNavigate }: GovOpportunitiesPageProps) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'kanban'>('kanban');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [agencyTypeFilter, setAgencyTypeFilter] = useState('');
  const [setAsideFilter, setSetAsideFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [assignedFilter, setAssignedFilter] = useState('');

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Paste RFP dialog
  const [pasteOpen, setPasteOpen] = useState(false);
  const [rfpText, setRfpText] = useState('');
  const [pasting, setPasting] = useState(false);
  const [pasteResult, setPasteResult] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    agency: '',
    agencyType: 'federal',
    source: '',
    naicsCodes: '',
    setAsideType: '',
    estimatedValueCents: 0,
    contractType: '',
    submissionDeadline: '',
    questionDeadline: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    tags: '',
    notes: '',
  });

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ data: Opportunity[] }>('/gov/opportunities?limit=500');
      setOpportunities(res.data ?? []);
    } catch {
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOpportunities();
    api<Tech[]>('/dispatch/techs').then(setTechs).catch(() => {});
  }, [fetchOpportunities]);

  // ---------------------------------------------------------------------------
  // Filter
  // ---------------------------------------------------------------------------

  const filtered = opportunities.filter(o => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!o.title.toLowerCase().includes(q) && !o.agency.toLowerCase().includes(q)) return false;
    }
    if (agencyTypeFilter && o.agencyType !== agencyTypeFilter) return false;
    if (setAsideFilter && o.setAsideType !== setAsideFilter) return false;
    if (statusFilter && o.status !== statusFilter) return false;
    if (assignedFilter && o.assignedTo !== assignedFilter) return false;
    return true;
  });

  // ---------------------------------------------------------------------------
  // Drag and drop
  // ---------------------------------------------------------------------------

  async function handleDragEnd(result: DropResult) {
    const { draggableId, destination } = result;
    if (!destination) return;
    const newStatus = destination.droppableId;
    const opp = opportunities.find(o => o.id === draggableId);
    if (!opp || opp.status === newStatus) return;

    setOpportunities(prev => prev.map(o => o.id === draggableId ? { ...o, status: newStatus } : o));

    try {
      await api(`/gov/opportunities/${draggableId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (err) {
      console.error('Status update failed:', err);
      fetchOpportunities(); // Revert optimistic update
    }
  }

  // ---------------------------------------------------------------------------
  // Create opportunity
  // ---------------------------------------------------------------------------

  async function handleCreate() {
    if (!form.title || !form.agency) return;
    setCreating(true);
    try {
      await api('/gov/opportunities', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          agency: form.agency,
          agencyType: form.agencyType,
          source: form.source || undefined,
          naicsCodes: form.naicsCodes || undefined,
          setAsideType: form.setAsideType || undefined,
          estimatedValue: form.estimatedValueCents,
          contractType: form.contractType || undefined,
          submissionDeadline: form.submissionDeadline || undefined,
          questionDeadline: form.questionDeadline || undefined,
          contactName: form.contactName || undefined,
          contactEmail: form.contactEmail || undefined,
          contactPhone: form.contactPhone || undefined,
          tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
          notes: form.notes || undefined,
        }),
      });
      setCreateOpen(false);
      setForm({
        title: '', agency: '', agencyType: 'federal', source: '', naicsCodes: '',
        setAsideType: '', estimatedValueCents: 0, contractType: '', submissionDeadline: '',
        questionDeadline: '', contactName: '', contactEmail: '', contactPhone: '', tags: '', notes: '',
      });
      fetchOpportunities();
    } catch {
      // leave open
    } finally {
      setCreating(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------------

  const techMap = new Map(techs.map(t => [t.id, t.displayName]));
  const techOptions = [
    { value: '', label: 'All Assignees' },
    ...techs.map(t => ({ value: t.id, label: t.displayName })),
  ];

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function OpportunityCard({ opp }: { opp: Opportunity }) {
    const days = daysUntil(opp.submissionDeadline);
    return (
      <div
        className="rounded-md border bg-card p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => onNavigate(`/gov/opportunities/${opp.id}`)}
      >
        <div className="text-sm font-medium truncate mb-1" title={opp.title}>
          {opp.title}
        </div>
        <div className="flex items-center gap-1.5 mb-2">
          <Badge className={`text-[10px] px-1.5 py-0 ${AGENCY_TYPE_COLORS[opp.agencyType] ?? 'bg-gray-100 text-gray-700'}`}>
            {opp.agencyType}
          </Badge>
          <span className="text-[10px] text-muted-foreground truncate">{opp.agency}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span className="flex items-center gap-1 font-medium text-foreground">
            <DollarSign className="h-3 w-3" />
            {formatDollars(opp.estimatedValue)}
          </span>
          {days !== null && (
            <span className={`flex items-center gap-1 ${
              days <= 0 ? 'text-red-600 font-medium' : days <= 7 ? 'text-red-600' : days <= 14 ? 'text-yellow-600' : ''
            }`}>
              <Calendar className="h-3 w-3" />
              {days <= 0 ? 'Overdue' : `${days}d`}
            </span>
          )}
        </div>
        {opp.setAsideType && opp.setAsideType !== 'none' && (
          <Badge variant="outline" className="text-[9px] px-1 py-0 mb-1.5">{opp.setAsideType.toUpperCase()}</Badge>
        )}
        {opp.winProbability !== null && (
          <div className="flex items-center gap-1.5">
            <div className="flex-1 bg-muted rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${
                  opp.winProbability >= 70 ? 'bg-green-500' : opp.winProbability >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${opp.winProbability}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground w-6 text-right">{opp.winProbability}%</span>
          </div>
        )}
        {opp.assignedTo && (
          <div className="text-[10px] text-muted-foreground mt-1.5 truncate">
            {techMap.get(opp.assignedTo) ?? 'Assigned'}
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-32" />)}
        </div>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {COLUMNS.map(col => (
            <div key={col.status} className="w-72 shrink-0 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search opportunities..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Combobox
          options={AGENCY_TYPE_OPTIONS}
          value={agencyTypeFilter}
          onValueChange={setAgencyTypeFilter}
          placeholder="Agency Type..."
          className="w-40"
        />
        <Combobox
          options={SET_ASIDE_OPTIONS}
          value={setAsideFilter}
          onValueChange={setSetAsideFilter}
          placeholder="Set-Aside..."
          className="w-40"
        />
        {view === 'list' && (
          <Combobox
            options={STATUS_OPTIONS}
            value={statusFilter}
            onValueChange={setStatusFilter}
            placeholder="Status..."
            className="w-40"
          />
        )}
        <Combobox
          options={techOptions}
          value={assignedFilter}
          onValueChange={setAssignedFilter}
          placeholder="Assigned..."
          className="w-40"
        />
        <div className="flex items-center gap-1 ml-auto">
          <Button
            variant={view === 'kanban' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('kanban')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={view === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('list')}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPasteOpen(true)}>
            <Sparkles className="h-4 w-4 mr-1" />
            Paste RFP
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
        </div>
      </div>

      {/* Pipeline Summary */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">{filtered.length} opportunit{filtered.length !== 1 ? 'ies' : 'y'}</span>
        <span className="text-muted-foreground">|</span>
        <span className="font-medium">Pipeline: {formatDollars(filtered.filter(o => !['awarded', 'lost'].includes(o.status)).reduce((s, o) => s + (o.estimatedValue || 0), 0))}</span>
        <span className="text-green-600 font-medium">Awarded: {formatDollars(filtered.filter(o => o.status === 'awarded').reduce((s, o) => s + (o.estimatedValue || 0), 0))}</span>
        {(() => {
          const urgentCount = filtered.filter(o => {
            const d = daysUntil(o.submissionDeadline);
            return d !== null && d <= 7 && d >= 0 && !['awarded', 'lost', 'submitted'].includes(o.status);
          }).length;
          return urgentCount > 0 ? <span className="text-red-600 font-medium">{urgentCount} due within 7 days</span> : null;
        })()}
      </div>

      {/* Kanban View */}
      {view === 'kanban' && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 260px)' }}>
            {COLUMNS.map(col => {
              const colOpps = filtered.filter(o => o.status === col.status);
              return (
                <div key={col.status} className="w-72 shrink-0 flex flex-col">
                  <div className="flex items-center justify-between px-2 py-2 rounded-t-lg bg-muted">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{col.label}</span>
                      <span className="text-xs text-muted-foreground bg-background rounded-full px-2 py-0.5">
                        {colOpps.length}
                      </span>
                    </div>
                    {colOpps.length > 0 && (
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {formatDollars(colOpps.reduce((s, o) => s + (o.estimatedValue || 0), 0))}
                      </span>
                    )}
                  </div>
                  <Droppable droppableId={col.status}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 p-1.5 space-y-1.5 rounded-b-lg border border-t-0 transition-colors min-h-[100px] ${
                          snapshot.isDraggingOver ? 'bg-primary/5' : 'bg-muted/30'
                        }`}
                      >
                        {colOpps.map((opp, index) => (
                          <Draggable key={opp.id} draggableId={opp.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={snapshot.isDragging ? 'shadow-lg ring-2 ring-primary/20 rounded-md' : ''}
                              >
                                <OpportunityCard opp={opp} />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {/* List View */}
      {view === 'list' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">Title</th>
                    <th className="text-left px-4 py-3 font-medium">Agency</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-4 py-3 font-medium">Value</th>
                    <th className="text-left px-4 py-3 font-medium">Deadline</th>
                    <th className="text-left px-4 py-3 font-medium">Assigned</th>
                    <th className="text-right px-4 py-3 font-medium">Win %</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(opp => {
                    const days = daysUntil(opp.submissionDeadline);
                    return (
                      <tr
                        key={opp.id}
                        className="border-b hover:bg-muted/30 cursor-pointer"
                        onClick={() => onNavigate(`/gov/opportunities/${opp.id}`)}
                      >
                        <td className="px-4 py-3 font-medium">{opp.title}</td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className="text-[10px]">{opp.agency}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[opp.status]}`}>
                            {COLUMNS.find(c => c.status === opp.status)?.label ?? opp.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">{formatDollars(opp.estimatedValue)}</td>
                        <td className="px-4 py-3">
                          {opp.submissionDeadline ? (
                            <span className={days !== null && days <= 7 ? 'text-red-600 font-medium' : ''}>
                              {new Date(opp.submissionDeadline).toLocaleDateString()}
                              {days !== null && ` (${days}d)`}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {opp.assignedTo ? techMap.get(opp.assignedTo) ?? 'Unknown' : '-'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {opp.winProbability !== null ? `${opp.winProbability}%` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-muted-foreground">
                        No opportunities found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl sm:max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Opportunity</DialogTitle>
            <DialogDescription>Add a new government contract opportunity to track.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Opportunity title" />
            </div>
            <div>
              <Label>Agency *</Label>
              <Input value={form.agency} onChange={e => setForm(f => ({ ...f, agency: e.target.value }))} placeholder="e.g. Department of Defense" />
            </div>
            <div>
              <Label>Agency Type</Label>
              <Select value={form.agencyType} onValueChange={v => setForm(f => ({ ...f, agencyType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="federal">Federal</SelectItem>
                  <SelectItem value="state">State</SelectItem>
                  <SelectItem value="county">County</SelectItem>
                  <SelectItem value="city">City</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Source</Label>
              <Input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="e.g. SAM.gov, GovWin" />
            </div>
            <div>
              <Label>NAICS Codes</Label>
              <Input value={form.naicsCodes} onChange={e => setForm(f => ({ ...f, naicsCodes: e.target.value }))} placeholder="e.g. 541512, 541519" />
            </div>
            <div>
              <Label>Set-Aside Type</Label>
              <Select value={form.setAsideType || '_none'} onValueChange={v => setForm(f => ({ ...f, setAsideType: v === '_none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Select set-aside" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  <SelectItem value="small_business">Small Business</SelectItem>
                  <SelectItem value="8a">8(a)</SelectItem>
                  <SelectItem value="hubzone">HUBZone</SelectItem>
                  <SelectItem value="sdvosb">SDVOSB</SelectItem>
                  <SelectItem value="wosb">WOSB</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estimated Value ($)</Label>
              <Input
                type="number"
                value={form.estimatedValueCents ? (form.estimatedValueCents / 100).toString() : ''}
                onChange={e => setForm(f => ({ ...f, estimatedValueCents: Math.round(parseFloat(e.target.value || '0') * 100) }))}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Contract Type</Label>
              <Select value={form.contractType || '_none'} onValueChange={v => setForm(f => ({ ...f, contractType: v === '_none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Select type</SelectItem>
                  <SelectItem value="firm_fixed_price">Firm Fixed Price</SelectItem>
                  <SelectItem value="time_and_materials">Time & Materials</SelectItem>
                  <SelectItem value="cost_plus">Cost Plus</SelectItem>
                  <SelectItem value="idiq">IDIQ</SelectItem>
                  <SelectItem value="bpa">BPA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Submission Deadline</Label>
              <Input type="datetime-local" value={form.submissionDeadline} onChange={e => setForm(f => ({ ...f, submissionDeadline: e.target.value }))} />
            </div>
            <div>
              <Label>Question Deadline</Label>
              <Input type="datetime-local" value={form.questionDeadline} onChange={e => setForm(f => ({ ...f, questionDeadline: e.target.value }))} />
            </div>
            <div>
              <Label>Contact Name</Label>
              <Input value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} placeholder="Point of contact" />
            </div>
            <div>
              <Label>Contact Email</Label>
              <Input type="email" value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} placeholder="email@agency.gov" />
            </div>
            <div>
              <Label>Contact Phone</Label>
              <Input value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} placeholder="(555) 123-4567" />
            </div>
            <div>
              <Label>Tags</Label>
              <Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="Comma separated tags" />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px] resize-y"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Additional notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !form.title || !form.agency}>
              {creating ? 'Creating...' : 'Create Opportunity'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Paste RFP Dialog */}
      <Dialog open={pasteOpen} onOpenChange={(open) => { setPasteOpen(open); if (!open) { setRfpText(''); setPasteResult(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Create Opportunity from RFP
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste the full RFP/solicitation text below. River will automatically extract the opportunity details, analyze requirements, generate a compliance checklist, and calculate your win probability.
            </p>
            <textarea
              rows={12}
              value={rfpText}
              onChange={e => setRfpText(e.target.value)}
              placeholder="Paste the full RFP, solicitation, or bid document text here..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y font-mono"
              disabled={pasting}
            />
            {pasteResult && (
              <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm p-3 rounded-md border border-green-200 dark:border-green-800">
                {pasteResult}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPasteOpen(false)} disabled={pasting}>Cancel</Button>
              <Button disabled={pasting || rfpText.length < 50} onClick={async () => {
                setPasting(true);
                setPasteResult(null);
                try {
                  const res = await api<{ opportunity: { id: string; title: string }; complianceItems: number; winProbability: { score: number } }>('/gov/opportunities/from-rfp', {
                    method: 'POST',
                    body: JSON.stringify({ text: rfpText }),
                  });
                  setPasteResult(`Created: "${res.opportunity.title}" — ${res.complianceItems} compliance items generated, ${res.winProbability.score}% win probability`);
                  fetchOpportunities();
                  setTimeout(() => {
                    setPasteOpen(false);
                    setRfpText('');
                    setPasteResult(null);
                    if (onNavigate) onNavigate(`/gov/opportunities/${res.opportunity.id}`);
                  }, 2000);
                } catch (err: any) {
                  setPasteResult(`Error: ${err.message || 'Failed to process RFP'}`);
                } finally {
                  setPasting(false);
                }
              }}>
                {pasting ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Analyzing...</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-1" />Create from RFP</>
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
