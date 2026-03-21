import { useState, useEffect } from 'react'
import { Clock, Plus, Pencil, Trash2, CalendarDays, BookOpen, MapPin, Users } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'

const DAYS = [
  { value: 'Mon', label: 'Даваа' },
  { value: 'Tue', label: 'Мягмар' },
  { value: 'Wed', label: 'Лхагва' },
  { value: 'Thu', label: 'Пүрэв' },
  { value: 'Fri', label: 'Баасан' },
  { value: 'Sat', label: 'Бямба' },
]

const DAY_COLORS = {
  Mon: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Tue: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Wed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Thu: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Fri: 'bg-coral-500/10 text-red-400 border-red-500/20',
  Sat: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
}

export default function Schedules() {
  const [schedules, setSchedules] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [filterDay, setFilterDay] = useState('all')
  const [delId,     setDelId]     = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/schedules/')
      setSchedules(data.schedules)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async id => {
    try {
      await api.delete(`/schedules/${id}`)
      toast.success('Хуваарь устгагдлаа')
      setDelId(null)
      load()
    } catch { toast.error('Устгахад алдаа гарлаа') }
  }

  const filtered = filterDay === 'all'
    ? schedules
    : schedules.filter(s => s.day === filterDay)

  // Group by day
  const grouped = DAYS.reduce((acc, d) => {
    acc[d.value] = filtered.filter(s => s.day === d.value)
    return acc
  }, {})

  return (
    <div className="fade-in space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Хичээлийн хуваарь</h1>
          <p className="text-slate-500 text-sm mt-1">Нийт {schedules.length} хичээл бүртгэлтэй</p>
        </div>
        <button onClick={() => { setEditing(null); setModal(true) }} className="btn-primary">
          <Plus size={17} /> Хуваарь нэмэх
        </button>
      </div>

      {/* Day filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilterDay('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all
            ${filterDay === 'all' ? 'bg-primary-500 text-white' : 'text-slate-400 hover:text-slate-200 bg-white/5'}`}
        >
          Бүгд
        </button>
        {DAYS.map(d => (
          <button
            key={d.value}
            onClick={() => setFilterDay(d.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all
              ${filterDay === d.value ? 'bg-primary-500 text-white' : 'text-slate-400 hover:text-slate-200 bg-white/5'}`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Schedule grid by day */}
      {loading ? (
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="card h-32 animate-pulse" />)}
        </div>
      ) : schedules.length === 0 ? (
        <div className="card p-12 text-center">
          <CalendarDays size={40} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Хуваарь байхгүй байна</p>
          <p className="text-slate-600 text-sm mt-1">Хуваарь нэмэх товч дарж эхлүүлнэ үү</p>
        </div>
      ) : (
        <div className="space-y-6">
          {DAYS.map(d => {
            const daySchedules = grouped[d.value]
            if (filterDay !== 'all' && filterDay !== d.value) return null
            if (daySchedules.length === 0 && filterDay !== 'all') return null
            if (daySchedules.length === 0) return null
            return (
              <div key={d.value}>
                <h2 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs border ${DAY_COLORS[d.value]}`}>
                    {d.label}
                  </span>
                  <span>{daySchedules.length} хичээл</span>
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {daySchedules.sort((a, b) => a.start_time.localeCompare(b.start_time)).map(s => (
                    <ScheduleCard
                      key={s.id}
                      schedule={s}
                      onEdit={() => { setEditing(s); setModal(true) }}
                      onDelete={() => setDelId(s.id)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <ScheduleModal
          schedule={editing}
          onClose={() => { setModal(false); setEditing(null) }}
          onSaved={() => { setModal(false); setEditing(null); load() }}
        />
      )}

      {delId && (
        <ConfirmModal
          onConfirm={() => handleDelete(delId)}
          onCancel={() => setDelId(null)}
        />
      )}
    </div>
  )
}

function ScheduleCard({ schedule: s, onEdit, onDelete }) {
  return (
    <div className="card p-4 hover:border-primary-500/30 transition-all group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-500/15 flex items-center justify-center">
            <BookOpen size={15} className="text-primary-400" />
          </div>
          <div>
            <p className="font-medium text-slate-200 text-sm">{s.subject}</p>
            <p className="text-xs text-slate-500">{s.department} · {s.year}-р курс</p>
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit}   className="p-1.5 rounded-lg hover:bg-blue-500/20 text-slate-500 hover:text-blue-400 transition-colors"><Pencil size={13} /></button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/20  text-slate-500 hover:text-red-400  transition-colors"><Trash2 size={13} /></button>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Clock size={12} className="text-primary-400" />
          <span className="font-mono">{s.start_time} – {s.end_time}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <MapPin size={12} className="text-emerald-400" />
          <span>{s.room}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Users size={12} className="text-amber-400" />
          <span>{s.department} {s.year}-р курс</span>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
        <span className="text-xs text-slate-500">
          Хоцролт: {s.late_after_minutes} мин-ын дараа
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full border
          ${s.is_active
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            : 'bg-slate-500/10 text-slate-500 border-slate-500/20'}`}>
          {s.is_active ? 'Идэвхтэй' : 'Идэвхгүй'}
        </span>
      </div>
    </div>
  )
}

function ScheduleModal({ schedule, onClose, onSaved }) {
  const [form, setForm] = useState({
    subject:            schedule?.subject            || '',
    start_time:         schedule?.start_time         || '08:00',
    end_time:           schedule?.end_time           || '09:30',
    day:                schedule?.day                || 'Mon',
    room:               schedule?.room               || '',
    department:         schedule?.department         || '',
    year:               schedule?.year               || '1',
    late_after_minutes: schedule?.late_after_minutes || 15,
  })
  const [busy, setBusy] = useState(false)

  const handleSubmit = async e => {
    e.preventDefault()
    setBusy(true)
    try {
      if (schedule) {
        await api.put(`/schedules/${schedule.id}`, form)
        toast.success('Хуваарь шинэчлэгдлээ')
      } else {
        await api.post('/schedules/', form)
        toast.success('Хуваарь нэмэгдлээ')
      }
      onSaved()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Алдаа гарлаа')
    } finally { setBusy(false) }
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-lg p-6 fade-in max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-white mb-5">
          {schedule ? 'Хуваарь засах' : 'Хуваарь нэмэх'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Subject */}
          <div>
            <label className="label">Хичээлийн нэр</label>
            <input className="input" placeholder="жнь: Математик I" value={form.subject}
              onChange={e => f('subject', e.target.value)} required />
          </div>

          {/* Day */}
          <div>
            <label className="label">Гараг</label>
            <div className="grid grid-cols-3 gap-2">
              {DAYS.map(d => (
                <button key={d.value} type="button"
                  onClick={() => f('day', d.value)}
                  className={`py-2 rounded-xl text-sm font-medium border transition-all
                    ${form.day === d.value
                      ? 'bg-primary-500 text-white border-primary-500'
                      : 'bg-white/5 text-slate-400 border-border hover:border-primary-500/50'}`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Эхлэх цаг</label>
              <input type="time" className="input font-mono" value={form.start_time}
                onChange={e => f('start_time', e.target.value)} required />
            </div>
            <div>
              <label className="label">Дуусах цаг</label>
              <input type="time" className="input font-mono" value={form.end_time}
                onChange={e => f('end_time', e.target.value)} required />
            </div>
          </div>

          {/* Room */}
          <div>
            <label className="label">Өрөө / Байр</label>
            <input className="input" placeholder="жнь: А-201" value={form.room}
              onChange={e => f('room', e.target.value)} required />
          </div>

          {/* Department & Year */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Тэнхим</label>
              <input className="input" placeholder="жнь: Мэдээлэл зүй" value={form.department}
                onChange={e => f('department', e.target.value)} required />
            </div>
            <div>
              <label className="label">Курс</label>
              <select className="input" value={form.year} onChange={e => f('year', e.target.value)}>
                {[1,2,3,4,5,6].map(y => <option key={y} value={y}>{y}-р курс</option>)}
              </select>
            </div>
          </div>

          {/* Late threshold */}
          <div>
            <label className="label">
              Хоцролтын хязгаар —
              <span className="text-primary-400 font-medium ml-1">
                хичээл эхэлснээс {form.late_after_minutes} минутын дараа хоцорсон гэж тооцно
              </span>
            </label>
            <div className="flex items-center gap-3">
              <input type="range" min="5" max="60" step="5"
                value={form.late_after_minutes}
                onChange={e => f('late_after_minutes', parseInt(e.target.value))}
                className="flex-1"
              />
              <span className="text-primary-400 font-mono font-medium w-16 text-right">
                {form.late_after_minutes} мин
              </span>
            </div>
            <div className="flex justify-between text-xs text-slate-600 mt-1">
              <span>5 мин</span><span>30 мин</span><span>60 мин</span>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Болих</button>
            <button type="submit" disabled={busy} className="btn-primary flex-1 justify-center">
              {busy ? 'Хадгалж байна...' : 'Хадгалах'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ConfirmModal({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-sm p-6 fade-in text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
          <Trash2 size={22} className="text-red-400" />
        </div>
        <p className="text-slate-200 mb-5">Энэ хуваарийг устгах уу?</p>
        <div className="flex gap-2">
          <button onClick={onCancel}  className="btn-secondary flex-1 justify-center">Болих</button>
          <button onClick={onConfirm} className="btn-danger    flex-1 justify-center">Устгах</button>
        </div>
      </div>
    </div>
  )
}
