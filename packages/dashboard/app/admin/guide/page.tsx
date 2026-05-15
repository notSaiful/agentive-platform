'use client';

import { useState } from 'react';
import { Copy, Check, Webhook, MessageSquare, Phone, Calendar, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const BASE_URL = 'https://agentive-engine.fly.dev';

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="bg-[#0a0a0f] border border-gray-800 rounded-lg overflow-hidden mb-4">
      {label && (
        <div className="px-4 py-2 bg-[#1a1a24] border-b border-gray-800 text-xs text-gray-400 font-mono">
          {label}
        </div>
      )}
      <div className="flex items-start gap-2 p-4">
        <pre className="flex-1 text-sm text-cyan-400 font-mono overflow-x-auto whitespace-pre-wrap break-all">
          {code}
        </pre>
        <button onClick={copy} className="p-1 hover:bg-gray-800 rounded shrink-0">
          {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} className="text-gray-400" />}
        </button>
      </div>
    </div>
  );
}

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-cyan-400 transition-colors">
            <ArrowLeft size={16} />
            Back to Admin
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white">Lead Source Connection Guide</h1>
          <p className="text-gray-400 mt-2">
            Connect your CRM, website forms, and ad platforms to Agentive. All requests must include your organization API key in the <code className="text-cyan-400">x-api-key</code> header or organization identifier in the query string for webhooks.
          </p>
        </div>

        {/* API Key Authentication */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Webhook size={20} className="text-cyan-400" />
            Authentication
          </h2>
          <div className="bg-[#12121a] border border-gray-800 rounded-xl p-6">
            <p className="text-gray-300 mb-4">
              Every request requires your organization API key. Get yours from the <Link href="/admin" className="text-cyan-400 hover:underline">Admin</Link> panel.
            </p>
            <CodeBlock
              label="Header"
              code={`x-api-key: your-org-api-key-here`}
            />
            <p className="text-sm text-gray-500 mt-2">
              For webhook URLs exposed to third parties (e.g. Retell, Twilio, Zapier), append <code className="text-cyan-400">?orgSlug=your-slug</code> instead.
            </p>
          </div>
        </section>

        {/* Lead Ingestion Webhook */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Webhook size={20} className="text-cyan-400" />
            Lead Ingestion Webhook
          </h2>
          <div className="bg-[#12121a] border border-gray-800 rounded-xl p-6">
            <p className="text-gray-300 mb-4">
              Send leads from your website forms, CRM, or ad platforms to this endpoint. The AI will immediately qualify and route them.
            </p>

            <CodeBlock label="POST /webhooks/leads" code={`${BASE_URL}/webhooks/leads?orgSlug=YOUR_SLUG`} />

            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Example Payload</h3>
            <CodeBlock
              label="JSON body"
              code={`{
  "name": "Rajesh Kumar",
  "phone": "+91 98765 43210",
  "email": "rajesh@example.com",
  "source": "facebook-ads",
  "budget": "₹2 Cr",
  "timeline": "30 days",
  "propertyType": "Commercial Office",
  "notes": "Looking for 2000 sqft in Bandra Kurla Complex"
}`}
            />

            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-6">Supported Fields</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {[
                ['name', 'Full name of the lead'],
                ['phone', 'Phone number with country code'],
                ['email', 'Email address'],
                ['source', 'Where the lead came from'],
                ['budget', 'Budget range or amount'],
                ['timeline', 'Buying/renting timeline'],
                ['propertyType', 'Type of property interest'],
                ['notes', 'Any additional context'],
              ].map(([field, desc]) => (
                <div key={field} className="flex items-start gap-2">
                  <code className="text-cyan-400 font-mono bg-[#0a0a0f] px-2 py-0.5 rounded shrink-0">{field}</code>
                  <span className="text-gray-400">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SMS Inbound */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <MessageSquare size={20} className="text-cyan-400" />
            SMS Inbound Webhook
          </h2>
          <div className="bg-[#12121a] border border-gray-800 rounded-xl p-6">
            <p className="text-gray-300 mb-4">
              Configure Twilio to forward inbound SMS messages to this endpoint so the AI can reply and continue qualification.
            </p>
            <CodeBlock label="POST /webhooks/sms/inbound" code={`${BASE_URL}/webhooks/sms/inbound?orgSlug=YOUR_SLUG`} />
            <p className="text-sm text-gray-500 mt-3">
              Twilio should send standard <code className="text-cyan-400">application/x-www-form-urlencoded</code> parameters (<code className="text-cyan-400">From</code>, <code className="text-cyan-400">Body</code>, <code className="text-cyan-400">To</code>).
            </p>
          </div>
        </section>

        {/* Voice Call Ended */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Phone size={20} className="text-cyan-400" />
            Voice Call Ended Webhook
          </h2>
          <div className="bg-[#12121a] border border-gray-800 rounded-xl p-6">
            <p className="text-gray-300 mb-4">
              Connect your Retell AI voice agent to send call transcripts here after a call ends. The AI will extract qualification data and trigger follow-up.
            </p>
            <CodeBlock label="POST /webhooks/retell/call-ended" code={`${BASE_URL}/webhooks/retell/call-ended?orgSlug=YOUR_SLUG`} />
            <CodeBlock
              label="Example JSON body"
              code={`{
  "callId": "retell-call-123",
  "from": "+91 98765 43210",
  "to": "+91 98765 00000",
  "status": "completed",
  "duration": 245,
  "transcript": "Agent: Hello, how can I help? Lead: I'm looking for office space..."
}`}
            />
          </div>
        </section>

        {/* Appointment Booking */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Calendar size={20} className="text-cyan-400" />
            Calendar Integration
          </h2>
          <div className="bg-[#12121a] border border-gray-800 rounded-xl p-6">
            <p className="text-gray-300 mb-4">
              Agentive auto-books appointments via Cal.com when a lead is HOT and timeline is under 30 days. Ensure your Cal.com API key is configured in engine environment variables.
            </p>
            <ul className="list-disc list-inside text-sm text-gray-400 space-y-1">
              <li>Set <code className="text-cyan-400">CAL_API_KEY</code> in your engine environment</li>
              <li>The AI will create booking links and send them to qualified leads automatically</li>
              <li>Appointments appear in the <Link href="/appointments" className="text-cyan-400 hover:underline">Appointments</Link> dashboard</li>
            </ul>
          </div>
        </section>

        {/* Testing */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4">Testing Your Integration</h2>
          <div className="bg-[#12121a] border border-gray-800 rounded-xl p-6">
            <p className="text-gray-300 mb-4">Use <code className="text-cyan-400">curl</code> to test your webhook before going live:</p>
            <CodeBlock
              label="cURL example"
              code={`curl -X POST '${BASE_URL}/webhooks/leads?orgSlug=YOUR_SLUG' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "name": "Test Lead",
    "phone": "+91 99999 99999",
    "source": "test"
  }'`}
            />
            <p className="text-sm text-gray-500 mt-3">
              A successful response returns <code className="text-green-400">{`{ "success": true }`}</code> and creates a lead in your dashboard within seconds.
            </p>
          </div>
        </section>

        {/* Footer note */}
        <div className="border-t border-gray-800 pt-6 text-sm text-gray-500">
          Need help? Check the <Link href="/admin" className="text-cyan-400 hover:underline">Admin</Link> panel to verify your API key, or contact support.
        </div>
      </div>
    </div>
  );
}
