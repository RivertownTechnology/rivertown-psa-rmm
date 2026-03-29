import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';

interface Customer { id: string; name: string; status: string; billingEmail: string | null; }
interface Ticket { id: string; ticketNumber: number; subject: string; status: string; priority: string; customerId: string; }

export function SearchResultsPage({ query, onNavigateToCustomer, onNavigateToTicket }: {
  query: string; onNavigateToCustomer: (id: string) => void; onNavigateToTicket: (id: string) => void;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);

  useEffect(() => {
    if (!query) return;
    api<{ data: Customer[] }>(`/customers?search=${encodeURIComponent(query)}&limit=20`).then(d => setCustomers(d.data)).catch(() => {});
    api<{ data: Ticket[] }>(`/tickets?limit=100`).then(d => {
      const q = query.toLowerCase();
      setTickets(d.data.filter(t => t.subject.toLowerCase().includes(q) || String(t.ticketNumber).includes(q)));
    }).catch(() => {});
  }, [query]);

  if (!query) return <div className="text-center text-muted-foreground py-12">Enter a search term</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Search className="h-4 w-4" />
        <span>Results for "<strong className="text-foreground">{query}</strong>"</span>
      </div>

      {customers.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Customers ({customers.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {customers.map(c => (
                  <tr key={c.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => onNavigateToCustomer(c.id)}>
                    <td className="p-3 font-medium text-primary hover:underline">{c.name}</td>
                    <td className="p-3 text-muted-foreground">{c.billingEmail ?? '-'}</td>
                    <td className="p-3"><Badge variant="outline">{c.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {tickets.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Tickets ({tickets.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {tickets.map(t => (
                  <tr key={t.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => onNavigateToTicket(t.id)}>
                    <td className="p-3 text-muted-foreground">#{t.ticketNumber}</td>
                    <td className="p-3 font-medium text-primary hover:underline">{t.subject}</td>
                    <td className="p-3"><Badge variant="outline">{t.status}</Badge></td>
                    <td className="p-3"><Badge variant="outline">{t.priority}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {customers.length === 0 && tickets.length === 0 && (
        <div className="text-center text-muted-foreground py-12">No results found for "{query}"</div>
      )}
    </div>
  );
}
