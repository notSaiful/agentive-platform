'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Calendar,
  AlertTriangle,
  HeartPulse,
  Bell,
  Settings,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/conversations', label: 'Conversations', icon: MessageSquare },
  { href: '/appointments', label: 'Appointments', icon: Calendar },
  { href: '/escalations', label: 'Escalations', icon: AlertTriangle },
  { href: '/nurture', label: 'Nurture', icon: HeartPulse },
  { href: '/alerts', label: 'Alerts', icon: Bell },
  { href: '/admin', label: 'Admin', icon: Shield },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 h-screen sticky top-0 glass-strong border-r border-white/5 flex flex-col">
      <div className="p-6 border-b border-white/5">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-agentive-cyan/20 flex items-center justify-center">
            <span className="text-agentive-cyan font-mono text-sm font-bold">A</span>
          </div>
          <span className="font-mono text-lg font-bold tracking-tight text-white">
            Agentive
          </span>
        </Link>
        <p className="text-xs text-agentive-text-muted mt-1 font-mono">
          CRE Agent Dashboard
        </p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-agentive-cyan/10 text-agentive-cyan border border-agentive-cyan/20'
                  : 'text-agentive-text-secondary hover:text-white hover:bg-white/5'
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/5">
        <div className="flex items-center gap-2 text-xs text-agentive-text-muted font-mono">
          <span className="w-2 h-2 rounded-full bg-agentive-success animate-pulse"></span>
          Engine Online
        </div>
      </div>
    </aside>
  );
}
