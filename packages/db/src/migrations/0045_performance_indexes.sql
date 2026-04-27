-- Performance indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_customer_status ON tickets(tenant_id, customer_id, status);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_tenant ON ticket_comments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ticket_time_entries_ticket ON ticket_time_entries(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_expenses_ticket ON ticket_expenses(ticket_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
