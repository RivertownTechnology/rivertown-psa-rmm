import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, Plus, Trash2, GripVertical, Loader2, CheckCircle2 } from 'lucide-react';

interface TemplateSection {
  title: string;
  instructions: string;
  order: number;
}

export function GovSettingsPage() {
  const [sections, setSections] = useState<TemplateSection[]>([]);
  const [companyProfile, setCompanyProfile] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<{ sections: TemplateSection[]; companyProfile: string }>('/gov/proposal-template')
      .then(data => {
        setSections(data.sections || []);
        setCompanyProfile(data.companyProfile || '');
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await api('/gov/proposal-template', {
        method: 'PUT',
        body: JSON.stringify({ sections, companyProfile }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* */ }
    finally { setSaving(false); }
  }

  function addSection() {
    setSections([...sections, { title: '', instructions: '', order: sections.length + 1 }]);
  }

  function removeSection(index: number) {
    const updated = sections.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 }));
    setSections(updated);
  }

  function moveSection(from: number, to: number) {
    if (to < 0 || to >= sections.length) return;
    const updated = [...sections];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);
    setSections(updated.map((s, i) => ({ ...s, order: i + 1 })));
  }

  if (!loaded) {
    return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Company Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This information is included in every AI-generated proposal section. Describe your company, certifications, key differentiators, and anything the AI should always know about Rivertown Technology.
          </p>
          <textarea
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[160px] resize-y"
            value={companyProfile}
            onChange={e => setCompanyProfile(e.target.value)}
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
        </CardContent>
      </Card>

      {/* Default Proposal Sections */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Default Proposal Sections</CardTitle>
            <Button variant="outline" size="sm" onClick={addSection}>
              <Plus className="h-4 w-4 mr-1" /> Add Section
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Define the sections that appear in new proposals. The AI instructions tell the AI what to write for each section — think of them as standing instructions so you don't have to repeat yourself.
          </p>

          {sections.map((section, i) => (
            <div key={i} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => moveSection(i, i - 1)}
                    disabled={i === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                    title="Move up"
                  >
                    <GripVertical className="h-3 w-3 rotate-180" />
                  </button>
                  <button
                    onClick={() => moveSection(i, i + 1)}
                    disabled={i === sections.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                    title="Move down"
                  >
                    <GripVertical className="h-3 w-3" />
                  </button>
                </div>

                <span className="text-xs text-muted-foreground font-mono w-6 shrink-0">{i + 1}.</span>

                <Input
                  value={section.title}
                  onChange={e => {
                    const updated = [...sections];
                    updated[i] = { ...updated[i], title: e.target.value };
                    setSections(updated);
                  }}
                  placeholder="Section title (e.g. Executive Summary)"
                  className="flex-1"
                />

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSection(i)}
                  className="text-destructive hover:text-destructive shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-1.5 pl-10">
                <Label className="text-xs text-muted-foreground">AI Instructions</Label>
                <textarea
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px] resize-y"
                  value={section.instructions}
                  onChange={e => {
                    const updated = [...sections];
                    updated[i] = { ...updated[i], instructions: e.target.value };
                    setSections(updated);
                  }}
                  placeholder="Tell the AI what to include in this section..."
                />
              </div>
            </div>
          ))}

          {sections.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>No sections configured. Click "Add Section" to get started, or defaults will be used.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Saving...</>
          ) : (
            <><Save className="h-4 w-4 mr-1" /> Save Template</>
          )}
        </Button>
        {saved && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
