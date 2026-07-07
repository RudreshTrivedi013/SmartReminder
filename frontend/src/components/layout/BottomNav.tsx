import { NavLink } from 'react-router-dom'
import { LayoutDashboard, CheckSquare, Mic, BarChart2, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { to: '/voice', icon: Mic, label: 'Voice' },
  { to: '/summary', icon: BarChart2, label: 'Summary' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-bg-surface border-t border-border/50 px-2 pb-safe">
      <div className="flex items-center justify-around">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} className="flex-1">
            {({ isActive }) => (
              <div className={cn(
                'flex flex-col items-center gap-1 py-2 px-1 rounded-lg transition-all duration-200',
                isActive ? 'text-primary' : 'text-text-muted'
              )}>
                <Icon size={20} />
                <span className="text-[10px] font-medium">{label}</span>
              </div>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
