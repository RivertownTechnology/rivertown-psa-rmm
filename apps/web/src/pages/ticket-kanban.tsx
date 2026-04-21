import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TicketRow {
  id: string;
  ticketNumber: number;
  subject: string;
  status: string;
  priority: string;
  customerId: string;
  assignedTo: string | null;
}

interface Customer { id: string; name: string }
interface Tech { id: string; displayName: string }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLUMNS: { status: string; label: string }[] = [
  { status: 'new', label: 'New' },
  { status: 'open', label: 'Open' },
  { status: 'pending', label: 'Pending' },
  { status: 'waiting_on_customer', label: 'Waiting' },
  { status: 'scheduled', label: 'Scheduled' },
  { status: 'resolved', label: 'Resolved' },
];

const PRIORITY_DOT: Record<string, string> = {
  low: 'bg-gray-400',
  medium: 'bg-blue-500',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
};

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TicketKanbanPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all non-closed tickets
      const params = new URLSearchParams({ limit: '500' });
      const statuses = COLUMNS.map(c => c.status).join(',');
      params.set('status', statuses);
      const res = await api<{ data: TicketRow[] }>(`/tickets?${params}`);
      setTickets(res.data);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
    api<{ data: Customer[] }>('/customers?limit=200').then(d => setCustomers(d.data)).catch(() => {});
    api<Tech[]>('/dispatch/techs').then(setTechs).catch(() => {});
  }, [fetchTickets]);

  // ---------------------------------------------------------------------------
  // Lookup maps
  // ---------------------------------------------------------------------------

  const customerMap = new Map(customers.map(c => [c.id, c.name]));
  const techMap = new Map(techs.map(t => [t.id, t.displayName]));

  // ---------------------------------------------------------------------------
  // Filter tickets
  // ---------------------------------------------------------------------------

  const filtered = tickets.filter(t => {
    if (assigneeFilter && t.assignedTo !== assigneeFilter) return false;
    if (customerFilter && t.customerId !== customerFilter) return false;
    if (priorityFilter && t.priority !== priorityFilter) return false;
    return true;
  });

  // Group by status
  const columns = COLUMNS.map(col => ({
    ...col,
    tickets: filtered.filter(t => t.status === col.status),
  }));

  // ---------------------------------------------------------------------------
  // Drag and drop handler
  // ---------------------------------------------------------------------------

  async function handleDragEnd(result: DropResult) {
    const { draggableId, destination } = result;
    if (!destination) return;

    const newStatus = destination.droppableId;
    const ticket = tickets.find(t => t.id === draggableId);
    if (!ticket || ticket.status === newStatus) return;

    // Optimistic update
    setTickets(prev => prev.map(t => t.id === draggableId ? { ...t, status: newStatus } : t));

    try {
      await api(`/tickets/${draggableId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      // Revert on error
      fetchTickets();
    }
  }

  // ---------------------------------------------------------------------------
  // Initials helper
  // ---------------------------------------------------------------------------

  function getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const techOptions = [
    { value: '', label: 'All Assignees' },
    ...techs.map(t => ({ value: t.id, label: t.displayName })),
  ];

  const customerOptions = [
    { value: '', label: 'All Customers' },
    ...customers.map(c => ({ value: c.id, label: c.name })),
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-40" />
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

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Combobox
          options={techOptions}
          value={assigneeFilter}
          onValueChange={setAssigneeFilter}
          placeholder="Assignee..."
          className="w-44"
        />
        <Combobox
          options={customerOptions}
          value={customerFilter}
          onValueChange={setCustomerFilter}
          placeholder="Customer..."
          className="w-44"
        />
        <Combobox
          options={PRIORITY_OPTIONS}
          value={priorityFilter}
          onValueChange={setPriorityFilter}
          placeholder="Priority..."
          className="w-40"
        />
        <div className="text-sm text-muted-foreground ml-2">
          {filtered.length} ticket{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Kanban board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 220px)' }}>
          {columns.map(col => (
            <div key={col.status} className="w-72 shrink-0 flex flex-col">
              {/* Column header */}
              <div className="flex items-center justify-between px-2 py-2 rounded-t-lg bg-muted">
                <span className="text-sm font-medium">{col.label}</span>
                <span className="text-xs text-muted-foreground bg-background rounded-full px-2 py-0.5">
                  {col.tickets.length}
                </span>
              </div>

              {/* Droppable area */}
              <Droppable droppableId={col.status}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 p-1.5 space-y-1.5 rounded-b-lg border border-t-0 transition-colors min-h-[100px] ${
                      snapshot.isDraggingOver ? 'bg-primary/5' : 'bg-muted/30'
                    }`}
                  >
                    {col.tickets.map((ticket, index) => (
                      <Draggable key={ticket.id} draggableId={ticket.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`rounded-md border bg-card p-2.5 shadow-sm transition-shadow ${
                              snapshot.isDragging ? 'shadow-lg ring-2 ring-primary/20' : ''
                            }`}
                          >
                            {/* Ticket number + priority dot */}
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${PRIORITY_DOT[ticket.priority] ?? 'bg-gray-400'}`} />
                              <span className="text-[10px] text-muted-foreground font-mono">#{ticket.ticketNumber}</span>
                            </div>
                            {/* Subject */}
                            <div className="text-sm font-medium truncate mb-1.5" title={ticket.subject}>
                              {ticket.subject}
                            </div>
                            {/* Footer: customer + assignee */}
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-muted-foreground truncate max-w-[60%]">
                                {customerMap.get(ticket.customerId) ?? 'Unknown'}
                              </span>
                              {ticket.assignedTo && techMap.get(ticket.assignedTo) ? (
                                <div
                                  className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px] font-medium shrink-0"
                                  title={techMap.get(ticket.assignedTo)}
                                >
                                  {getInitials(techMap.get(ticket.assignedTo)!)}
                                </div>
                              ) : (
                                <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[9px] text-muted-foreground shrink-0" title="Unassigned">
                                  --
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
