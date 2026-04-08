/**
 * Seed ticket categories and subcategories for MSP operations.
 * Run once per tenant to populate the category tree.
 */

export const TICKET_CATEGORY_SEED = [
  {
    name: 'Network',
    slug: 'network',
    description: 'Network infrastructure, connectivity, and communication issues',
    subcategories: [
      { name: 'Connectivity', slug: 'connectivity', description: 'Internet or LAN connectivity issues' },
      { name: 'WiFi', slug: 'wifi', description: 'Wireless network problems' },
      { name: 'VPN', slug: 'vpn', description: 'VPN connection or configuration issues' },
      { name: 'Firewall', slug: 'firewall', description: 'Firewall rules, blocks, or configuration' },
      { name: 'DNS / DHCP', slug: 'dns-dhcp', description: 'Name resolution or IP assignment issues' },
      { name: 'Switch / Router', slug: 'switch-router', description: 'Network equipment problems' },
    ],
  },
  {
    name: 'Email & Calendar',
    slug: 'email-calendar',
    description: 'Email, calendar, and communication platform issues',
    subcategories: [
      { name: 'Outlook', slug: 'outlook', description: 'Outlook desktop or mobile app issues' },
      { name: 'Microsoft 365', slug: 'microsoft-365', description: 'M365 admin, licensing, or service issues' },
      { name: 'Email Delivery', slug: 'email-delivery', description: 'Sending or receiving failures, bounces' },
      { name: 'Spam / Phishing', slug: 'spam-phishing', description: 'Unwanted email or phishing attempts' },
      { name: 'Calendar', slug: 'calendar', description: 'Scheduling, sharing, or sync issues' },
    ],
  },
  {
    name: 'Hardware',
    slug: 'hardware',
    description: 'Physical device and equipment issues',
    subcategories: [
      { name: 'Desktop / Laptop', slug: 'desktop-laptop', description: 'Computer hardware problems' },
      { name: 'Monitor / Display', slug: 'monitor-display', description: 'Display or graphics issues' },
      { name: 'Printer / Scanner', slug: 'printer-scanner', description: 'Printing or scanning problems' },
      { name: 'Phone / VoIP', slug: 'phone-voip', description: 'Desk phone or softphone issues' },
      { name: 'Peripheral', slug: 'peripheral', description: 'Keyboard, mouse, docking station, etc.' },
      { name: 'Server Hardware', slug: 'server-hardware', description: 'Physical server issues' },
    ],
  },
  {
    name: 'Software',
    slug: 'software',
    description: 'Application and software issues',
    subcategories: [
      { name: 'Installation', slug: 'installation', description: 'Software install or setup' },
      { name: 'Update / Patch', slug: 'update-patch', description: 'Software updates or patch issues' },
      { name: 'Licensing', slug: 'licensing', description: 'License activation or expiry' },
      { name: 'Crash / Error', slug: 'crash-error', description: 'Application crashes or error messages' },
      { name: 'Performance', slug: 'performance', description: 'Slow or unresponsive applications' },
      { name: 'Compatibility', slug: 'compatibility', description: 'Software version conflicts' },
    ],
  },
  {
    name: 'Account & Access',
    slug: 'account-access',
    description: 'User accounts, permissions, and authentication',
    subcategories: [
      { name: 'Password Reset', slug: 'password-reset', description: 'Password reset or unlock requests' },
      { name: 'New Account', slug: 'new-account', description: 'New user account creation' },
      { name: 'Permissions', slug: 'permissions', description: 'Access rights or sharing issues' },
      { name: 'MFA / 2FA', slug: 'mfa', description: 'Multi-factor authentication setup or issues' },
      { name: 'Account Lockout', slug: 'account-lockout', description: 'Locked out of account' },
      { name: 'Account Termination', slug: 'account-termination', description: 'Disable or remove user access' },
    ],
  },
  {
    name: 'Security',
    slug: 'security',
    description: 'Security incidents, threats, and compliance',
    subcategories: [
      { name: 'Malware / Virus', slug: 'malware-virus', description: 'Malware detection or infection' },
      { name: 'Phishing', slug: 'phishing', description: 'Phishing email or attack investigation' },
      { name: 'Suspicious Activity', slug: 'suspicious-activity', description: 'Unusual login or system behavior' },
      { name: 'Data Breach', slug: 'data-breach', description: 'Potential or confirmed data exposure' },
      { name: 'Compliance', slug: 'compliance', description: 'HIPAA, CMMC, NIST, PCI DSS related' },
    ],
  },
  {
    name: 'Backup & Recovery',
    slug: 'backup-recovery',
    description: 'Data backup, disaster recovery, and restore operations',
    subcategories: [
      { name: 'Backup Failure', slug: 'backup-failure', description: 'Scheduled backup did not complete' },
      { name: 'Data Recovery', slug: 'data-recovery', description: 'Recovering lost or deleted data' },
      { name: 'Restore Request', slug: 'restore-request', description: 'Request to restore from backup' },
    ],
  },
  {
    name: 'Cloud Services',
    slug: 'cloud-services',
    description: 'Cloud platform and SaaS application issues',
    subcategories: [
      { name: 'Microsoft 365 Admin', slug: 'microsoft-365-admin', description: 'M365 tenant administration' },
      { name: 'Azure / AWS', slug: 'azure-aws', description: 'Cloud infrastructure issues' },
      { name: 'SaaS Application', slug: 'saas-application', description: 'Third-party cloud app problems' },
      { name: 'Google Workspace', slug: 'google-workspace', description: 'Google Workspace issues' },
    ],
  },
  {
    name: 'Server',
    slug: 'server',
    description: 'Server operations, performance, and maintenance',
    subcategories: [
      { name: 'Performance', slug: 'server-performance', description: 'Slow or overloaded server' },
      { name: 'Disk Space', slug: 'disk-space', description: 'Low storage or cleanup needed' },
      { name: 'Service Down', slug: 'service-down', description: 'Server application or service not running' },
      { name: 'Reboot', slug: 'reboot', description: 'Server restart request or issue' },
      { name: 'Monitoring Alert', slug: 'monitoring-alert', description: 'Alert from monitoring system' },
    ],
  },
  {
    name: 'Onboarding / Offboarding',
    slug: 'onboarding-offboarding',
    description: 'Employee setup and teardown processes',
    subcategories: [
      { name: 'New Hire Setup', slug: 'new-hire-setup', description: 'New employee account and equipment' },
      { name: 'Equipment Provisioning', slug: 'equipment-provisioning', description: 'Configure and deploy devices' },
      { name: 'Account Deactivation', slug: 'account-deactivation', description: 'Disable departing employee access' },
      { name: 'Equipment Return', slug: 'equipment-return', description: 'Collect and wipe returned devices' },
    ],
  },
  {
    name: 'Billing',
    slug: 'billing',
    description: 'Invoicing, payments, and account questions',
    subcategories: [
      { name: 'Invoice Question', slug: 'invoice-question', description: 'Question about an invoice or charge' },
      { name: 'Payment Issue', slug: 'payment-issue', description: 'Payment failed or dispute' },
      { name: 'Contract Question', slug: 'contract-question', description: 'Service agreement inquiries' },
      { name: 'Service Change', slug: 'service-change', description: 'Upgrade, downgrade, or modify services' },
    ],
  },
  {
    name: 'General',
    slug: 'general',
    description: 'General requests and inquiries',
    subcategories: [
      { name: 'Information Request', slug: 'information-request', description: 'General question or how-to' },
      { name: 'Feedback', slug: 'feedback', description: 'Feedback about service' },
      { name: 'Other', slug: 'other', description: 'Anything that does not fit other categories' },
    ],
  },
];
