'use client';

import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import Link from 'next/link';
import { Copy, Check, Plus, RefreshCw, ExternalLink, BookOpen } from 'lucide-react';

interface Organization {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  createdAt: string;
  updatedAt: string;
}

interface OrgDetail extends Organization {
  apiKey?: string;
  webhookUrl?: string;
}

export default function AdminPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  const [detailOrg, setDetailOrg] = useState<OrgDetail | null>(null);

  async function loadOrgs() {
    try {
      setLoading(true);
      const data = await api.getOrganizations();
      setOrgs(data);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrgs();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName || !newSlug) return;
    try {
      setCreating(true);
      await api.createOrganization({ name: newName, slug: newSlug });
      setNewName('');
      setNewSlug('');
      setShowCreate(false);
      await loadOrgs();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function viewOrg(id: string) {
    try {
      const data = await api.getOrganization(id);
      setDetailOrg(data);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function rotateKey(id: string) {
    try {
      const data = await api.rotateApiKey(id);
      setDetailOrg((prev) => (prev ? { ...prev, apiKey: data.apiKey } : prev));
      await loadOrgs();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 2000);
  }

  if (loading) return <div className="p-8 text-cyan-400">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Admin</h1>
            <p className="text-gray-400 mt-1">Manage organizations and API keys</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/guide"
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              <BookOpen size={18} />
              Connection Guide
            </Link>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded-lg transition-colors"
            >
              <Plus size={18} />
              New Organization
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>
        )}

        {showCreate && (
          <form onSubmit={handleCreate} className="mb-8 p-6 bg-[#12121a] border border-gray-800 rounded-xl">
            <h3 className="text-lg font-semibold mb-4">Create Organization</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Acme Realty"
                  className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-700 rounded-lg focus:border-cyan-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Slug</label>
                <input
                  type="text"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="acme-realty"
                  className="w-full px-3 py-2 bg-[#0a0a0f] border border-gray-700 rounded-lg focus:border-cyan-500 focus:outline-none"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, hyphens only</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="bg-[#12121a] border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-[#1a1a24]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Slug</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Plan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {orgs.map((org) => (
                <tr key={org.id} className="hover:bg-[#1a1a24] transition-colors">
                  <td className="px-6 py-4 font-medium">{org.name}</td>
                  <td className="px-6 py-4 text-gray-400">{org.slug}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      org.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'
                    }`}>
                      {org.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-400 capitalize">{org.plan}</td>
                  <td className="px-6 py-4 text-gray-500 text-sm">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => viewOrg(org.id)}
                      className="text-cyan-400 hover:text-cyan-300 text-sm font-medium"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No organizations yet. Create one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Detail Modal */}
        {detailOrg && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-[#12121a] border border-gray-800 rounded-xl max-w-lg w-full p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">{detailOrg.name}</h2>
                <button
                  onClick={() => setDetailOrg(null)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-3 bg-[#0a0a0f] rounded-lg">
                  <label className="block text-xs text-gray-400 mb-1">API Key</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm text-cyan-400 truncate">{detailOrg.apiKey}</code>
                    <button
                      onClick={() => copyToClipboard(detailOrg.apiKey || '', 'apikey')}
                      className="p-1 hover:bg-gray-800 rounded"
                    >
                      {copiedId === 'apikey' ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-[#0a0a0f] rounded-lg">
                  <label className="block text-xs text-gray-400 mb-1">Webhook URL</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm text-cyan-400 truncate">{detailOrg.webhookUrl}</code>
                    <button
                      onClick={() => copyToClipboard(detailOrg.webhookUrl || '', 'webhook')}
                      className="p-1 hover:bg-gray-800 rounded"
                    >
                      {copiedId === 'webhook' ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                    </button>
                    <a
                      href={detailOrg.webhookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 hover:bg-gray-800 rounded"
                    >
                      <ExternalLink size={16} />
                    </a>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => rotateKey(detailOrg.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-sm"
                  >
                    <RefreshCw size={14} />
                    Rotate Key
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
