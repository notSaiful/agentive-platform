'use client';

export default function TcpaOptInPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Consent & Opt-In Policy</h1>
        <p className="text-gray-400 text-sm mb-8">Last updated: May 15, 2026</p>

        <div className="space-y-8 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. Explicit Consent Required</h2>
            <p>
              Before Agentive sends any SMS or initiates voice calls to a lead, you must obtain clear and conspicuous written consent. This applies to all jurisdictions where your leads are located.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. United States — TCPA Compliance</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Leads must provide express written consent to receive automated marketing calls and texts.</li>
              <li>All messages must include clear opt-out instructions (e.g., "Reply STOP to unsubscribe").</li>
              <li>Agentive automatically respects quiet hours (9:00 PM – 8:00 AM local time) and honors opt-outs immediately.</li>
              <li>Do Not Call (DNC) registry checks are the responsibility of the user; Agentive does not provide DNC scrubbing.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. India — TRAI Compliance</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>All promotional SMS must be sent via registered telemarketer headers and templates approved by telecom operators.</li>
              <li>Leads on the National Do Not Call (NDNC) registry must not receive promotional messages unless they have explicitly opted in.</li>
              <li>Voice calls must comply with TRAI’s UCC (Unsolicited Commercial Communication) regulations.</li>
              <li>Agentive logs all consent timestamps and opt-out events for audit purposes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. Opt-Out Mechanisms</h2>
            <p>
              Leads can opt out at any time by:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>Replying <strong>STOP</strong>, <strong>UNSUBSCRIBE</strong>, or <strong>QUIT</strong> to any SMS.</li>
              <li>Contacting your organization directly to request removal.</li>
            </ul>
            <p className="mt-2">
              Upon receiving an opt-out, Agentive immediately marks the contact as unsubscribed and ceases all automated outreach.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Consent Audit Trail</h2>
            <p>
              Agentive records the timestamp, source, and IP address (where available) of every consent event. You can export these records from the dashboard for regulatory compliance or dispute resolution.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Your Responsibility</h2>
            <p>
              While Agentive provides tools to honor opt-outs and quiet hours, <strong>you are responsible</strong> for obtaining initial consent and ensuring your use of the platform complies with all applicable laws in your jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Contact</h2>
            <p>
              For compliance questions, contact us at: <span className="text-cyan-400">compliance@agentive.in</span>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
