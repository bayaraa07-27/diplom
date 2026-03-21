import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  LayoutDashboard, Users, ScanFace, BarChart3,
  LogOut, GraduationCap, Menu, X, CalendarDays
} from 'lucide-react'
import { useState } from 'react'

const nav = [
  { to: '/',           icon: LayoutDashboard, label: 'Хяналтын самбар' },
  { to: '/attendance', icon: ScanFace,        label: 'Ирц бүртгэх'     },
  { to: '/schedules',  icon: CalendarDays,    label: 'Хуваарь'          },
  { to: '/students',   icon: Users,           label: 'Оюутнууд'         },
  { to: '/reports',    icon: BarChart3,       label: 'Тайлан'           },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate         = useNavigate()
  const [open, setOpen]  = useState(false)

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-card border-r border-border flex flex-col
        transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-primary-500 flex items-center justify-center">
            <ScanFace size={20} className="text-white" />
          </div>
          <div>
            <p className="font-semibold text-white leading-none">FaceAttend</p>
            <p className="text-xs text-slate-500 mt-0.5">Ирц систем</p>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
                 ${isActive
                   ? 'bg-primary-500/15 text-primary-400 border border-primary-500/20'
                   : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="px-3 pb-4 border-t border-border pt-3">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center">
              <GraduationCap size={15} className="text-primary-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 truncate">{user?.role}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="btn-danger w-full justify-center text-sm py-2">
            <LogOut size={15} /> Гарах
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center gap-4 px-6 py-4 border-b border-border bg-card/50 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="text-slate-400 hover:text-white">
            <Menu size={22} />
          </button>
          <span className="font-semibold text-white">FaceAttend</span>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
