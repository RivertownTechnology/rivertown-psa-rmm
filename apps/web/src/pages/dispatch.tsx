import { useEffect, useState, useCallback, useRef, type DragEvent, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Plus, X, GripVertical } from 'lucide-react';
import { Combobox } from '@/components/ui/combobox';

interface CalendarEvent {
  id: string; userId: string; ticketId: string | null;
  title: string; description: string | null;
  startAt: string; endAt: string; eventType: string;
}
interface Tech { id: string; displayName: string; email: string; }
interface Ticket { id: string; ticketNumber: number; subject: string; status: string; priority: string; customerId: string; createdAt: string; }

const HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 6AM-8PM
const PX_PER_HOUR = 60;
const HEADER_HEIGHT = 33;

function fmtDate(d: Date): string { return d.toISOString().split('T')[0]; }
function fmtDayHeader(d: Date): string { return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
function fmtHour(h: number): string { return h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`; }
function fmtTimeShort(s: string): string { return new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }

function getWeekDates(offset: number): Date[] {
  const now = new Date(); const day = now.getDay();
  const mon = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7); mon.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
}

function hourFromPx(px: number): number { return Math.max(6, Math.min(20, 6 + (px - HEADER_HEIGHT) / PX_PER_HOUR)); }
function snapToQuarter(h: number): number { return Math.round(h * 4) / 4; }

function timeFromHour(date: Date, hour: number): string {
  const h = Math.floor(hour); const m = Math.round((hour - h) * 60);
  return `${fmtDate(date)}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function fmtQuarterHour(h: number): string {
  const hr = Math.floor(h); const mn = Math.round((h - hr) * 60);
  const ampm = hr >= 12 ? 'PM' : 'AM'; const hr12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
  return `${hr12}:${String(mn).padStart(2, '0')} ${ampm}`;
}

const priorityColors: Record<string, string> = {
  critical: 'border-l-red-500 bg-red-100/80 dark:bg-red-950/40',
  high: 'border-l-orange-500 bg-orange-100/80 dark:bg-orange-950/40',
  medium: 'border-l-blue-500 bg-blue-100/80 dark:bg-blue-950/40',
  low: 'border-l-gray-400 bg-gray-100/80 dark:bg-gray-800/40',
};
const priorityBadge: Record<string, 'destructive' | 'default' | 'outline' | 'secondary'> = {
  critical: 'destructive', high: 'default', medium: 'outline', low: 'secondary',
};

export function DispatchPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'day'>('day');
  const [techs, setTechs] = useState<Tech[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [unassigned, setUnassigned] = useState<Ticket[]>([]);
  const [customers, setCustomers] = useState<Map<string, string>>(new Map());
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedForm, setSchedForm] = useState({ ticketId: '', userId: '', date: '', startTime: '09:00', endTime: '10:00' });
  const [saving, setSaving] = useState(false);

  // Interaction state
  const [interaction, setInteraction] = useState<{
    type: 'move' | 'resize-top' | 'resize-bottom';
    eventId: string; techId: string; startY: number;
    origStartHour: number; origEndHour: number;
  } | null>(null);
  const [preview, setPreview] = useState<{ startHour: number; endHour: number; techId: string } | null>(null);
  const techColRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const weekDays = getWeekDates(weekOffset);
  const todayStr = fmtDate(new Date());

  const loadData = useCallback(() => {
    const s = fmtDate(weekDays[0]); const e = fmtDate(weekDays[6]);
    Promise.all([
      api<Tech[]>('/dispatch/techs'),
      api<CalendarEvent[]>(`/dispatch/calendar?startDate=${s}&endDate=${e}`),
      api<Ticket[]>('/dispatch/unassigned'),
      api<{ data: Array<{ id: string; name: string }> }>('/customers?limit=100'),
    ]).then(([t, ev, u, c]) => { setTechs(t); setEvents(ev); setUnassigned(u); setCustomers(new Map(c.data.map(x => [x.id, x.name]))); }).catch(() => {});
  }, [weekOffset]);

  useEffect(() => { loadData(); const i = setInterval(loadData, 5000); return () => clearInterval(i); }, [loadData]);

  function eventsForTechDay(techId: string, day: Date) {
    const ds = fmtDate(day);
    return events.filter(e => e.userId === techId && e.startAt.startsWith(ds)).sort((a, b) => a.startAt.localeCompare(b.startAt));
  }

  function eventPos(evt: CalendarEvent) {
    const s = new Date(evt.startAt); const e = new Date(evt.endAt);
    const sh = s.getHours() + s.getMinutes() / 60; const eh = e.getHours() + e.getMinutes() / 60;
    return { top: (sh - 6) * PX_PER_HOUR + HEADER_HEIGHT, height: Math.max(15, (eh - sh) * PX_PER_HOUR), startHour: sh, endHour: eh };
  }

  // Mouse/touch interaction for move/resize
  function onEventMouseDown(e: ReactMouseEvent, type: 'move' | 'resize-top' | 'resize-bottom', evt: CalendarEvent) {
    e.preventDefault(); e.stopPropagation();
    const pos = eventPos(evt);
    setInteraction({ type, eventId: evt.id, techId: evt.userId, startY: e.clientY, origStartHour: pos.startHour, origEndHour: pos.endHour });
    setPreview({ startHour: pos.startHour, endHour: pos.endHour, techId: evt.userId });
  }

  function onEventTouchStart(e: ReactTouchEvent, type: 'move' | 'resize-top' | 'resize-bottom', evt: CalendarEvent) {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const pos = eventPos(evt);
    setInteraction({ type, eventId: evt.id, techId: evt.userId, startY: touch.clientY, origStartHour: pos.startHour, origEndHour: pos.endHour });
    setPreview({ startHour: pos.startHour, endHour: pos.endHour, techId: evt.userId });
  }

  function getTechAtX(clientX: number): string | null {
    for (const [techId, el] of techColRefs.current.entries()) {
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) return techId;
    }
    return null;
  }

  useEffect(() => {
    if (!interaction) return;

    function onMouseMove(e: globalThis.MouseEvent) {
      if (!interaction) return;
      const delta = (e.clientY - interaction.startY) / PX_PER_HOUR;
      let sh = interaction.origStartHour; let eh = interaction.origEndHour;

      if (interaction.type === 'move') { const dur = eh - sh; sh = snapToQuarter(sh + delta); eh = sh + dur; }
      else if (interaction.type === 'resize-top') { sh = snapToQuarter(sh + delta); if (sh >= eh - 0.25) sh = eh - 0.25; }
      else if (interaction.type === 'resize-bottom') { eh = snapToQuarter(eh + delta); if (eh <= sh + 0.25) eh = sh + 0.25; }

      sh = Math.max(6, Math.min(20, sh)); eh = Math.max(6, Math.min(20, eh));

      // Detect tech column for horizontal moves
      const hoveredTech = interaction.type === 'move' ? getTechAtX(e.clientX) : null;
      setPreview({ startHour: sh, endHour: eh, techId: hoveredTech ?? interaction.techId });
    }

    let moved = false;
    const origOnMouseMove = onMouseMove;
    function trackingMouseMove(e: globalThis.MouseEvent) {
      if (!moved && interaction && Math.abs(e.clientY - interaction.startY) > 3) moved = true;
      origOnMouseMove(e);
    }

    async function onMouseUp(e: globalThis.MouseEvent) {
      if (!interaction) { setInteraction(null); setPreview(null); return; }

      // If mouse didn't move, treat as click — navigate to ticket
      if (!moved && interaction.type === 'move') {
        const evt = events.find(ev => ev.id === interaction.eventId);
        if (evt?.ticketId) {
          setInteraction(null); setPreview(null);
          window.history.pushState(null, '', `/tickets/${evt.ticketId}`);
          window.dispatchEvent(new PopStateEvent('popstate'));
          return;
        }
      }

      if (!preview) { setInteraction(null); setPreview(null); return; }
      const evt = events.find(ev => ev.id === interaction.eventId);
      if (evt) {
        const startAt = timeFromHour(selectedDay, preview.startHour);
        const endAt = timeFromHour(selectedDay, preview.endHour);
        const payload: Record<string, string> = { startAt, endAt };
        // Reassign tech if moved to different column
        if (preview.techId !== evt.userId) payload.userId = preview.techId;
        await api(`/dispatch/schedule/${evt.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        loadData();
      }
      setInteraction(null); setPreview(null);
    }

    function onTouchMove(e: globalThis.TouchEvent) {
      if (!interaction || !e.touches[0]) return;
      const t = e.touches[0];
      if (!moved && Math.abs(t.clientY - interaction.startY) > 3) moved = true;
      if (moved) e.preventDefault(); // prevent scroll while dragging
      const delta = (t.clientY - interaction.startY) / PX_PER_HOUR;
      let sh = interaction.origStartHour; let eh = interaction.origEndHour;
      if (interaction.type === 'move') { const dur = eh - sh; sh = snapToQuarter(sh + delta); eh = sh + dur; }
      else if (interaction.type === 'resize-top') { sh = snapToQuarter(sh + delta); if (sh >= eh - 0.25) sh = eh - 0.25; }
      else if (interaction.type === 'resize-bottom') { eh = snapToQuarter(eh + delta); if (eh <= sh + 0.25) eh = sh + 0.25; }
      sh = Math.max(6, Math.min(20, sh)); eh = Math.max(6, Math.min(20, eh));
      const hoveredTech = interaction.type === 'move' ? getTechAtX(t.clientX) : null;
      setPreview({ startHour: sh, endHour: eh, techId: hoveredTech ?? interaction.techId });
    }

    function onTouchEnd() {
      onMouseUp({ clientY: 0, clientX: 0 } as globalThis.MouseEvent);
    }

    document.addEventListener('mousemove', trackingMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    return () => {
      document.removeEventListener('mousemove', trackingMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [interaction, preview, events, selectedDay, loadData]);

  async function scheduleTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!schedForm.ticketId || !schedForm.userId) return;
    setSaving(true);
    try {
      await api('/dispatch/schedule', { method: 'POST', body: JSON.stringify({ ticketId: schedForm.ticketId, userId: schedForm.userId, startAt: `${schedForm.date}T${schedForm.startTime}:00`, endAt: `${schedForm.date}T${schedForm.endTime}:00` }) });
      setShowSchedule(false); setSchedForm({ ticketId: '', userId: '', date: '', startTime: '09:00', endTime: '10:00' }); loadData();
    } finally { setSaving(false); }
  }

  async function removeEvent(eventId: string) { await api(`/dispatch/schedule/${eventId}`, { method: 'DELETE' }); loadData(); }

  function onDragOver(e: DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
  async function onDropSlot(e: DragEvent, techId: string, day: Date, hour: number) {
    e.preventDefault(); const ticketId = e.dataTransfer.getData('ticketId'); if (!ticketId) return;
    await api('/dispatch/schedule', { method: 'POST', body: JSON.stringify({ ticketId, userId: techId, startAt: timeFromHour(day, hour), endAt: timeFromHour(day, hour + 1) }) });
    loadData();
  }

  // Extract customer name from event description
  function getCustomerFromDesc(desc: string | null): string {
    if (!desc) return '';
    const m = desc.match(/^Customer: (.+?)(\n|$)/);
    return m ? m[1] : '';
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { if (viewMode === 'day') { const d = new Date(selectedDay); d.setDate(d.getDate() - 1); setSelectedDay(d); } else setWeekOffset(w => w - 1); }}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => { setSelectedDay(new Date()); setWeekOffset(0); }}>Today</Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { if (viewMode === 'day') { const d = new Date(selectedDay); d.setDate(d.getDate() + 1); setSelectedDay(d); } else setWeekOffset(w => w + 1); }}><ChevronRight className="h-4 w-4" /></Button>
            <span className="text-sm font-medium ml-2">{viewMode === 'day' ? fmtDayHeader(selectedDay) : `${fmtDayHeader(weekDays[0])} — ${fmtDayHeader(weekDays[6])}`}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border rounded-md overflow-hidden">
              <button className={`px-3 py-1 text-xs ${viewMode === 'day' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`} onClick={() => setViewMode('day')}>Day</button>
              <button className={`px-3 py-1 text-xs ${viewMode === 'week' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`} onClick={() => setViewMode('week')}>Week</button>
            </div>
            <Button size="sm" className="h-8" onClick={() => { setSchedForm(f => ({ ...f, date: fmtDate(selectedDay) })); setShowSchedule(true); }}><Plus className="h-3 w-3 mr-1" />Schedule</Button>
          </div>
        </div>

        {/* Day View */}
        {viewMode === 'day' && (
          <Card className="flex-1 overflow-hidden">
            <CardContent className="p-0 h-full overflow-y-auto">
              <div className="flex" style={{ userSelect: interaction ? 'none' : undefined }}>
                <div className="w-16 shrink-0 border-r bg-muted/30">
                  <div style={{ height: HEADER_HEIGHT }} className="border-b" />
                  {HOURS.map(h => (<div key={h} className="border-b px-2 py-1 text-xs text-muted-foreground" style={{ height: PX_PER_HOUR }}>{fmtHour(h)}</div>))}
                </div>
                <div className="flex flex-1 min-w-0">
                  {techs.map(tech => {
                    const dayEvents = eventsForTechDay(tech.id, selectedDay);
                    return (
                      <div key={tech.id} ref={el => { if (el) techColRefs.current.set(tech.id, el); }} className="flex-1 min-w-[160px] border-r last:border-r-0 relative">
                        <div className="sticky top-0 z-10 bg-muted/50 border-b px-2 text-center" style={{ height: HEADER_HEIGHT }}>
                          <div className="font-medium text-xs leading-[33px]">{tech.displayName}</div>
                        </div>
                        <div className="relative">
                          {HOURS.map(h => (
                            <div key={h} style={{ height: PX_PER_HOUR }} className="border-b border-dashed hover:bg-primary/5 transition-colors"
                              onDragOver={onDragOver} onDrop={e => onDropSlot(e, tech.id, selectedDay, h)} />
                          ))}
                          {/* Render events that belong to this tech OR are being dragged here */}
                          {(() => {
                            // Events native to this tech (hide if being moved away)
                            const nativeEvents = dayEvents.filter(evt => {
                              if (interaction?.eventId === evt.id && preview?.techId !== tech.id) return false;
                              return true;
                            });
                            // Ghost event being moved INTO this column from another tech
                            const ghostEvent = interaction && preview?.techId === tech.id && interaction.techId !== tech.id
                              ? events.find(e => e.id === interaction.eventId) : null;
                            const allToRender = [...nativeEvents, ...(ghostEvent ? [ghostEvent] : [])];

                            return allToRender.map(evt => {
                              const isInteracting = interaction?.eventId === evt.id;
                              const pos = eventPos(evt);
                              const displayTop = isInteracting && preview ? (preview.startHour - 6) * PX_PER_HOUR : pos.top - HEADER_HEIGHT;
                              const displayHeight = isInteracting && preview ? (preview.endHour - preview.startHour) * PX_PER_HOUR : pos.height;
                              const cust = getCustomerFromDesc(evt.description);
                              const isGhost = ghostEvent?.id === evt.id;

                              return (
                                <div key={evt.id + (isGhost ? '-ghost' : '')}
                                  className={`absolute left-1 right-1 rounded border-l-[3px] overflow-hidden text-xs select-none ${priorityColors['medium']} ${isInteracting ? 'opacity-70 z-20 shadow-lg ring-2 ring-primary/50' : 'z-10'} ${isGhost ? 'opacity-60 border-dashed' : ''}`}
                                  style={{ top: displayTop, height: Math.max(20, displayHeight) }}
                                >
                                  <div className="absolute top-0 left-0 right-0 h-3 cursor-n-resize hover:bg-black/10 z-10"
                                    onMouseDown={e => onEventMouseDown(e, 'resize-top', evt)}
                                    onTouchStart={e => onEventTouchStart(e, 'resize-top', evt)} />
                                  <div className="p-1.5 cursor-move h-full" onMouseDown={e => onEventMouseDown(e, 'move', evt)} onTouchStart={e => onEventTouchStart(e, 'move', evt)}>
                                    <div className="flex items-start justify-between">
                                      <div className="min-w-0 flex-1">
                                        <div className="font-semibold truncate">{evt.title}</div>
                                        {cust && <div className="text-muted-foreground truncate">{cust}</div>}
                                        <div className="text-muted-foreground">
                                          {isInteracting && preview ? `${fmtQuarterHour(preview.startHour)} - ${fmtQuarterHour(preview.endHour)}` : `${fmtTimeShort(evt.startAt)} - ${fmtTimeShort(evt.endAt)}`}
                                        </div>
                                      </div>
                                      {!isGhost && <button className="shrink-0 text-muted-foreground hover:text-destructive p-0.5" onClick={e => { e.stopPropagation(); removeEvent(evt.id); }}><X className="h-3 w-3" /></button>}
                                    </div>
                                  </div>
                                  <div className="absolute bottom-0 left-0 right-0 h-3 cursor-s-resize hover:bg-black/10 z-10"
                                    onMouseDown={e => onEventMouseDown(e, 'resize-bottom', evt)}
                                    onTouchStart={e => onEventTouchStart(e, 'resize-bottom', evt)} />
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    );
                  })}
                  {techs.length === 0 && <div className="flex-1 flex items-center justify-center text-muted-foreground p-8">No technicians</div>}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Week View */}
        {viewMode === 'week' && (
          <Card className="flex-1 overflow-hidden">
            <CardContent className="p-0 overflow-auto">
              <table className="w-full text-sm border-collapse">
                <thead><tr className="border-b bg-muted/50 sticky top-0 z-10">
                  <th className="text-left p-2 font-medium w-36 bg-muted/50">Tech</th>
                  {weekDays.map(d => (
                    <th key={fmtDate(d)} className={`text-center p-2 font-medium min-w-[130px] cursor-pointer hover:bg-primary/10 ${fmtDate(d) === todayStr ? 'bg-primary/10' : ''}`}
                      onClick={() => { setSelectedDay(d); setViewMode('day'); }}>{fmtDayHeader(d)}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {techs.map(tech => (
                    <tr key={tech.id} className="border-b">
                      <td className="p-2 bg-card sticky left-0"><div className="font-medium text-xs">{tech.displayName}</div></td>
                      {weekDays.map(day => {
                        const dayEvents = eventsForTechDay(tech.id, day);
                        return (
                          <td key={fmtDate(day)} className={`p-1 align-top ${fmtDate(day) === todayStr ? 'bg-primary/5' : ''}`}
                            onDragOver={onDragOver} onDrop={e => onDropSlot(e, tech.id, day, 9)}>
                            <div className="space-y-1 min-h-[50px]">
                              {dayEvents.map(evt => {
                                const cust = getCustomerFromDesc(evt.description);
                                return (
                                  <div key={evt.id} className={`p-1 rounded text-xs border-l-2 group ${priorityColors['medium']}`}>
                                    <div className="font-medium truncate">{evt.title}</div>
                                    {cust && <div className="text-muted-foreground truncate">{cust}</div>}
                                    <div className="text-muted-foreground">{fmtTimeShort(evt.startAt)} - {fmtTimeShort(evt.endAt)}</div>
                                    <button className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive float-right -mt-8" onClick={() => removeEvent(evt.id)}><X className="h-3 w-3" /></button>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right sidebar — Unassigned queue */}
      <div className="w-72 shrink-0 flex flex-col">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="pb-2 shrink-0"><CardTitle className="text-sm">Unassigned ({unassigned.length})</CardTitle></CardHeader>
          <CardContent className="p-2 flex-1 overflow-y-auto space-y-1.5">
            {unassigned.map(t => (
              <div key={t.id} draggable onDragStart={e => { e.dataTransfer.setData('ticketId', t.id); e.dataTransfer.effectAllowed = 'move'; }}
                onClick={() => { setSchedForm(f => ({ ...f, ticketId: t.id, date: fmtDate(selectedDay) })); setShowSchedule(true); }}
                className="p-2 rounded-md border bg-card hover:bg-muted/50 cursor-grab active:cursor-grabbing text-xs space-y-1 select-none">
                <div className="flex items-center gap-1">
                  <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">#{t.ticketNumber}</span>
                  <Badge variant={priorityBadge[t.priority] ?? 'outline'} className="text-[10px] px-1 py-0">{t.priority}</Badge>
                </div>
                <div className="font-medium truncate pl-4">{t.subject}</div>
                <div className="text-muted-foreground pl-4">{customers.get(t.customerId) ?? ''}</div>
              </div>
            ))}
            {unassigned.length === 0 && <div className="text-center text-muted-foreground py-6 text-xs">All tickets assigned</div>}
          </CardContent>
        </Card>
      </div>

      {/* Schedule Dialog */}
      <Dialog open={showSchedule} onOpenChange={setShowSchedule}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule Ticket</DialogTitle></DialogHeader>
          <form onSubmit={scheduleTicket} className="space-y-4">
            <div className="space-y-2"><Label>Ticket</Label>
              <Combobox
                options={unassigned.map(t => ({value: t.id, label: `#${t.ticketNumber} — ${t.subject}`}))}
                value={schedForm.ticketId}
                onValueChange={(v) => setSchedForm({ ...schedForm, ticketId: v })}
                placeholder="Select ticket..."
              />
            </div>
            <div className="space-y-2"><Label>Technician</Label>
              <Combobox
                options={techs.map(t => ({value: t.id, label: t.displayName}))}
                value={schedForm.userId}
                onValueChange={(v) => setSchedForm({ ...schedForm, userId: v })}
                placeholder="Select tech..."
              />
            </div>
            <div className="space-y-2"><Label>Date</Label><Input type="date" required value={schedForm.date} onChange={e => setSchedForm({ ...schedForm, date: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Start</Label><Input type="time" required value={schedForm.startTime} onChange={e => setSchedForm({ ...schedForm, startTime: e.target.value })} /></div>
              <div className="space-y-2"><Label>End</Label><Input type="time" required value={schedForm.endTime} onChange={e => setSchedForm({ ...schedForm, endTime: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowSchedule(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Scheduling...' : 'Schedule'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
