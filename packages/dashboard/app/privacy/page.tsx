'use client';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Privacy Policy</h1>
        <p className="text-gray-400 text-sm mb-8">Last updated: May 15, 2026</p>

        <div className="space-y-8 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. Introduction</h2>
            <p>
              Agentive Technologies Pvt. Ltd. (“Agentive”, “we”, “us”, or “our") operates the Agentive AI platform for commercial real estate lead qualification and engagement. This Privacy Policy explains how we collect, use, store, and protect your personal data when you use our services.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. Data We Collect</h2>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Lead Data:</strong> Names, phone numbers, email addresses, budget, property preferences, and conversation transcripts provided by you or captured via webhooks.</li>
              <li><strong>Usage Data:</strong> API request logs, dashboard activity, and system metrics for operational monitoring.</li>
              <li><strong>Communication Records:</strong> SMS messages, voice call transcripts, and appointment details processed through our platform.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. How We Use Your Data</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>To qualify and route real estate leads using AI.</li>
              <li>To send and receive SMS and voice communications on your behalf.</li>
              <li>To book appointments via integrated calendar services.</li>
              <li>To provide analytics, reporting, and dashboard insights.</li>
              <li>To comply with legal obligations and resolve disputes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. Data Storage & Security</h2>
            <p>
              All data is stored in encrypted databases hosted on Fly.io (US/EU regions). We use TLS 1.3 for data in transit and AES-256 encryption at rest. Access to production data is strictly limited to authorized engineering staff.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Data Sharing</h2>
            <p>
              We do not sell your data. We share data only with:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>Sub-processors required for service delivery (e.g., Twilio for SMS, Cal.com for scheduling, OpenRouter for AI inference).</li>
              <li>Legal authorities when required by applicable law.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Your Rights (India)</h2>
            <p>
              Under the Digital Personal Data Protection Act, 2023 (DPDP Act), Indian residents have the right to access, correct, and erase their personal data. To exercise these rights, contact us at the email below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Retention</h2>
            <p>
              Lead and communication data is retained for the duration of your active subscription plus 90 days, after which it is securely deleted unless longer retention is required by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">8. Contact</h2>
            <p>
              For privacy-related inquiries, contact us at: <span className="text-cyan-400">privacy@agentive.in</span>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
