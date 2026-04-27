import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ShieldCheck, Search, ChevronRight, AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react';

interface ScopedCustomer {
  id: string;
  name: string;
  status: string;
  scopes: Array<{
    id: string;
    frameworkId: string;
    frameworkName: string;
    frameworkShortName: string;
    status: string;
  }>;
}

interface CustomerSummary {
  customerId: string;
  scores: Record<string, number>; // frameworkId -> score
}

export function ComplianceCustomersPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [customers, setCustomers] = useState<ScopedCustomer[]>([]);
  const [allCustomers, setAllCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const scoped = await api<ScopedCustomer[]>('/compliance/scoped-customers');
      setCustomers(scoped);
    } catch { /* */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = customers.filter(c => {
    if (!search) return true;
    return c.name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Compliance Customers</h2>
          <p className="text-sm text-muted-foreground">{customers.length} customer{customers.length !== 1 ? 's' : ''} with active compliance scopes</p>
        </div>
        <Button onClick={() => onNavigate('/compliance/assessments')}>
          View All Assessments
        </Button>
      </div>

      {/* Search */}
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Customer Cards */}
      {loading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Compliance Customers</h3>
            <p className="text-muted-foreground mb-4">
              {search ? 'No customers match your search.' : 'Scope customers to a compliance framework to get started. Go to a customer\'s profile → Compliance tab, or create a new assessment.'}
            </p>
            {!search && (
              <div className="flex gap-3 justify-center">
                <Button variant="outline" onClick={() => onNavigate('/compliance/assessments')}>New Assessment</Button>
                <Button variant="outline" onClick={() => onNavigate('/compliance/admin')}>Import Framework</Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(customer => (
            <Card key={customer.id} className="cursor-pointer hover:border-primary/50 transition-all group">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold truncate">{customer.name}</h3>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>

                    {/* Framework badges with scores */}
                    <div className="flex flex-wrap gap-2">
                      {customer.scopes.map(scope => (
                        <button
                          key={scope.id}
                          onClick={() => onNavigate(`/compliance/assessments?customerId=${customer.id}`)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors hover:border-primary/50"
                        >
                          <ShieldCheck className="h-3 w-3 text-muted-foreground" />
                          {scope.frameworkShortName}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <Button variant="outline" size="sm" onClick={() => onNavigate(`/compliance/assessments?customerId=${customer.id}`)}>
                      Assessments
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onNavigate(`/customers/${customer.id}`)}>
                      Customer Profile
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
