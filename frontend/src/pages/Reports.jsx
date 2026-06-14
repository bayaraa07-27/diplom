import { useState, useEffect, Fragment } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell
} from 'recharts'
import {
  BarChart3, Users, TrendingUp, BookOpen, ChevronDown, ChevronRight, Calendar
} from 'lucide-react'
import api from '../utils/api'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import toast from 'react-hot-toast'

const COLORS = ['#4f6ef7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

const DAY_MN = { Mon:'Даваа', Tue:'Мягмар', Wed:'Лхагва', Thu:'Пүрэв', Fri:'Баасан', Sat:'Бямба', Sun:'Ням' }

export default function Reports() {
  const [tab,  setTab]  = useState('overview')
  const [scheduleStats, setScheduleStats] = useState(null)
  const [trend, setTrend] = useState([])

  // Date range filter
  const today = new Date()
  const monthStart = startOfMonth(today)
  const [startDate, setStartDate] = useState(format(monthStart, 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(today), 'yyyy-MM-dd'))

  // Student tab
  const [studentId, setStudentId] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
  const [studentSuggestions, setStudentSuggestions] = useState([])
  const [studentReport, setStudentReport] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get(`/reports/schedules?start_date=${startDate}&end_date=${endDate}`).then(r => setScheduleStats(r.data))
    api.get('/reports/daily-trend?days=30').then(r => setTrend(r.data.trend))
  }, [startDate, endDate])

  const fetchStudentReport = async (sid) => {
    const id = sid || studentId
    if (!id) return
    setLoading(true)
    setStudentSuggestions([])
    try {
      const { data } = await api.get(`/reports/student/${id}?start_date=${startDate}&end_date=${endDate}`)
      setStudentReport(data)
    } catch { setStudentReport(null); toast.error('Оюутан олдсонгүй') }
    finally { setLoading(false) }
  }

  const handleStudentSearch = async (val) => {
    setStudentSearch(val)
    setStudentId('')
    if (val.length < 2) { setStudentSuggestions([]); return }
    try {
      const { data } = await api.get(`/students/?search=${val}&limit=6`)
      setStudentSuggestions(data.students || [])
    } catch { setStudentSuggestions([]) }
  }

  const selectSuggestion = (s) => {
    setStudentSearch(s.name)
    setStudentId(s.student_id)
    setStudentSuggestions([])
    fetchStudentReport(s.student_id)
  }

  // Schedule student breakdown
  const [expandedSchId, setExpandedSchId]   = useState(null)
  const [schStudentData, setSchStudentData] = useState({})
  const [schLoadingId,   setSchLoadingId]   = useState(null)

  const toggleSchedule = async (schId) => {
    if (expandedSchId === schId) { setExpandedSchId(null); return }
    setExpandedSchId(schId)
    const cacheKey = `${schId}_${startDate}_${endDate}`
    if (schStudentData[cacheKey]) return
    setSchLoadingId(schId)
    try {
      const { data } = await api.get(`/reports/schedule/${schId}/students?start_date=${startDate}&end_date=${endDate}`)
      setSchStudentData(prev => ({ ...prev, [cacheKey]: data }))
    } catch { toast.error('Мэдээлэл авахад алдаа гарлаа') }
    finally { setSchLoadingId(null) }
  }

  // Clear cached data when date range changes
  useEffect(() => { setSchStudentData({}); setExpandedSchId(null) }, [startDate, endDate])

  const tabs = [
    { id: 'overview', label: 'Ерөнхий', icon: BarChart3 },
    { id: 'dept',     label: 'Хичээл',  icon: BookOpen  },
    { id: 'student',  label: 'Оюутан',  icon: Users     },
  ]

  return (
    <div className="fade-in space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Тайлан & Статистик</h1>
          <p className="text-slate-500 text-sm mt-1">Ирцийн мэдээлэл, дүн шинжилгээ</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
            <Calendar size={16} className="text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-transparent text-sm text-white focus:outline-none min-w-40"
            />
          </div>
          <span className="text-slate-500 self-center">→</span>
          <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-transparent text-sm text-white focus:outline-none min-w-40"
            />
          </div>
        </div>
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

      {/* ── Overview ── */}
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

      {/* ── Schedules (Хичээл) tab ── */}
      {tab === 'dept' && scheduleStats && (
        <div className="space-y-5">
          <div className="card p-6">
            <h2 className="font-semibold text-white mb-4">
              Хичээлийн ирцийн харьцуулалт — {startDate} / {endDate}
            </h2>
            <ResponsiveContainer
              width="100%"
              height={Math.max(260, scheduleStats.schedules.length * 38)}
            >
              <BarChart
                data={scheduleStats.schedules.map(s => ({
                  ...s,
                  label: `${s.subject} (${DAY_MN[s.day] || s.day})`,
                }))}
                layout="vertical"
                margin={{ left: 8, right: 32, top: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#252840" />
                <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={190}
                       tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#181c2e', border: '1px solid #252840', borderRadius: 12 }}
                  formatter={(v, _n, p) => [`${v}%  (${p.payload.attended}/${p.payload.enrolled})`, 'Ирцийн %']}
                  itemStyle={{ color: '#e2e8f0' }} labelStyle={{ color: '#94a3b8' }}
                />
                <Bar dataKey="rate" name="Ирцийн %" radius={[0, 4, 4, 0]}>
                  {scheduleStats.schedules.map((s, i) => (
                    <Cell key={s.id} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-white mb-3">Хичээлийн дэлгэрэнгүй</h2>
            <p className="text-xs text-slate-500 mb-3">Мөр дарж тухайн хичээлийн оюутны ирцийг харна уу</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['', 'Хичээл', 'Өдөр / Цаг', 'Өрөө', 'Тэнхим', 'Курс', 'Бүртгэлтэй', 'Ирцийн %'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-slate-500 text-xs font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scheduleStats.schedules.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-slate-500 text-sm">Хичээл олдсонгүй</td>
                    </tr>
                  ) : scheduleStats.schedules.map(s => {
                    const isExpanded = expandedSchId === s.id
                    const detail     = schStudentData[`${s.id}_${startDate}_${endDate}`]
                    const isLoading  = schLoadingId === s.id
                    return (
                      <Fragment key={s.id}>
                        <tr
                          onClick={() => toggleSchedule(s.id)}
                          className={`border-t border-border cursor-pointer transition-colors
                            ${isExpanded ? 'bg-primary-500/5' : 'hover:bg-white/3'}
                            ${!s.is_active ? 'opacity-50' : ''}`}
                        >
                          <td className="px-3 py-2.5 w-8">
                            {isLoading
                              ? <div className="w-3.5 h-3.5 border border-primary-500 border-t-transparent rounded-full animate-spin" />
                              : isExpanded
                                ? <ChevronDown size={14} className="text-primary-400" />
                                : <ChevronRight size={14} className="text-slate-500" />
                            }
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-200 font-medium">{s.subject}</span>
                              {!s.is_active && <span className="text-xs text-slate-600 italic">(идэвхгүй)</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            <span className="text-slate-400">{DAY_MN[s.day] || s.day}</span>
                            <span className="block font-mono text-slate-500">{s.start_time}–{s.end_time}</span>
                          </td>
                          <td className="px-3 py-2.5 text-slate-400 text-xs">{s.room}</td>
                          <td className="px-3 py-2.5 text-slate-400 text-xs">{s.department}</td>
                          <td className="px-3 py-2.5 text-slate-400 text-xs">{s.year}-р курс</td>
                          <td className="px-3 py-2.5 text-slate-400">{s.enrolled}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-white/10 rounded-full h-1.5 max-w-24">
                                <div className="bg-primary-500 h-1.5 rounded-full" style={{ width: `${Math.min(s.rate, 100)}%` }} />
                              </div>
                              <span className={`text-xs font-medium ${s.rate >= 75 ? 'text-emerald-400' : s.rate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                                {s.rate}%
                              </span>
                            </div>
                          </td>
                        </tr>

                        {/* ── Expanded: per-student breakdown ── */}
                        {isExpanded && (
                          <tr key={s.id + '-detail'}>
                            <td colSpan={8} className="bg-white/2 border-t border-border px-4 py-4">
                              {isLoading || !detail ? (
                                <div className="text-center text-slate-500 text-xs py-4 animate-pulse">Уншиж байна…</div>
                              ) : (
                                <div className="space-y-3">
                                  {/* Header */}
                                  <div className="flex items-center gap-3 flex-wrap">
                                    <span className="text-xs font-medium text-slate-300">
                                      {detail.schedule.subject}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full bg-primary-500/15 text-primary-300 text-xs">
                                      {detail.total_sessions} оролт
                                    </span>
                                    <span className="text-xs text-slate-500">
                                      {detail.enrolled} оюутан бүртгэлтэй
                                    </span>
                                    {detail.session_dates.length > 0 && (
                                      <span className="text-xs text-slate-600 ml-auto">
                                        {detail.session_dates[0]} — {detail.session_dates[detail.session_dates.length - 1]}
                                      </span>
                                    )}
                                  </div>

                                  {detail.students.length === 0 ? (
                                    <p className="text-slate-500 text-xs text-center py-4">Оюутан олдсонгүй</p>
                                  ) : (
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="border-b border-white/5">
                                          <th className="text-left py-1.5 text-slate-500 font-medium">Оюутан</th>
                                          <th className="text-left py-1.5 text-slate-500 font-medium">Тэнхим</th>
                                          <th className="text-center py-1.5 text-slate-500 font-medium">Ирсэн / Нийт</th>
                                          <th className="text-center py-1.5 text-slate-500 font-medium">Хоцорсон</th>
                                          <th className="py-1.5 text-slate-500 font-medium w-40">Ирцийн хувь</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-white/3">
                                        {detail.students.map(st => (
                                          <tr key={st.student_id} className="hover:bg-white/3 transition-colors">
                                            <td className="py-2 pr-3">
                                              <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center
                                                                text-primary-400 font-medium flex-shrink-0">
                                                  {st.name?.[0] ?? '?'}
                                                </div>
                                                <span className="text-slate-200">{st.name}</span>
                                              </div>
                                            </td>
                                            <td className="py-2 pr-3 text-slate-500">{st.department}</td>
                                            <td className="py-2 text-center">
                                              <span className={st.attended === 0 ? 'text-red-400' : 'text-slate-300'}>
                                                {st.attended}
                                              </span>
                                              <span className="text-slate-600"> / {detail.total_sessions}</span>
                                            </td>
                                            <td className="py-2 text-center">
                                              {st.late > 0
                                                ? <span className="text-amber-400">{st.late}</span>
                                                : <span className="text-slate-600">—</span>
                                              }
                                            </td>
                                            <td className="py-2">
                                              <div className="flex items-center gap-2">
                                                <div className="flex-1 bg-white/10 rounded-full h-1">
                                                  <div
                                                    className={`h-1 rounded-full transition-all ${
                                                      st.rate >= 75 ? 'bg-emerald-500' :
                                                      st.rate >= 50 ? 'bg-amber-500'   : 'bg-red-500'
                                                    }`}
                                                    style={{ width: `${st.rate}%` }}
                                                  />
                                                </div>
                                                <span className={`w-10 text-right font-medium ${
                                                  st.rate >= 75 ? 'text-emerald-400' :
                                                  st.rate >= 50 ? 'text-amber-400'   : 'text-red-400'
                                                }`}>
                                                  {st.rate}%
                                                </span>
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Student tab ── */}
      {tab === 'student' && (
        <div className="space-y-4">
          <div className="card p-5 flex gap-3">
            <div className="relative flex-1">
              <input
                className="input w-full"
                placeholder="Оюутны нэр эсвэл дугаараар хайх..."
                value={studentSearch}
                onChange={e => handleStudentSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchStudentReport()}
              />
              {studentSuggestions.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 card border border-border shadow-xl overflow-hidden">
                  {studentSuggestions.map(s => (
                    <button
                      key={s.student_id}
                      onClick={() => selectSuggestion(s)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-left transition-colors"
                    >
                      <div className="w-7 h-7 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-400 text-xs font-medium flex-shrink-0">
                        {s.name[0]}
                      </div>
                      <div>
                        <p className="text-sm text-slate-200">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.student_id} · {s.department}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => fetchStudentReport()} disabled={loading || !studentId} className="btn-primary">
              <TrendingUp size={16} /> Хайх
            </button>
          </div>

          {studentReport && (
            <div className="space-y-4 fade-in">
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

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {[
                  { label: 'Ажлын өдөр', value: studentReport.work_days,              color: 'text-slate-300'   },
                  { label: 'Ирсэн',      value: studentReport.present,                color: 'text-emerald-400' },
                  { label: 'Ирээгүй',    value: studentReport.absent,                 color: 'text-red-400'     },
                  { label: 'Хоцорсон',   value: studentReport.late,                   color: 'text-amber-400'   },
                  { label: 'Өвчтэй',     value: studentReport.sick    ?? 0,            color: 'text-purple-400'  },
                  { label: 'Чөлөөтэй',   value: studentReport.excused ?? 0,            color: 'text-sky-400'     },
                ].map(s => (
                  <div key={s.label} className="card p-4 text-center">
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-slate-500 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="card p-5">
                <h3 className="font-semibold text-white mb-3">{startDate} → {endDate} ирцийн дэлгэрэнгүй</h3>
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {studentReport.attendance_list.length === 0 ? (
                    <p className="text-center text-slate-500 py-6 text-sm">Энэ сард ирц бүртгэл алга</p>
                  ) : studentReport.attendance_list.map(a => (
                    <div key={a.date} className="flex items-center justify-between py-2 px-3 rounded-lg
                                                  hover:bg-white/5 text-sm">
                      <span className="text-slate-400 font-mono text-xs">{a.date}</span>
                      <div className="flex items-center gap-2">
                        {a.late && a.status === 'present' && <span className="badge-late">Хоцорсон</span>}
                        {a.status === 'present' && <span className="badge-present">Ирсэн</span>}
                        {a.status === 'absent'  && <span className="badge-absent">Ирсэнгүй</span>}
                        {a.status === 'sick'    && <span className="badge-sick">Өвчтэй</span>}
                        {a.status === 'excused' && <span className="badge-excused">Чөлөөтэй</span>}
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
