import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, Legend
} from 'recharts'
import { BarChart3, Users, TrendingUp, Building2 } from 'lucide-react'
import api from '../utils/api'
import { format, parseISO } from 'date-fns'

const COLORS = ['#4f6ef7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

export default function Reports() {
  const [tab,  setTab]  = useState('overview')
  const [dept, setDept] = useState(null)
  const [trend, setTrend] = useState([])
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [studentId, setStudentId] = useState('')
  const [studentReport, setStudentReport] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/reports/department?month=' + month).then(r => setDept(r.data))
    api.get('/reports/daily-trend?days=30').then(r => setTrend(r.data.trend))
  }, [month])

  const fetchStudentReport = async () => {
    if (!studentId) return
    setLoading(true)
    try {
      const { data } = await api.get(`/reports/student/${studentId}?month=${month}`)
      setStudentReport(data)
    } catch { setStudentReport(null) }
    finally { setLoading(false) }
  }

  const tabs = [
    { id: 'overview',  label: 'Ерөнхий',    icon: BarChart3  },
    { id: 'dept',      label: 'Тэнхим',      icon: Building2  },
    { id: 'student',   label: 'Оюутан',      icon: Users      },
  ]

  return (
    <div className="fade-in space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Тайлан & Статистик</h1>
          <p className="text-slate-500 text-sm mt-1">Ирцийн мэдээлэл, дүн шинжилгээ</p>
        </div>
        <input
          type="month"
          className="input w-auto"
          value={month}
          onChange={e => setMonth(e.target.value)}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === t.id ? 'bg-primary-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="card p-6">
            <h2 className="font-semibold text-white mb-4">Сүүлийн 30 хоногийн ирц</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252840" />
                <XAxis dataKey="date" tickFormatter={d => format(parseISO(d), 'MM/dd')}
                       tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#181c2e', border: '1px solid #252840', borderRadius: 12 }}
                  labelFormatter={d => format(parseISO(d), 'yyyy/MM/dd')}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Bar dataKey="present" name="Ирсэн"    fill="#4f6ef7" radius={[4,4,0,0]} />
                <Bar dataKey="late"    name="Хоцорсон" fill="#f59e0b" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Department tab */}
      {tab === 'dept' && dept && (
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="card p-6">
            <h2 className="font-semibold text-white mb-4">Тэнхимийн ирцийн харьцуулалт</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dept.departments} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252840" />
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} />
                <YAxis type="category" dataKey="department" width={100}
                       tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#181c2e', border: '1px solid #252840', borderRadius: 12 }}
                  itemStyle={{ color: '#e2e8f0' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Bar dataKey="rate" name="Ирцийн %" fill="#4f6ef7" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold text-white mb-4">Тэнхимийн оюутны тоо</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={dept.departments}
                  dataKey="total_students"
                  nameKey="department"
                  cx="50%" cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {dept.departments.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#181c2e', border: '1px solid #252840', borderRadius: 12 }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-5 lg:col-span-2">
            <h2 className="font-semibold text-white mb-3">Дэлгэрэнгүй</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Тэнхим', 'Нийт оюутан', 'Нийт ирц', 'Ирцийн %'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-slate-500 text-xs font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dept.departments.map(d => (
                    <tr key={d.department} className="hover:bg-white/3">
                      <td className="px-3 py-2.5 text-slate-200 font-medium">{d.department}</td>
                      <td className="px-3 py-2.5 text-slate-400">{d.total_students}</td>
                      <td className="px-3 py-2.5 text-slate-400">{d.total_present}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-white/10 rounded-full h-1.5 max-w-24">
                            <div className="bg-primary-500 h-1.5 rounded-full" style={{ width: `${Math.min(d.rate,100)}%` }} />
                          </div>
                          <span className="text-slate-300 text-xs">{d.rate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Student tab */}
      {tab === 'student' && (
        <div className="space-y-4">
          <div className="card p-5 flex gap-3">
            <input
              className="input flex-1"
              placeholder="Оюутны дугаар оруулах..."
              value={studentId}
              onChange={e => setStudentId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchStudentReport()}
            />
            <button onClick={fetchStudentReport} disabled={loading} className="btn-primary">
              <TrendingUp size={16} /> Хайх
            </button>
          </div>

          {studentReport && (
            <div className="space-y-4 fade-in">
              {/* Student info */}
              <div className="card p-5 flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-primary-500/20 flex items-center justify-center
                                text-primary-400 text-2xl font-bold">
                  {studentReport.student.name[0]}
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-white">{studentReport.student.name}</h2>
                  <p className="text-sm text-slate-500">{studentReport.student.department} · {studentReport.student.id}</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-primary-400">{studentReport.rate}%</p>
                  <p className="text-xs text-slate-500">Ирцийн хувь</p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Ажлын өдөр', value: studentReport.work_days, color: 'text-slate-300' },
                  { label: 'Ирсэн',      value: studentReport.present,   color: 'text-emerald-400' },
                  { label: 'Ирээгүй',    value: studentReport.absent,    color: 'text-red-400' },
                  { label: 'Хоцорсон',   value: studentReport.late,      color: 'text-amber-400' },
                ].map(s => (
                  <div key={s.label} className="card p-4 text-center">
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-slate-500 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Attendance list */}
              <div className="card p-5">
                <h3 className="font-semibold text-white mb-3">{month}-р сарын ирцийн дэлгэрэнгүй</h3>
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {studentReport.attendance_list.length === 0 ? (
                    <p className="text-center text-slate-500 py-6 text-sm">Энэ сард ирц бүртгэл алга</p>
                  ) : studentReport.attendance_list.map(a => (
                    <div key={a.date} className="flex items-center justify-between py-2 px-3 rounded-lg
                                                  hover:bg-white/5 text-sm">
                      <span className="text-slate-400 font-mono text-xs">{a.date}</span>
                      <div className="flex items-center gap-2">
                        {a.late && <span className="badge-late">Хоцорсон</span>}
                        <span className={a.status === 'present' ? 'badge-present' : 'badge-absent'}>
                          {a.status === 'present' ? 'Ирсэн' : 'Ирээгүй'}
                        </span>
                        {a.check_in && (
                          <span className="text-xs text-slate-500 font-mono">
                            {format(new Date(a.check_in), 'HH:mm')}
                            {a.check_out ? ` → ${format(new Date(a.check_out), 'HH:mm')}` : ''}
                            {a.duration_minutes ? ` (${a.duration_minutes}мин)` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
