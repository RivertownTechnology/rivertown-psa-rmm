export function Privacy({ navigate: _navigate }: { navigate: (p: string) => void }) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
      <p className="text-sm text-slate-500 mb-10">Last updated: April 12, 2026</p>

      <div className="space-y-6 text-slate-700 leading-relaxed">
        <Section title="1. Who we are">
          <p>
            ForgePSA is operated by Rivertown Technology ("ForgePSA", "we", "us"). This Privacy
            Policy describes how we collect, use, and share information when you use our website
            (<a href="https://forgepsa.com" className="text-brand-600 hover:underline">forgepsa.com</a>)
            and the ForgePSA service.
          </p>
        </Section>

        <Section title="2. Information we collect">
          <p><strong>Account information.</strong> When you sign up we collect your name, email
          address, password (hashed with bcrypt), and company name.</p>
          <p><strong>Customer data.</strong> Your tickets, customers, invoices, time entries, and
          any other data you enter into the Service.</p>
          <p><strong>Usage data.</strong> Standard server logs — IP address, browser, pages viewed,
          timestamps — used for security monitoring and troubleshooting.</p>
          <p><strong>Payment data.</strong> Subscription billing is processed by Stripe. We never see
          your full card number. We store a Stripe customer ID so we can associate charges with your
          account.</p>
        </Section>

        <Section title="3. How we use information">
          <ul className="list-disc pl-6 space-y-1">
            <li>To provide, maintain, and improve the Service</li>
            <li>To process subscription payments and send billing notices</li>
            <li>To send operational emails (welcome, trial ending, payment receipts, security alerts)</li>
            <li>To detect, prevent, and respond to fraud and abuse</li>
            <li>To comply with legal obligations</li>
          </ul>
          <div className="bg-brand-50 border border-brand-200 rounded-lg p-4 mt-4">
            <p className="font-semibold text-brand-900 mb-1">Our commitments, in plain language:</p>
            <ul className="list-disc pl-5 space-y-1 text-brand-900">
              <li><strong>We never sell your data.</strong> Not to advertisers, not to data brokers, not to anyone. Ever.</li>
              <li><strong>We never use Customer Data to train AI models.</strong></li>
              <li><strong>We never send marketing SMS.</strong> SMS is used only for security (see section 10 below).</li>
              <li><strong>We never share data with third parties for marketing purposes.</strong></li>
            </ul>
          </div>
        </Section>

        <Section title="4. Subprocessors">
          <p>We share data with a limited set of service providers necessary to run ForgePSA:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Railway</strong> — application hosting and databases</li>
            <li><strong>Cloudflare</strong> — CDN, DNS, and DDoS protection</li>
            <li><strong>Stripe</strong> — subscription billing and payment processing</li>
            <li><strong>Mailjet</strong> — transactional and account email delivery</li>
            <li><strong>Anthropic</strong> — AI features (only when you explicitly use them, with redacted data)</li>
          </ul>
          <p>
            Each subprocessor is contractually bound to protect your data and use it only for the
            purposes we specify.
          </p>
        </Section>

        <Section title="5. Security">
          <p>
            Passwords are hashed with bcrypt. Integration credentials (QuickBooks, Stripe, Mailjet,
            Pax8, etc.) are encrypted at rest using AES-256-GCM. All traffic is TLS 1.2+. JWT access
            tokens are short-lived with a Redis blacklist for immediate logout. The database is
            accessible only to our application servers.
          </p>
        </Section>

        <Section title="6. Data retention">
          <p>
            Customer Data is retained as long as your account is active. If you cancel or delete your
            account, we retain Customer Data for 30 days to allow export, then remove it from active
            systems within 90 days. Database backups age out within 90 days thereafter. Some records
            (e.g. invoices for tax purposes) may be retained longer where required by law.
          </p>
        </Section>

        <Section title="7. Your rights">
          <p>Depending on your jurisdiction you may have rights to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Access a copy of your personal data</li>
            <li>Correct inaccurate data</li>
            <li>Delete your data (subject to legal retention obligations)</li>
            <li>Export your data in a portable format</li>
            <li>Object to or restrict certain processing</li>
          </ul>
          <p>
            To exercise these rights, email{' '}
            <a href="mailto:privacy@forgepsa.com" className="text-brand-600 hover:underline">
              privacy@forgepsa.com
            </a>
            . We will respond within 30 days.
          </p>
        </Section>

        <Section title="7a. Phone numbers &amp; SMS messaging">
          <p>
            If you enable multi-factor authentication, your phone number is collected solely for
            delivering one-time authentication codes and security alerts. We partner with Twilio as
            our SMS subprocessor; your number is transmitted to Twilio for message delivery and is
            not stored or used by Twilio for any other purpose.
          </p>
          <p className="font-semibold">SMS terms in plain language:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>We send SMS <strong>only</strong> for account authentication, MFA codes, password-reset codes, and urgent security alerts.</li>
            <li><strong>We do not send marketing SMS, ever.</strong> No promotional offers, no product announcements by SMS, no newsletters.</li>
            <li>Message frequency depends on your activity — typically only when you sign in or change security settings.</li>
            <li>Standard message and data rates from your carrier may apply. ForgePSA is not responsible for carrier-imposed charges.</li>
            <li>Reply <strong>STOP</strong> to any ForgePSA SMS to opt out. Opting out will disable SMS-based MFA on your account; you can still use authenticator apps and passkeys.</li>
            <li>Reply <strong>HELP</strong> for support, or email <a href="mailto:support@forgepsa.com" className="text-brand-600 hover:underline">support@forgepsa.com</a>.</li>
            <li>You may remove your phone number from your account at any time from Settings → Security.</li>
            <li>We are not responsible for delivery delays or failures caused by carriers, cellular network outages, or device issues.</li>
          </ul>
          <p>
            We do <strong>not</strong> share or sell phone numbers to third parties for marketing purposes.
            Phone numbers are never used for any purpose other than the security functions described above.
          </p>
        </Section>

        <Section title="8. Cookies">
          <p>
            We use first-party cookies and localStorage to keep you signed in (JWT access token + refresh
            token) and to remember UI preferences (theme color, layout). We do not use third-party
            advertising cookies. We do not track you across other websites.
          </p>
        </Section>

        <Section title="9. International transfers">
          <p>
            ForgePSA is operated from the United States. If you access the Service from outside the US,
            your data will be transferred to and processed in the US. We rely on appropriate safeguards
            (e.g. Standard Contractual Clauses) for any transfers from the EEA, UK, or Switzerland.
          </p>
        </Section>

        <Section title="10. Children">
          <p>
            ForgePSA is not intended for anyone under 18. We do not knowingly collect information from
            children.
          </p>
        </Section>

        <Section title="11. Changes">
          <p>
            We may update this Privacy Policy. Material changes will be announced by email and in the
            Service at least 30 days before they take effect.
          </p>
        </Section>

        <Section title="12. Contact">
          <p>
            Privacy questions or requests? Email{' '}
            <a href="mailto:privacy@forgepsa.com" className="text-brand-600 hover:underline">
              privacy@forgepsa.com
            </a>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-slate-900 mt-6 mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
