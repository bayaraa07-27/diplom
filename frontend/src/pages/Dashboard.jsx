import { useState, useEffect } from 'react'
import { Users, ScanFace, UserCheck, UserX, TrendingUp, Clock } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'
import api from '../utils/api'
import { format, parseISO } from 'date-fns'
import { mn } from 'date-fns/locale'

export default function Dashboard() {
  const [overview, setOverview] = useState(null)
  const [trend,    setTrend]    = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/reports/overview'),
      api.get('/reports/daily-trend?days=14'),
    ]).then(([o, t]) => {
      setOverview(o.data)
      setTrend(t.data.trend)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSkeleton />

  const stats = [
    { label: 'Нийт оюутан',      value: overview?.total_students,   icon: Users,      color: 'text-blue-400',    bg: 'bg-blue-500/10'    },
    { label: 'Өнөөдөр ирсэн',    value: overview?.present_today,    icon: UserCheck,  color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Өнөөдөр ирээгүй',  value: overview?.total_students - overview?.present_today, icon: UserX, color: 'text-red-400', bg: 'bg-red-500/10' },
    { label: 'Царай бүртгэсэн',  value: overview?.enrolled_faces,   icon: ScanFace,   color: 'text-purple-400',  bg: 'bg-purple-500/10'  },
    { label: 'Ирцийн хувь',      value: `${overview?.attendance_rate}%`, icon: TrendingUp, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Нийт бүртгэл',     value: overview?.total_attendance, icon: Clock,      color: 'text-cyan-400',    bg: 'bg-cyan-500/10'    },
  ]

  return (
    <div className="fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Хяналтын самбар</h1>
        <p className="text-slate-500 text-sm mt-1">
          {format(new Date(), 'yyyy оны MM сарын dd', { locale: mn })} — өнөөдрийн байдал
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map(s => (
          <div key={s.label} className="stat-card">
            <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center`}>
              <s.icon size={20} className={s.color} />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{s.value ?? '—'}</p>
              <p className="text-sm text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="card p-6">
        <h2 className="font-semibold text-white mb-4">Сүүлийн 14 хоногийн ирц</h2>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="gPresent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#4f6ef7" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#4f6ef7" stopOpacity={0}   />
              </linearGradient>
              <linearGradient id="gLate" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#252840" />
            <XAxis dataKey="date" tickFormatter={d => format(parseISO(d), 'MM/dd')}
                   tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#181c2e', border: '1px solid #252840', borderRadius: 12 }}
              labelFormatter={d => format(parseISO(d), 'yyyy/MM/dd')}
              labelStyle={{ color: '#94a3b8' }}
              itemStyle={{ color: '#e2e8f0' }}
            />
            <Area type="monotone" dataKey="present" name="Ирсэн"   stroke="#4f6ef7" fill="url(#gPresent)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="late"    name="Хоцорсон" stroke="#f59e0b" fill="url(#gLate)"    strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Today's attendance list */}
      <TodayList />
    </div>
  )
}

function TodayList() {
  const [records, setRecords] = useState([])
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    api.get(`/attendance?date=${today}&limit=10`).then(r => setRecords(r.data.records))
  }, [])

  if (!records.length) return null

  return (
    <div className="card p-6">
      <h2 className="font-semibold text-white mb-4">Өнөөдрийн сүүлийн бүртгэлүүд</h2>
      <div className="space-y-2">
        {records.map(r => (
          <div key={r.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl
                                      bg-white/3 hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center
                              text-primary-400 text-sm font-medium">
                {r.student_name?.[0]}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">{r.student_name}</p>
                <p className="text-xs text-slate-500">{r.student_id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {r.late && <span className="badge-late">Хоцорсон</span>}
              <span className="badge-present">Ирсэн</span>
              <span className="text-xs text-slate-500 font-mono">
                {r.check_in ? format(new Date(r.check_in), 'HH:mm') : '—'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-64 bg-white/5 rounded-xl" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => <div key={i} className="card h-24" />)}
      </div>
      <div className="card h-72" />
    </div>
  )
}
