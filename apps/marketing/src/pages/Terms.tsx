import { useDocumentTitle } from '@/lib/useDocumentTitle';

export function Terms({ navigate: _navigate }: { navigate: (p: string) => void }) {
  useDocumentTitle(
    'Terms of Service — ForgePSA',
    'ForgePSA Terms of Service: subscription, payment, data ownership, acceptable use, SMS terms (CTIA-compliant), and governing law.',
  );
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-bold text-slate-900 mb-2">Terms of Service</h1>
      <p className="text-sm text-slate-500 mb-10">Last updated: April 12, 2026</p>

      <div className="prose prose-slate max-w-none space-y-6 text-slate-700 leading-relaxed">
        <Section title="1. Agreement">
          <p>
            These Terms of Service ("Terms") govern your use of ForgePSA (the "Service"), operated by
            Rivertown Technology ("ForgePSA", "we", "us", or "our"). By signing up for or using the
            Service, you agree to be bound by these Terms on behalf of yourself and the organization
            you represent (the "Customer").
          </p>
        </Section>

        <Section title="2. The Service">
          <p>
            ForgePSA provides Professional Services Automation and Remote Monitoring and Management
            software delivered as a cloud-hosted service. The Service includes ticketing, contracts,
            invoicing, a customer portal, product catalog, time tracking, and related features
            described on <a href="https://forgepsa.com" className="text-brand-600 hover:underline">forgepsa.com</a>.
          </p>
        </Section>

        <Section title="3. Free trial">
          <p>
            New accounts receive a 45-day free trial with full access to all features. No payment
            method is required to start the trial. At the end of the trial, you must add a paid
            subscription to continue making changes to your data; read-only access continues until
            you cancel or subscribe.
          </p>
        </Section>

        <Section title="4. Subscription & payment">
          <p>
            Paid subscriptions are billed monthly or annually via Stripe in advance on a per-technician
            basis. You may upgrade, downgrade, or cancel at any time. If a scheduled payment fails,
            your account enters a 30-day grace period. If the payment issue is not resolved within
            that window, your account is locked to the billing screen until it is.
          </p>
          <p>
            Fees are non-refundable except where required by law. Taxes are your responsibility where
            applicable.
          </p>
        </Section>

        <Section title="5. Your data">
          <p>
            You retain all rights to data you upload to the Service ("Customer Data"). We use Customer
            Data solely to operate and improve the Service and in accordance with our Privacy Policy.
            You are responsible for the accuracy and legality of Customer Data and for obtaining any
            consents required from your own customers.
          </p>
          <p>
            <strong>We do not sell Customer Data. Ever.</strong> We do not share Customer Data with third
            parties for marketing purposes. We do not use Customer Data to train AI models. These commitments
            are not mere policies we reserve the right to change at will — they are core product
            principles, and any material change would require 30 days' advance notice with an opportunity
            to export and terminate.
          </p>
        </Section>

        <Section title="5a. SMS messaging">
          <p>
            ForgePSA uses SMS <strong>only</strong> for security purposes: multi-factor authentication codes,
            password-reset codes, and security alerts about suspicious activity. <strong>We do not send
            marketing SMS.</strong>
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Consent:</strong> When you opt into SMS-based MFA, you consent to receive authentication
              and security SMS at the phone number you provide. Consent to receive these messages is not a
              condition of any purchase.
            </li>
            <li>
              <strong>Frequency:</strong> Variable — typically only when you sign in, change security settings,
              or when we detect suspicious activity. Often zero messages per month.
            </li>
            <li>
              <strong>Carrier charges:</strong> Standard message and data rates may apply. ForgePSA is not
              responsible for charges imposed by your mobile carrier.
            </li>
            <li>
              <strong>Opt out:</strong> Reply <strong>STOP</strong> to any SMS from us to unsubscribe. Opting
              out will disable SMS-based MFA on your account; authenticator apps and passkeys remain available.
              You can re-enable SMS MFA at any time from Settings → Security.
            </li>
            <li>
              <strong>Help:</strong> Reply <strong>HELP</strong> for assistance, or email{' '}
              <a href="mailto:support@forgepsa.com" className="text-brand-600 hover:underline">support@forgepsa.com</a>.
            </li>
            <li>
              <strong>Supported carriers:</strong> All major US carriers (AT&T, T-Mobile, Verizon, and others).
              Carriers are not liable for delayed or undelivered messages.
            </li>
            <li>
              <strong>No resale or sharing:</strong> Phone numbers are never sold, rented, or shared with third
              parties for marketing. They are transmitted only to Twilio, our SMS delivery subprocessor.
            </li>
          </ul>
          <p>
            For full details on how phone numbers are collected, stored, and processed, see our{' '}
            <a href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</a>.
          </p>
        </Section>

        <Section title="6. Acceptable use">
          <p>You agree not to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Use the Service to violate applicable law or infringe third-party rights</li>
            <li>Attempt to reverse-engineer, disrupt, or circumvent security of the Service</li>
            <li>Use the Service to send unsolicited bulk email or unlawful content</li>
            <li>Resell access to the Service except under a written agreement with us</li>
          </ul>
        </Section>

        <Section title="7. Availability">
          <p>
            We aim for 99.9% uptime but do not guarantee uninterrupted availability. We may perform
            maintenance with reasonable notice. We are not liable for downtime caused by upstream
            providers, force majeure events, or your network.
          </p>
        </Section>

        <Section title="8. Termination">
          <p>
            You may cancel your subscription at any time from the billing screen. We may suspend or
            terminate your account for material breach of these Terms, non-payment beyond the grace
            period, or fraud. On termination, you may export your Customer Data for 30 days, after
            which we will delete it from active systems within 90 days (backups age out thereafter).
          </p>
        </Section>

        <Section title="9. Warranty disclaimer">
          <p>
            The Service is provided "as is" without warranties of any kind, express or implied,
            including merchantability, fitness for a particular purpose, and non-infringement, to the
            maximum extent permitted by law.
          </p>
        </Section>

        <Section title="10. Limitation of liability">
          <p>
            To the maximum extent permitted by law, our aggregate liability under these Terms will
            not exceed the fees you paid us in the 12 months immediately preceding the claim. We are
            not liable for indirect, incidental, special, consequential, or punitive damages.
          </p>
        </Section>

        <Section title="11. Changes to these Terms">
          <p>
            We may update these Terms from time to time. Material changes will be announced by email
            and in the Service at least 30 days before they take effect. Continued use after the
            effective date constitutes acceptance.
          </p>
        </Section>

        <Section title="12. Governing law">
          <p>
            These Terms are governed by the laws of the State of New York, without regard to
            conflict-of-laws principles. Exclusive venue for disputes is the state and federal courts
            located in New York County, New York.
          </p>
        </Section>

        <Section title="13. Contact">
          <p>
            Questions about these Terms? Email{' '}
            <a href="mailto:legal@forgepsa.com" className="text-brand-600 hover:underline">
              legal@forgepsa.com
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
