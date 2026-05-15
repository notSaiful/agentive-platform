'use client';

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Terms of Service</h1>
        <p className="text-gray-400 text-sm mb-8">Last updated: May 15, 2026</p>

        <div className="space-y-8 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the Agentive platform (“Service”), you agree to be bound by these Terms of Service. If you do not agree, you may not use the Service. The Service is operated by Agentive Technologies Pvt. Ltd., registered in India.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. Description of Service</h2>
            <p>
              Agentive provides AI-powered lead qualification, SMS/voice automation, appointment scheduling, and analytics for commercial real estate professionals. The Service is provided on an "as is" and "as available" basis.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. User Obligations</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>You must obtain explicit consent from leads before contacting them via SMS or voice.</li>
              <li>You are responsible for complying with all applicable telecom regulations, including TRAI guidelines in India and TCPA in the United States.</li>
              <li>You may not use the Service to send spam, fraudulent messages, or harassing content.</li>
              <li>You are responsible for maintaining the confidentiality of your API keys and account credentials.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. Fair Housing Compliance</h2>
            <p>
              Agentive includes automated guardrails to detect potentially discriminatory content. However, you are solely responsible for ensuring all communications comply with the Fair Housing Act (US) and equivalent anti-discrimination laws in your jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Agentive shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the Service. Our total liability shall not exceed the amount you paid us in the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Termination</h2>
            <p>
              We may suspend or terminate your access to the Service immediately if you violate these Terms. Upon termination, your data will be retained for 90 days and then securely deleted.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in Mumbai, Maharashtra.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">8. Contact</h2>
            <p>
              For legal inquiries, contact us at: <span className="text-cyan-400">legal@agentive.in</span>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
