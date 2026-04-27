import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Pencil,
  Play,
  Pause,
  Zap,
  Clock,
  Calendar,
  ChevronDown,
  ChevronRight,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Copy,
  Download,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkflowRule {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  trigger: string;
  ruleType: 'instant' | 'timed' | 'scheduled';
  category: string;
  conditions: ConditionGroup[];
  conditionsLogic: { operator: 'AND' | 'OR' };
  actions: RuleAction[];
  timeConfig: TimeConfig | null;
  exitConditions: ExitCondition[] | null;
  templateId: string | null;
  logEnabled: boolean;
  isTemplate: boolean;
  sortOrder: number;
  executionCount: number;
  lastExecutedAt: string | null;
}

interface ConditionGroup {
  operator: 'AND' | 'OR';
  conditions: Condition[];
}

interface Condition {
  field: string;
  operator: string;
  value: string;
}

interface RuleAction {
  type: string;
  params: Record<string, string>;
}

interface TimeConfig {
  delayMinutes: number;
  repeatEnabled: boolean;
  repeatIntervalMinutes: number;
  maxExecutionsPerTicket: number;
  businessHoursOnly: boolean;
  excludeWeekends: boolean;
}

interface ExitCondition {
  field: string;
  operator: string;
  value: string;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  trigger: string;
  ruleType: string;
  category: string;
}

interface ExecutionLog {
  id: string;
  executedAt: string;
  ticketNumber: number;
  matched: boolean;
  actionsRun: string[];
  success: boolean;
}

interface Tech {
  id: string;
  displayName: string;
}

interface Queue {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'customer_followup', label: 'Customer Followup' },
  { value: 'lifecycle', label: 'Lifecycle' },
  { value: 'sla', label: 'SLA' },
  { value: 'escalation', label: 'Escalation' },
  { value: 'operations', label: 'Operations' },
  { value: 'general', label: 'General' },
];

const CATEGORY_OPTIONS = CATEGORIES.filter((c) => c.value !== 'all');

const INSTANT_TRIGGERS = [
  { value: 'ticket_created', label: 'Ticket Created' },
  { value: 'ticket_updated', label: 'Ticket Updated' },
  { value: 'status_changed', label: 'Status Changed' },
  { value: 'priority_changed', label: 'Priority Changed' },
  { value: 'assigned_changed', label: 'Assigned Changed' },
  { value: 'customer_replied', label: 'Customer Replied' },
  { value: 'ticket_resolved', label: 'Ticket Resolved' },
  { value: 'ticket_closed', label: 'Ticket Closed' },
];

const TIMED_TRIGGERS = [
  { value: 'no_customer_response', label: 'No Customer Response' },
  { value: 'no_tech_update', label: 'No Tech Update' },
  { value: 'ticket_in_status', label: 'Ticket in Status' },
  { value: 'sla_warning', label: 'SLA Warning' },
  { value: 'sla_breach', label: 'SLA Breach' },
];

const SCHEDULED_TRIGGERS = [
  { value: 'scheduled_check', label: 'Scheduled Check' },
];

const TIMED_TRIGGER_VALUES = TIMED_TRIGGERS.map((t) => t.value);
const SCHEDULED_TRIGGER_VALUES = SCHEDULED_TRIGGERS.map((t) => t.value);

const TRIGGER_OPTIONS = [
  { group: 'Instant', items: INSTANT_TRIGGERS },
  { group: 'Timed', items: TIMED_TRIGGERS },
  { group: 'Scheduled', items: SCHEDULED_TRIGGERS },
];

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'waiting_on_customer', label: 'Waiting on Customer' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const CONDITION_FIELDS = [
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'customerId', label: 'Customer' },
  { value: 'queueId', label: 'Queue' },
  { value: 'assignedTo', label: 'Assigned To' },
  { value: 'ticketType', label: 'Ticket Type' },
  { value: 'source', label: 'Source' },
  { value: 'categoryId', label: 'Category' },
  { value: 'tags', label: 'Tags' },
  { value: 'slaPolicyId', label: 'SLA Policy' },
  { value: 'time_in_status_minutes', label: 'Time in Status (min)' },
  { value: 'last_customer_response_minutes', label: 'Last Customer Response (min)' },
  { value: 'open_for_minutes', label: 'Open For (min)' },
];

const CONDITION_OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'in', label: 'In' },
  { value: 'not_in', label: 'Not In' },
  { value: 'is_empty', label: 'Is Empty' },
  { value: 'is_not_empty', label: 'Is Not Empty' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
];

const ACTION_GROUPS = [
  {
    group: 'Update',
    items: [
      { value: 'set_status', label: 'Set Status' },
      { value: 'set_priority', label: 'Set Priority' },
      { value: 'set_queue', label: 'Set Queue' },
      { value: 'assign_to', label: 'Assign To' },
      { value: 'close_ticket', label: 'Close Ticket' },
      { value: 'reopen_ticket', label: 'Reopen Ticket' },
    ],
  },
  {
    group: 'Escalation',
    items: [{ value: 'escalate_ticket', label: 'Escalate Ticket' }],
  },
  {
    group: 'Tags',
    items: [
      { value: 'add_tag', label: 'Add Tag' },
      { value: 'remove_tag', label: 'Remove Tag' },
    ],
  },
  {
    group: 'Communication',
    items: [
      { value: 'add_internal_note', label: 'Add Internal Note' },
      { value: 'add_public_reply', label: 'Add Public Reply' },
      { value: 'send_notification', label: 'Send Notification' },
      { value: 'send_email_template', label: 'Send Email Template' },
      { value: 'send_customer_notification', label: 'Send Customer Notification' },
      { value: 'notify_manager', label: 'Notify Manager' },
    ],
  },
  {
    group: 'Advanced',
    items: [
      { value: 'create_follow_up_ticket', label: 'Create Follow-Up Ticket' },
      { value: 'webhook_call', label: 'Webhook Call' },
    ],
  },
  {
    group: 'SLA',
    items: [
      { value: 'pause_sla', label: 'Pause SLA' },
      { value: 'resume_sla', label: 'Resume SLA' },
    ],
  },
];

const ALL_ACTIONS = ACTION_GROUPS.flatMap((g) => g.items);

const TIME_UNITS = [
  { value: 'minutes', label: 'Minutes', multiplier: 1 },
  { value: 'hours', label: 'Hours', multiplier: 60 },
  { value: 'days', label: 'Days', multiplier: 1440 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function triggerLabel(trigger: string): string {
  const all = [...INSTANT_TRIGGERS, ...TIMED_TRIGGERS, ...SCHEDULED_TRIGGERS];
  return all.find((t) => t.value === trigger)?.label || trigger;
}

function categoryLabel(cat: string): string {
  return CATEGORIES.find((c) => c.value === cat)?.label || cat;
}

function ruleTypeFromTrigger(trigger: string): 'instant' | 'timed' | 'scheduled' {
  if (TIMED_TRIGGER_VALUES.includes(trigger)) return 'timed';
  if (SCHEDULED_TRIGGER_VALUES.includes(trigger)) return 'scheduled';
  return 'instant';
}

function minutesToUnit(minutes: number): { value: number; unit: string } {
  if (minutes > 0 && minutes % 1440 === 0) return { value: minutes / 1440, unit: 'days' };
  if (minutes > 0 && minutes % 60 === 0) return { value: minutes / 60, unit: 'hours' };
  return { value: minutes, unit: 'minutes' };
}

function unitToMinutes(value: number, unit: string): number {
  const u = TIME_UNITS.find((t) => t.value === unit);
  return value * (u?.multiplier ?? 1);
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function emptyRule(): Omit<WorkflowRule, 'id' | 'executionCount' | 'lastExecutedAt' | 'isTemplate' | 'sortOrder'> {
  return {
    name: '',
    description: '',
    isActive: true,
    trigger: 'ticket_created',
    ruleType: 'instant',
    category: 'general',
    conditions: [{ operator: 'AND', conditions: [] }],
    conditionsLogic: { operator: 'AND' },
    actions: [],
    timeConfig: null,
    exitConditions: null,
    templateId: null,
    logEnabled: true,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-input'}`}
    >
      <span
        className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  );
}

function RuleTypeBadge({ ruleType }: { ruleType: string }) {
  const config: Record<string, { className: string; icon: React.ReactNode; label: string }> = {
    instant: { className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', icon: <Zap className="mr-1 h-3 w-3" />, label: 'Instant' },
    timed: { className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300', icon: <Clock className="mr-1 h-3 w-3" />, label: 'Timed' },
    scheduled: { className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300', icon: <Calendar className="mr-1 h-3 w-3" />, label: 'Scheduled' },
  };
  const c = config[ruleType] || config.instant;
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${c.className}`}>
      {c.icon}
      {c.label}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  return <Badge variant="outline">{categoryLabel(category)}</Badge>;
}

// ---------------------------------------------------------------------------
// Condition Value Input
// ---------------------------------------------------------------------------

function ConditionValueInput({
  field,
  value,
  onChange,
  techs,
  queues,
}: {
  field: string;
  value: string;
  onChange: (v: string) => void;
  techs: Tech[];
  queues: Queue[];
}) {
  if (field === 'status') {
    return (
      <Combobox
        options={STATUS_OPTIONS}
        value={value}
        onValueChange={onChange}
        placeholder="Select status..."
      />
    );
  }
  if (field === 'priority') {
    return (
      <Combobox
        options={PRIORITY_OPTIONS}
        value={value}
        onValueChange={onChange}
        placeholder="Select priority..."
      />
    );
  }
  if (field === 'assignedTo') {
    return (
      <Combobox
        options={techs.map((t) => ({ value: t.id, label: t.displayName }))}
        value={value}
        onValueChange={onChange}
        placeholder="Select tech..."
      />
    );
  }
  if (field === 'queueId') {
    return (
      <Combobox
        options={queues.map((q) => ({ value: q.id, label: q.name }))}
        value={value}
        onValueChange={onChange}
        placeholder="Select queue..."
      />
    );
  }
  return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Value" />;
}

// ---------------------------------------------------------------------------
// Action Params Input
// ---------------------------------------------------------------------------

function ActionParamsInput({
  actionType,
  params,
  onChange,
  techs,
  queues,
}: {
  actionType: string;
  params: Record<string, string>;
  onChange: (params: Record<string, string>) => void;
  techs: Tech[];
  queues: Queue[];
}) {
  const set = (key: string, val: string) => onChange({ ...params, [key]: val });

  switch (actionType) {
    case 'set_status':
      return (
        <Combobox
          options={STATUS_OPTIONS}
          value={params.status || ''}
          onValueChange={(v) => set('status', v)}
          placeholder="Select status..."
        />
      );
    case 'set_priority':
      return (
        <Combobox
          options={PRIORITY_OPTIONS}
          value={params.priority || ''}
          onValueChange={(v) => set('priority', v)}
          placeholder="Select priority..."
        />
      );
    case 'set_queue':
      return (
        <Combobox
          options={queues.map((q) => ({ value: q.id, label: q.name }))}
          value={params.queueId || ''}
          onValueChange={(v) => set('queueId', v)}
          placeholder="Select queue..."
        />
      );
    case 'assign_to':
      return (
        <Combobox
          options={techs.map((t) => ({ value: t.id, label: t.displayName }))}
          value={params.techId || ''}
          onValueChange={(v) => set('techId', v)}
          placeholder="Select tech..."
        />
      );
    case 'add_tag':
    case 'remove_tag':
      return (
        <Input
          value={params.tag || ''}
          onChange={(e) => set('tag', e.target.value)}
          placeholder="Tag name"
        />
      );
    case 'add_internal_note':
    case 'add_public_reply':
      return (
        <textarea
          className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={params.message || ''}
          onChange={(e) => set('message', e.target.value)}
          placeholder="Message content..."
        />
      );
    case 'send_notification':
    case 'send_customer_notification':
    case 'notify_manager':
      return (
        <Input
          value={params.message || ''}
          onChange={(e) => set('message', e.target.value)}
          placeholder="Notification message"
        />
      );
    case 'send_email_template':
      return (
        <Input
          value={params.templateId || ''}
          onChange={(e) => set('templateId', e.target.value)}
          placeholder="Template ID"
        />
      );
    case 'create_follow_up_ticket':
      return (
        <Input
          value={params.subject || ''}
          onChange={(e) => set('subject', e.target.value)}
          placeholder="Follow-up ticket subject"
        />
      );
    case 'webhook_call':
      return (
        <Input
          value={params.url || ''}
          onChange={(e) => set('url', e.target.value)}
          placeholder="https://..."
        />
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Trigger Selector (grouped)
// ---------------------------------------------------------------------------

function TriggerSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const flatOptions = TRIGGER_OPTIONS.flatMap((g) =>
    g.items.map((item) => ({ value: item.value, label: `${g.group}: ${item.label}` })),
  );
  return (
    <Combobox
      options={flatOptions}
      value={value}
      onValueChange={onChange}
      placeholder="Select trigger..."
    />
  );
}

// ---------------------------------------------------------------------------
// Action Type Selector (grouped)
// ---------------------------------------------------------------------------

function ActionTypeSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const flatOptions = ACTION_GROUPS.flatMap((g) =>
    g.items.map((item) => ({ value: item.value, label: `${g.group}: ${item.label}` })),
  );
  return (
    <Combobox
      options={flatOptions}
      value={value}
      onValueChange={onChange}
      placeholder="Select action..."
    />
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export function WorkflowBuilderPage() {
  // View state
  const [view, setView] = useState<'list' | 'builder'>('list');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  // List view state
  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Builder state
  const [form, setForm] = useState(emptyRule());
  const [saving, setSaving] = useState(false);

  // Templates dialog
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [importingTemplate, setImportingTemplate] = useState<string | null>(null);

  // Execution log
  const [logExpanded, setLogExpanded] = useState(false);
  const [executionLog, setExecutionLog] = useState<ExecutionLog[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);

  // Reference data
  const [techs, setTechs] = useState<Tech[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<WorkflowRule[]>('/settings/workflow-rules');
      setRules(data);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReferenceData = useCallback(async () => {
    try {
      const [techData, queueData] = await Promise.all([
        api<Tech[]>('/dispatch/techs'),
        api<Queue[]>('/settings/ticket-queues'),
      ]);
      setTechs(techData);
      setQueues(queueData);
    } catch {
      // silently handle
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const data = await api<WorkflowTemplate[]>('/settings/workflow-templates');
      setTemplates(data);
    } catch {
      // silently handle
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  const fetchExecutionLog = useCallback(async (ruleId: string) => {
    setLoadingLog(true);
    try {
      const data = await api<ExecutionLog[]>(`/settings/workflow-rules/${ruleId}/log`);
      setExecutionLog(data);
    } catch {
      // silently handle
    } finally {
      setLoadingLog(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchReferenceData();
  }, [fetchRules, fetchReferenceData]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const toggleActive = async (rule: WorkflowRule) => {
    try {
      await api(`/settings/workflow-rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isActive: !r.isActive } : r)),
      );
    } catch {
      // silently handle
    }
  };

  const deleteRule = async (ruleId: string) => {
    try {
      await api(`/settings/workflow-rules/${ruleId}`, { method: 'DELETE' });
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch {
      // silently handle
    }
  };

  const importTemplate = async (templateId: string) => {
    setImportingTemplate(templateId);
    try {
      await api('/settings/workflow-rules/import-template', {
        method: 'POST',
        body: JSON.stringify({ templateId }),
      });
      await fetchRules();
      setShowTemplates(false);
    } catch {
      // silently handle
    } finally {
      setImportingTemplate(null);
    }
  };

  const openBuilder = (rule?: WorkflowRule) => {
    if (rule) {
      setEditingRuleId(rule.id);
      setForm({
        name: rule.name,
        description: rule.description,
        isActive: rule.isActive,
        trigger: rule.trigger,
        ruleType: rule.ruleType,
        category: rule.category,
        conditions: rule.conditions?.length
          ? rule.conditions
          : [{ operator: 'AND', conditions: [] }],
        conditionsLogic: rule.conditionsLogic || { operator: 'AND' },
        actions: rule.actions || [],
        timeConfig: rule.timeConfig,
        exitConditions: rule.exitConditions,
        templateId: rule.templateId,
        logEnabled: rule.logEnabled,
      });
      setLogExpanded(false);
      setExecutionLog([]);
    } else {
      setEditingRuleId(null);
      setForm(emptyRule());
    }
    setView('builder');
  };

  const saveRule = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        isActive: form.isActive,
        trigger: form.trigger,
        ruleType: form.ruleType,
        category: form.category,
        conditions: form.conditions,
        conditionsLogic: form.conditionsLogic,
        actions: form.actions,
        timeConfig: form.ruleType !== 'instant' ? form.timeConfig : null,
        exitConditions: form.ruleType === 'timed' ? form.exitConditions : null,
        logEnabled: form.logEnabled,
      };

      if (editingRuleId) {
        await api(`/settings/workflow-rules/${editingRuleId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await api('/settings/workflow-rules', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      await fetchRules();
      setView('list');
    } catch {
      // silently handle
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------------------
  // Form helpers
  // -------------------------------------------------------------------------

  const updateForm = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleTriggerChange = (trigger: string) => {
    const ruleType = ruleTypeFromTrigger(trigger);
    setForm((prev) => ({
      ...prev,
      trigger,
      ruleType,
      timeConfig:
        ruleType !== 'instant' && !prev.timeConfig
          ? {
              delayMinutes: 60,
              repeatEnabled: false,
              repeatIntervalMinutes: 60,
              maxExecutionsPerTicket: 1,
              businessHoursOnly: false,
              excludeWeekends: false,
            }
          : prev.timeConfig,
      exitConditions: ruleType === 'timed' && !prev.exitConditions ? [] : prev.exitConditions,
    }));
  };

  // Condition group helpers
  const addConditionGroup = () => {
    updateForm('conditions', [...form.conditions, { operator: 'AND', conditions: [] }]);
  };

  const updateConditionGroup = (groupIdx: number, group: ConditionGroup) => {
    const updated = [...form.conditions];
    updated[groupIdx] = group;
    updateForm('conditions', updated);
  };

  const removeConditionGroup = (groupIdx: number) => {
    updateForm(
      'conditions',
      form.conditions.filter((_, i) => i !== groupIdx),
    );
  };

  const addConditionToGroup = (groupIdx: number) => {
    const updated = [...form.conditions];
    updated[groupIdx] = {
      ...updated[groupIdx],
      conditions: [...updated[groupIdx].conditions, { field: 'status', operator: 'equals', value: '' }],
    };
    updateForm('conditions', updated);
  };

  const updateConditionInGroup = (groupIdx: number, condIdx: number, cond: Condition) => {
    const updated = [...form.conditions];
    const conditions = [...updated[groupIdx].conditions];
    conditions[condIdx] = cond;
    updated[groupIdx] = { ...updated[groupIdx], conditions };
    updateForm('conditions', updated);
  };

  const removeConditionFromGroup = (groupIdx: number, condIdx: number) => {
    const updated = [...form.conditions];
    updated[groupIdx] = {
      ...updated[groupIdx],
      conditions: updated[groupIdx].conditions.filter((_, i) => i !== condIdx),
    };
    updateForm('conditions', updated);
  };

  // Action helpers
  const addAction = () => {
    updateForm('actions', [...form.actions, { type: 'set_status', params: {} }]);
  };

  const updateAction = (idx: number, action: RuleAction) => {
    const updated = [...form.actions];
    updated[idx] = action;
    updateForm('actions', updated);
  };

  const removeAction = (idx: number) => {
    updateForm(
      'actions',
      form.actions.filter((_, i) => i !== idx),
    );
  };

  // Exit condition helpers
  const addExitCondition = () => {
    updateForm('exitConditions', [
      ...(form.exitConditions || []),
      { field: 'status', operator: 'equals', value: '' },
    ]);
  };

  const updateExitCondition = (idx: number, cond: ExitCondition) => {
    const updated = [...(form.exitConditions || [])];
    updated[idx] = cond;
    updateForm('exitConditions', updated);
  };

  const removeExitCondition = (idx: number) => {
    updateForm(
      'exitConditions',
      (form.exitConditions || []).filter((_, i) => i !== idx),
    );
  };

  // TimeConfig helpers
  const updateTimeConfig = <K extends keyof TimeConfig>(key: K, value: TimeConfig[K]) => {
    updateForm('timeConfig', { ...(form.timeConfig as TimeConfig), [key]: value });
  };

  // -------------------------------------------------------------------------
  // Filtered rules
  // -------------------------------------------------------------------------

  const filteredRules =
    categoryFilter === 'all' ? rules : rules.filter((r) => r.category === categoryFilter);

  // =========================================================================
  // RENDER: LIST VIEW
  // =========================================================================

  if (view === 'list') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Workflow Automation</h1>
            <p className="text-sm text-muted-foreground">
              Automate ticket actions based on triggers and conditions
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowTemplates(true);
                fetchTemplates();
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Import Template
            </Button>
            <Button onClick={() => openBuilder()}>
              <Plus className="mr-2 h-4 w-4" />
              New Rule
            </Button>
          </div>
        </div>

        {/* Category filter tabs */}
        <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                categoryFilter === cat.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Rules table */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filteredRules.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Zap className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-lg font-medium">No workflow rules found</p>
              <p className="text-sm text-muted-foreground">
                Create your first automation rule to get started
              </p>
              <Button className="mt-4" onClick={() => openBuilder()}>
                <Plus className="mr-2 h-4 w-4" />
                New Rule
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Trigger
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Category
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                    Active
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                    Executions
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Last Run
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRules.map((rule) => (
                  <tr key={rule.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{rule.name}</div>
                      {rule.description && (
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {rule.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">{triggerLabel(rule.trigger)}</td>
                    <td className="px-4 py-3">
                      <RuleTypeBadge ruleType={rule.ruleType} />
                    </td>
                    <td className="px-4 py-3">
                      <CategoryBadge category={rule.category} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ToggleSwitch
                        checked={rule.isActive}
                        onChange={() => toggleActive(rule)}
                      />
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums">
                      {rule.executionCount}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {rule.lastExecutedAt ? relativeTime(rule.lastExecutedAt) : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openBuilder(rule)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteRule(rule.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Templates dialog */}
        <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Import Workflow Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {loadingTemplates ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))
              ) : templates.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No templates available
                </p>
              ) : (
                templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{tpl.name}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {tpl.description}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <RuleTypeBadge ruleType={tpl.ruleType} />
                        <CategoryBadge category={tpl.category} />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={importingTemplate === tpl.id}
                      onClick={() => importTemplate(tpl.id)}
                    >
                      {importingTemplate === tpl.id ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Copy className="mr-1 h-3 w-3" />
                      )}
                      Import
                    </Button>
                  </div>
                ))
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTemplates(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // =========================================================================
  // RENDER: BUILDER VIEW
  // =========================================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setView('list')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            {editingRuleId ? 'Edit Rule' : 'New Rule'}
          </h1>
        </div>
        <Button onClick={saveRule} disabled={saving || !form.name.trim()}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save
        </Button>
      </div>

      {/* Card 1: Rule Info */}
      <Card>
        <CardHeader>
          <CardTitle>Rule Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => updateForm('name', e.target.value)}
                placeholder="Rule name"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Combobox
                options={CATEGORY_OPTIONS}
                value={form.category}
                onValueChange={(v) => updateForm('category', v)}
                placeholder="Select category..."
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => updateForm('description', e.target.value)}
              placeholder="Brief description of what this rule does"
            />
          </div>
          <div className="flex items-center gap-3">
            <Label>Active</Label>
            <ToggleSwitch
              checked={form.isActive}
              onChange={(v) => updateForm('isActive', v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Trigger */}
      <Card>
        <CardHeader>
          <CardTitle>Trigger</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Trigger Type</Label>
            <TriggerSelector value={form.trigger} onChange={handleTriggerChange} />
          </div>
          {form.ruleType !== 'instant' && (
            <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
              <Clock className="h-4 w-4 shrink-0" />
              This rule runs periodically based on the time configuration below
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card 3: Time Configuration (timed/scheduled only) */}
      {form.ruleType !== 'instant' && (
        <Card>
          <CardHeader>
            <CardTitle>Time Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Delay */}
            <div className="space-y-2">
              <Label>Delay</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  className="w-24"
                  value={
                    minutesToUnit(form.timeConfig?.delayMinutes || 0).value
                  }
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    const unit = minutesToUnit(form.timeConfig?.delayMinutes || 0).unit;
                    updateTimeConfig('delayMinutes', unitToMinutes(val, unit));
                  }}
                />
                <Combobox
                  options={TIME_UNITS.map((u) => ({ value: u.value, label: u.label }))}
                  value={minutesToUnit(form.timeConfig?.delayMinutes || 0).unit}
                  onValueChange={(unit) => {
                    const val = minutesToUnit(form.timeConfig?.delayMinutes || 0).value;
                    updateTimeConfig('delayMinutes', unitToMinutes(val, unit));
                  }}
                  className="w-32"
                />
              </div>
            </div>

            {/* Repeat */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Label>Repeat</Label>
                <ToggleSwitch
                  checked={form.timeConfig?.repeatEnabled || false}
                  onChange={(v) => updateTimeConfig('repeatEnabled', v)}
                />
              </div>
              {form.timeConfig?.repeatEnabled && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    className="w-24"
                    value={
                      minutesToUnit(form.timeConfig?.repeatIntervalMinutes || 60).value
                    }
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1;
                      const unit = minutesToUnit(
                        form.timeConfig?.repeatIntervalMinutes || 60,
                      ).unit;
                      updateTimeConfig('repeatIntervalMinutes', unitToMinutes(val, unit));
                    }}
                  />
                  <Combobox
                    options={TIME_UNITS.map((u) => ({ value: u.value, label: u.label }))}
                    value={minutesToUnit(form.timeConfig?.repeatIntervalMinutes || 60).unit}
                    onValueChange={(unit) => {
                      const val = minutesToUnit(
                        form.timeConfig?.repeatIntervalMinutes || 60,
                      ).value;
                      updateTimeConfig('repeatIntervalMinutes', unitToMinutes(val, unit));
                    }}
                    className="w-32"
                  />
                </div>
              )}
            </div>

            {/* Max executions per ticket */}
            <div className="space-y-2">
              <Label>Max Executions Per Ticket</Label>
              <Input
                type="number"
                min={1}
                className="w-24"
                value={form.timeConfig?.maxExecutionsPerTicket || 1}
                onChange={(e) =>
                  updateTimeConfig(
                    'maxExecutionsPerTicket',
                    parseInt(e.target.value) || 1,
                  )
                }
              />
            </div>

            {/* Business hours / weekends */}
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3">
                <Label>Business Hours Only</Label>
                <ToggleSwitch
                  checked={form.timeConfig?.businessHoursOnly || false}
                  onChange={(v) => updateTimeConfig('businessHoursOnly', v)}
                />
              </div>
              <div className="flex items-center gap-3">
                <Label>Exclude Weekends</Label>
                <ToggleSwitch
                  checked={form.timeConfig?.excludeWeekends || false}
                  onChange={(v) => updateTimeConfig('excludeWeekends', v)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Card 4: Conditions */}
      <Card>
        <CardHeader>
          <CardTitle>Conditions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Top-level AND/OR toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Match</span>
            <div className="inline-flex rounded-md border">
              <button
                type="button"
                onClick={() => updateForm('conditionsLogic', { operator: 'AND' })}
                className={`px-3 py-1 text-sm font-medium transition-colors ${
                  form.conditionsLogic.operator === 'AND'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                AND
              </button>
              <button
                type="button"
                onClick={() => updateForm('conditionsLogic', { operator: 'OR' })}
                className={`px-3 py-1 text-sm font-medium transition-colors ${
                  form.conditionsLogic.operator === 'OR'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                OR
              </button>
            </div>
            <span className="text-sm text-muted-foreground">of the following groups</span>
          </div>

          {/* Condition groups */}
          {form.conditions.map((group, groupIdx) => (
            <div key={groupIdx} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Group {groupIdx + 1}</span>
                  <div className="inline-flex rounded-md border">
                    <button
                      type="button"
                      onClick={() =>
                        updateConditionGroup(groupIdx, { ...group, operator: 'AND' })
                      }
                      className={`px-2 py-0.5 text-xs font-medium transition-colors ${
                        group.operator === 'AND'
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                    >
                      AND
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateConditionGroup(groupIdx, { ...group, operator: 'OR' })
                      }
                      className={`px-2 py-0.5 text-xs font-medium transition-colors ${
                        group.operator === 'OR'
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                    >
                      OR
                    </button>
                  </div>
                </div>
                {form.conditions.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeConditionGroup(groupIdx)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>

              {/* Condition rows */}
              {group.conditions.map((cond, condIdx) => (
                <div key={condIdx} className="flex items-start gap-2">
                  <div className="w-44 shrink-0">
                    <Combobox
                      options={CONDITION_FIELDS}
                      value={cond.field}
                      onValueChange={(v) =>
                        updateConditionInGroup(groupIdx, condIdx, {
                          ...cond,
                          field: v,
                          value: '',
                        })
                      }
                      placeholder="Field..."
                    />
                  </div>
                  <div className="w-36 shrink-0">
                    <Combobox
                      options={CONDITION_OPERATORS}
                      value={cond.operator}
                      onValueChange={(v) =>
                        updateConditionInGroup(groupIdx, condIdx, {
                          ...cond,
                          operator: v,
                        })
                      }
                      placeholder="Operator..."
                    />
                  </div>
                  {cond.operator !== 'is_empty' && cond.operator !== 'is_not_empty' && (
                    <div className="flex-1 min-w-0">
                      <ConditionValueInput
                        field={cond.field}
                        value={cond.value}
                        onChange={(v) =>
                          updateConditionInGroup(groupIdx, condIdx, {
                            ...cond,
                            value: v,
                          })
                        }
                        techs={techs}
                        queues={queues}
                      />
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => removeConditionFromGroup(groupIdx, condIdx)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={() => addConditionToGroup(groupIdx)}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Condition
              </Button>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addConditionGroup}>
            <Plus className="mr-1 h-3 w-3" />
            Add Group
          </Button>
        </CardContent>
      </Card>

      {/* Card 5: Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {form.actions.map((action, idx) => (
            <div key={idx} className="flex items-start gap-2 rounded-lg border p-3">
              <div className="w-52 shrink-0">
                <ActionTypeSelector
                  value={action.type}
                  onChange={(type) => updateAction(idx, { type, params: {} })}
                />
              </div>
              <div className="flex-1 min-w-0">
                <ActionParamsInput
                  actionType={action.type}
                  params={action.params}
                  onChange={(params) => updateAction(idx, { ...action, params })}
                  techs={techs}
                  queues={queues}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => removeAction(idx)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addAction}>
            <Plus className="mr-1 h-3 w-3" />
            Add Action
          </Button>
        </CardContent>
      </Card>

      {/* Card 6: Exit Conditions (timed rules only) */}
      {form.ruleType === 'timed' && (
        <Card>
          <CardHeader>
            <CardTitle>Exit Conditions</CardTitle>
            <p className="text-sm text-muted-foreground">
              If any of these match, stop executing this rule for the ticket
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {(form.exitConditions || []).map((cond, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <div className="w-44 shrink-0">
                  <Combobox
                    options={CONDITION_FIELDS}
                    value={cond.field}
                    onValueChange={(v) =>
                      updateExitCondition(idx, { ...cond, field: v, value: '' })
                    }
                    placeholder="Field..."
                  />
                </div>
                <div className="w-36 shrink-0">
                  <Combobox
                    options={CONDITION_OPERATORS}
                    value={cond.operator}
                    onValueChange={(v) =>
                      updateExitCondition(idx, { ...cond, operator: v })
                    }
                    placeholder="Operator..."
                  />
                </div>
                {cond.operator !== 'is_empty' && cond.operator !== 'is_not_empty' && (
                  <div className="flex-1 min-w-0">
                    <ConditionValueInput
                      field={cond.field}
                      value={cond.value}
                      onChange={(v) =>
                        updateExitCondition(idx, { ...cond, value: v })
                      }
                      techs={techs}
                      queues={queues}
                    />
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => removeExitCondition(idx)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}

            <Button variant="outline" size="sm" onClick={addExitCondition}>
              <Plus className="mr-1 h-3 w-3" />
              Add Exit Condition
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Card 7: Execution Log (existing rules only) */}
      {editingRuleId && (
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => {
              const next = !logExpanded;
              setLogExpanded(next);
              if (next && executionLog.length === 0) {
                fetchExecutionLog(editingRuleId);
              }
            }}
          >
            <div className="flex items-center justify-between">
              <CardTitle>Execution Log</CardTitle>
              {logExpanded ? (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          {logExpanded && (
            <CardContent>
              {loadingLog ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : executionLog.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No executions recorded yet
                </p>
              ) : (
                <div className="rounded-md border">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                          Timestamp
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                          Ticket #
                        </th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                          Matched
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                          Actions
                        </th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                          Result
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {executionLog.map((log) => (
                        <tr key={log.id} className="border-b last:border-b-0">
                          <td className="px-3 py-2 text-sm">
                            {relativeTime(log.executedAt)}
                          </td>
                          <td className="px-3 py-2 text-sm font-mono">
                            #{log.ticketNumber}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {log.matched ? (
                              <CheckCircle2 className="mx-auto h-4 w-4 text-green-600" />
                            ) : (
                              <XCircle className="mx-auto h-4 w-4 text-muted-foreground" />
                            )}
                          </td>
                          <td className="px-3 py-2 text-sm">
                            <div className="flex flex-wrap gap-1">
                              {log.actionsRun.map((a, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {ALL_ACTIONS.find((ac) => ac.value === a)?.label || a}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {log.success ? (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                Success
                              </Badge>
                            ) : (
                              <Badge variant="destructive">Failed</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
