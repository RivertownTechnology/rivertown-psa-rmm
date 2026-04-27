import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Save,
  Plus,
  Trash2,
  Loader2,
  ChevronUp,
  ChevronDown,
  Eye,
  RotateCcw,
  AlertTriangle,
  Lightbulb,
} from 'lucide-react';
import { useToast } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';

interface TemplateSection {
  title: string;
  instructions: string;
  order: number;
}

const DEFAULT_SECTIONS: TemplateSection[] = [
  { title: 'Executive Summary', instructions: '', order: 1 },
  { title: 'Technical Approach', instructions: '', order: 2 },
  { title: 'Past Performance', instructions: '', order: 3 },
  { title: 'Staffing Plan', instructions: '', order: 4 },
  { title: 'SLA Matrix', instructions: '', order: 5 },
  { title: 'Pricing Narrative', instructions: '', order: 6 },
  { title: 'Compliance Matrix', instructions: '', order: 7 },
];

const COMPANY_PROFILE_MAX = 2000;

export function GovSettingsPage() {
  const [sections, setSections] = useState<TemplateSection[]>([]);
  const [companyProfile, setCompanyProfile] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    () => new Set(),
  );

  // Track clean/saved state for dirty detection
  const savedStateRef = useRef<{
    sections: TemplateSection[];
    companyProfile: string;
  }>({ sections: [], companyProfile: '' });

  const toast = useToast();
  const { confirm } = useConfirm();

  const isDirty = useCallback(() => {
    const saved = savedStateRef.current;
    if (companyProfile !== saved.companyProfile) return true;
    if (sections.length !== saved.sections.length) return true;
    for (let i = 0; i < sections.length; i++) {
      const a = sections[i];
      const b = saved.sections[i];
      if (
        a.title !== b.title ||
        a.instructions !== b.instructions ||
        a.order !== b.order
      )
        return true;
    }
    return false;
  }, [sections, companyProfile]);

  const dirty = isDirty();

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty()) {
        e.preventDefault();
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    api<{ sections: TemplateSection[]; companyProfile: string }>(
      '/gov/proposal-template',
    )
      .then((data) => {
        const loadedSections = data.sections || [];
        const loadedProfile = data.companyProfile || '';
        setSections(loadedSections);
        setCompanyProfile(loadedProfile);
        savedStateRef.current = {
          sections: loadedSections.map((s) => ({ ...s })),
          companyProfile: loadedProfile,
        };
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true);
    try {
      await api('/gov/proposal-template', {
        method: 'PUT',
        body: JSON.stringify({ sections, companyProfile }),
      });
      savedStateRef.current = {
        sections: sections.map((s) => ({ ...s })),
        companyProfile,
      };
      toast.success('Template saved', 'Your proposal template has been updated.');
    } catch {
      toast.error('Save failed', 'Could not save the template. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function addSection() {
    setSections([
      ...sections,
      { title: '', instructions: '', order: sections.length + 1 },
    ]);
    // Auto-expand the new section
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.add(sections.length);
      return next;
    });
  }

  function removeSection(index: number) {
    const updated = sections
      .filter((_, i) => i !== index)
      .map((s, i) => ({ ...s, order: i + 1 }));
    setSections(updated);
    setExpandedSections((prev) => {
      const next = new Set<number>();
      for (const idx of prev) {
        if (idx < index) next.add(idx);
        else if (idx > index) next.add(idx - 1);
      }
      return next;
    });
  }

  function moveSection(from: number, to: number) {
    if (to < 0 || to >= sections.length) return;
    const updated = [...sections];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);
    setSections(updated.map((s, i) => ({ ...s, order: i + 1 })));
    // Keep expanded state following the moved section
    setExpandedSections((prev) => {
      const next = new Set<number>();
      for (const idx of prev) {
        if (idx === from) {
          next.add(to);
        } else if (from < to) {
          next.add(idx >= from && idx <= to ? idx - 1 : idx);
        } else {
          next.add(idx <= from && idx >= to ? idx + 1 : idx);
        }
      }
      return next;
    });
  }

  function toggleExpanded(index: number) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function resetToDefaults() {
    const ok = await confirm({
      title: 'Reset to Defaults',
      description:
        'This will replace all current sections with the 7 default sections (Executive Summary, Technical Approach, Past Performance, Staffing Plan, SLA Matrix, Pricing Narrative, Compliance Matrix). Any custom sections and instructions will be lost.',
      confirmLabel: 'Reset Sections',
      variant: 'destructive',
    });
    if (ok) {
      setSections(DEFAULT_SECTIONS.map((s) => ({ ...s })));
      setExpandedSections(new Set());
    }
  }

  if (!loaded) {
    return (
      <div className="text-center py-12 text-muted-foreground">Loading...</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Proposal Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your default proposal template and company information used
          in AI generation
        </p>
      </div>

      {/* Unsaved Changes Banner */}
      {dirty && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-950/30 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <span className="text-sm text-amber-400 flex-1">
            You have unsaved changes
          </span>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5 mr-1" />
                Save
              </>
            )}
          </Button>
        </div>
      )}

      {/* Company Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This information is included in every AI-generated proposal section.
            Describe your company, certifications, key differentiators, and
            anything the AI should always know about your organization.
          </p>

          {/* Tips Collapsible */}
          <button
            type="button"
            onClick={() => setTipsOpen(!tipsOpen)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Lightbulb className="h-4 w-4" />
            <span className="font-medium">Tips for a strong profile</span>
            {tipsOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          {tipsOpen && (
            <ul className="text-sm text-muted-foreground list-disc pl-9 space-y-1">
              <li>Include your company name, location, and years in business</li>
              <li>
                List relevant certifications (CJIS, SOC 2, FedRAMP, ISO 27001)
              </li>
              <li>Mention key partnerships (Microsoft, Dell, Cisco, etc.)</li>
              <li>
                Highlight differentiators: 24/7 NOC, SDVOSB status, SAM.gov
                registration
              </li>
              <li>
                Include average client retention and notable public-sector clients
              </li>
              <li>
                Describe core competencies: cybersecurity, cloud migration,
                compliance
              </li>
            </ul>
          )}

          <textarea
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[160px] resize-y"
            value={companyProfile}
            onChange={(e) => setCompanyProfile(e.target.value)}
            maxLength={COMPANY_PROFILE_MAX}
            placeholder={`Example:
Rivertown Technology Group is a Managed Service Provider based in South Carolina serving municipal governments, public safety agencies, and small businesses.

Key facts:
- CJIS certified technical staff
- 10+ years serving municipal IT environments
- Microsoft Partner, Dell Preferred Partner
- 24/7 NOC and SOC monitoring
- Expertise: Windows Server, VMware, Microsoft 365, CJIS compliance, cybersecurity
- SAM.gov registered, SDVOSB (if applicable)
- Average client retention: 5+ years`}
          />
          <div className="text-xs text-muted-foreground text-right">
            {companyProfile.length} / {COMPANY_PROFILE_MAX} characters
          </div>
        </CardContent>
      </Card>

      {/* Default Proposal Sections */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Default Proposal Sections
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={resetToDefaults}>
                <RotateCcw className="h-4 w-4 mr-1" /> Reset to Defaults
              </Button>
              <Button variant="outline" size="sm" onClick={addSection}>
                <Plus className="h-4 w-4 mr-1" /> Add Section
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Define the sections that appear in new proposals. The AI instructions
            tell the AI what to write for each section. Click a section to
            expand and edit its instructions.
          </p>

          {sections.map((section, i) => {
            const isExpanded = expandedSections.has(i);
            return (
              <div
                key={i}
                className="rounded-lg border overflow-hidden"
              >
                {/* Collapsed header row */}
                <div className="flex items-center gap-2 px-4 py-3">
                  {/* Reorder buttons */}
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveSection(i, i - 1)}
                      disabled={i === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5 rounded hover:bg-muted transition-colors"
                      title="Move up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(i, i + 1)}
                      disabled={i === sections.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5 rounded hover:bg-muted transition-colors"
                      title="Move down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Section number */}
                  <span className="text-xs text-muted-foreground font-mono w-6 shrink-0">
                    {i + 1}.
                  </span>

                  {/* Clickable title area */}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(i)}
                    className="flex-1 text-left text-sm font-medium truncate hover:text-foreground transition-colors"
                  >
                    {section.title || (
                      <span className="text-muted-foreground italic">
                        Untitled section
                      </span>
                    )}
                  </button>

                  {/* Instruction indicator */}
                  {section.instructions && !isExpanded && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {section.instructions.length} chars
                    </span>
                  )}

                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSection(i)}
                    className="text-destructive hover:text-destructive shrink-0 h-7 w-7 p-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>

                  {/* Expand toggle */}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(i)}
                    className="text-muted-foreground hover:text-foreground p-0.5 shrink-0"
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 space-y-3 border-t bg-muted/30">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Section Title
                      </Label>
                      <Input
                        value={section.title}
                        onChange={(e) => {
                          const updated = [...sections];
                          updated[i] = { ...updated[i], title: e.target.value };
                          setSections(updated);
                        }}
                        placeholder="Section title (e.g. Executive Summary)"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        AI Instructions
                      </Label>
                      <textarea
                        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[100px] resize-y"
                        value={section.instructions}
                        onChange={(e) => {
                          const updated = [...sections];
                          updated[i] = {
                            ...updated[i],
                            instructions: e.target.value,
                          };
                          setSections(updated);
                        }}
                        placeholder="Tell the AI what to include in this section..."
                      />
                      <div className="text-xs text-muted-foreground text-right">
                        {section.instructions.length} characters
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {sections.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>
                No sections configured. Click &quot;Add Section&quot; to get
                started, or use &quot;Reset to Defaults&quot; for the standard
                template.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-1" /> Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-1" /> Save Template
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => setPreviewOpen(true)}
          disabled={sections.length === 0}
        >
          <Eye className="h-4 w-4 mr-1" /> Preview
        </Button>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Proposal Template Preview</DialogTitle>
            <DialogDescription>
              Table of contents that will appear in generated proposals
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 py-2">
            {sections.map((section, i) => (
              <div key={i} className="flex items-baseline gap-3 py-1.5">
                <span className="text-sm font-mono text-muted-foreground w-6 shrink-0 text-right">
                  {i + 1}.
                </span>
                <span className="text-sm font-medium">
                  {section.title || (
                    <span className="text-muted-foreground italic">
                      Untitled section
                    </span>
                  )}
                </span>
              </div>
            ))}
            {sections.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No sections to preview
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
