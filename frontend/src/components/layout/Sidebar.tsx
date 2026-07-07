import { NavLink, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, CheckSquare, Mic, BarChart2, Settings, LogOut, Wifi, WifiOff, Loader2, Bell
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useWsStore } from '@/stores/wsStore'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { to: '/voice', icon: Mic, label: 'Voice Input' },
  { to: '/summary', icon: BarChart2, label: 'Summary' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  const { user } = useAuthStore()
  const { status } = useWsStore()
  const { logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="hidden md:flex flex-col w-60 shrink-0 h-screen sticky top-0 bg-bg-surface border-r border-border/50 p-4 z-20"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-2 mb-8">
        <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center shadow-glow-sm">
          <Bell size={16} className="text-primary" />
        </div>
        <span className="font-bold text-text-primary tracking-tight">SmartRemind</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to}>
            {({ isActive }) => (
              <div className={cn('nav-item', isActive && 'nav-item-active')}>
                <Icon size={18} />
                <span className="text-sm font-medium">{label}</span>
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* WS Status indicator */}
      <div className="px-2 mb-3">
        <div className="flex items-center gap-2 text-xs">
          {status === 'connected' && <><Wifi size={12} className="text-success" /><span className="text-success">Live sync</span></>}
          {status === 'reconnecting' && <><Loader2 size={12} className="text-warning animate-spin" /><span className="text-warning">Reconnecting…</span></>}
          {status === 'disconnected' && <><WifiOff size={12} className="text-text-muted" /><span className="text-text-muted">Offline</span></>}
          {status === 'connecting' && <><Loader2 size={12} className="text-primary animate-spin" /><span className="text-text-muted">Connecting…</span></>}
        </div>
      </div>

      {/* User + Logout */}
      <div className="border-t border-border/50 pt-3">
        <div className="px-2 mb-2">
          <p className="text-xs text-text-muted truncate">{user?.email}</p>
          <p className="text-xs text-text-muted/60">{user?.timezone}</p>
        </div>
        <button onClick={handleLogout} className="nav-item w-full text-danger hover:text-danger hover:bg-danger/10">
          <LogOut size={18} />
          <span className="text-sm font-medium">Sign out</span>
        </button>
      </div>
    </motion.aside>
  )
}
