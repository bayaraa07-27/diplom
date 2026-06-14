import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, Search, ScanFace, Pencil, Trash2, CheckCircle, XCircle, ChevronLeft, ChevronRight, ScanLine, BookOpen } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import Dropdown from '../components/Dropdown'

export default function Students() {
  const navigate              = useNavigate()
  const [students, setStudents] = useState([])
  const [total,    setTotal]  = useState(0)
  const [page,     setPage]   = useState(1)
  const [pages,    setPages]  = useState(1)
  const [search,   setSearch] = useState('')
  const [loading,  setLoading] = useState(true)
  const [modal,      setModal]      = useState(null) // null | 'add' | student obj
  const [delId,      setDelId]      = useState(null)
  const [faceResetId,   setFaceResetId]   = useState(null)
  const [scheduleModal, setScheduleModal] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/students/?page=${page}&search=${search}`)
      setStudents(data.students)
      setTotal(data.total)
      setPages(data.pages)
    } finally { setLoading(false) }
  }, [page, search])

  useEffect(() => { load() }, [load])

  const handleDelete = async id => {
    try {
      await api.delete(`/students/${id}`)
      toast.success('Оюутан устгагдлаа')
      setDelId(null)
      load()
    } catch { toast.error('Устгахад алдаа гарлаа') }
  }

  const handleFaceReset = async id => {
    try {
      await api.delete(`/students/${id}/enroll-face`)
      toast.success('Царайны бүртгэл устгагдлаа')
      setFaceResetId(null)
      load()
    } catch { toast.error('Царай устгахад алдаа гарлаа') }
  }

  return (
    <div className="fade-in space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Оюутнууд</h1>
          <p className="text-slate-500 text-sm mt-1">Нийт {total} оюутан бүртгэлтэй</p>
        </div>
        <button onClick={() => setModal('add')} className="btn-primary">
          <UserPlus size={17} /> Оюутан нэмэх
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          className="input pl-10"
          placeholder="Нэр, оюутны дугаараар хайх..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Оюутан', 'Дугаар', 'Тэнхим', 'Курс', 'Царай', 'Үйлдэл'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-slate-500 font-medium text-xs uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-4 py-3">
                    <div className="h-4 bg-white/5 rounded animate-pulse w-full" />
                  </td></tr>
                ))
              ) : students.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  Оюутан олдсонгүй
                </td></tr>
              ) : students.map(s => (
                <tr key={s.id} className="hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center
                                      text-primary-400 text-sm font-medium flex-shrink-0">
                        {s.name[0]}
                      </div>
                      <div>
                        <p className="font-medium text-slate-200">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-400 text-xs">{s.student_id}</td>
                  <td className="px-4 py-3 text-slate-400">{s.department}</td>
                  <td className="px-4 py-3 text-slate-400">{s.year}-р курс</td>
                  <td className="px-4 py-3">
                    {s.face_enrolled
                      ? <span className="flex items-center gap-1 text-emerald-400 text-xs"><CheckCircle size={13} /> Бүртгэгдсэн</span>
                      : <span className="flex items-center gap-1 text-red-400 text-xs"><XCircle size={13} /> Бүртгэгдээгүй</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => navigate(`/enroll/${s.student_id}`)}
                        title="Царай бүртгэх"
                        className="p-1.5 rounded-lg hover:bg-purple-500/20 text-slate-500 hover:text-purple-400 transition-colors"
                      ><ScanFace size={15} /></button>
                      <button
                        onClick={() => setScheduleModal(s)}
                        title="Хичээл бүртгэх"
                        className="p-1.5 rounded-lg hover:bg-teal-500/20 text-slate-500 hover:text-teal-400 transition-colors"
                      ><BookOpen size={15} /></button>
                      {s.face_enrolled && (
                        <button
                          onClick={() => setFaceResetId(s.student_id)}
                          title="Царайны бүртгэл устгах"
                          className="p-1.5 rounded-lg hover:bg-orange-500/20 text-slate-500 hover:text-orange-400 transition-colors"
                        ><ScanLine size={15} /></button>
                      )}
                      <button
                        onClick={() => setModal(s)}
                        title="Засах"
                        className="p-1.5 rounded-lg hover:bg-blue-500/20 text-slate-500 hover:text-blue-400 transition-colors"
                      ><Pencil size={15} /></button>
                      <button
                        onClick={() => setDelId(s.student_id)}
                        title="Устгах"
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                      ><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-slate-500">{total} оюутнаас {(page-1)*20+1}–{Math.min(page*20,total)}</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => p-1)} disabled={page===1} className="btn-secondary p-2 disabled:opacity-30">
                <ChevronLeft size={15} />
              </button>
              <button onClick={() => setPage(p => p+1)} disabled={page===pages} className="btn-secondary p-2 disabled:opacity-30">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <StudentModal
          student={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}

      {/* Delete Confirm */}
      {delId && (
        <ConfirmModal
          message="Энэ оюутан болон ирц бүртгэлийг устгах уу?"
          onConfirm={() => handleDelete(delId)}
          onCancel={() => setDelId(null)}
        />
      )}

      {/* Face Reset Confirm */}
      {faceResetId && (
        <ConfirmModal
          message="Энэ оюутаны царайны бүртгэлийг устгах уу? Дахин бүртгэх шаардлагатай болно."
          icon={<ScanLine size={22} className="text-orange-400" />}
          iconBg="bg-orange-500/15"
          confirmLabel="Устгах"
          onConfirm={() => handleFaceReset(faceResetId)}
          onCancel={() => setFaceResetId(null)}
        />
      )}

      {/* Schedule Enrollment Modal */}
      {scheduleModal && (
        <ScheduleModal
          student={scheduleModal}
          onClose={() => setScheduleModal(null)}
        />
      )}
    </div>
  )
}

function StudentModal({ student, onClose, onSaved }) {
  const [form, setForm] = useState({
    student_id: student?.student_id || '',
    name:       student?.name       || '',
    department: student?.department || '',
    year:       student?.year       || '',
    email:      student?.email      || '',
    phone:      student?.phone      || '',
  })
  const [busy, setBusy] = useState(false)

  const handleSubmit = async e => {
    e.preventDefault()
    setBusy(true)
    try {
      if (student) {
        await api.put(`/students/${student.student_id}`, form)
        toast.success('Амжилттай шинэчлэгдлээ')
      } else {
        await api.post('/students/', form)
        toast.success('Оюутан нэмэгдлээ')
      }
      onSaved()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Алдаа гарлаа')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-md p-6 fade-in">
        <h2 className="text-lg font-semibold text-white mb-5">
          {student ? 'Оюутан засах' : 'Оюутан нэмэх'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Нэр</label>
              <input className="input" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} required />
            </div>
            <div>
              <label className="label">Оюутны дугаар</label>
              <input className="input" value={form.student_id} onChange={e => setForm(f=>({...f,student_id:e.target.value}))} required disabled={!!student} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Тэнхим</label>
              <input className="input" value={form.department} onChange={e => setForm(f=>({...f,department:e.target.value}))} required />
            </div>
            <div>
              <label className="label">Курс</label>
              <Dropdown
                value={String(form.year)}
                onChange={val => setForm(f => ({ ...f, year: val }))}
                placeholder="Сонгох"
                options={[1,2,3,4,5,6].map(y => ({ value: String(y), label: `${y}-р курс` }))}
              />
            </div>
          </div>
          <div>
            <label className="label">Имэйл</label>
            <input type="email" className="input" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} />
          </div>
          <div>
            <label className="label">Утас</label>
            <input className="input" value={form.phone} onChange={e => setForm(f=>({...f,phone:e.target.value}))} />
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

function ConfirmModal({ message, onConfirm, onCancel, icon, iconBg, confirmLabel = 'Устгах' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-sm p-6 fade-in text-center">
        <div className={`w-12 h-12 rounded-full ${iconBg || 'bg-red-500/15'} flex items-center justify-center mx-auto mb-4`}>
          {icon || <Trash2 size={22} className="text-red-400" />}
        </div>
        <p className="text-slate-200 mb-5">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel}  className="btn-secondary flex-1 justify-center">Болих</button>
          <button onClick={onConfirm} className="btn-danger    flex-1 justify-center">{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

const DAY_MN = { Mon:'Даваа', Tue:'Мягмар', Wed:'Лхагва', Thu:'Пүрэв', Fri:'Баасан', Sat:'Бямба', Sun:'Ням' }

function ScheduleModal({ student, onClose }) {
  const [allSchedules, setAllSchedules] = useState([])
  const [selectedIds,  setSelectedIds]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  useEffect(() => {
    let cancelled = false
    const fetchData = async () => {
      setLoading(true)
      setError('')
      try {
        const [allRes, enrolledRes] = await Promise.all([
          api.get('/schedules/'),
          api.get(`/students/${student.student_id}/schedules`),
        ])
        if (!cancelled) {
          setAllSchedules(allRes.data.schedules || [])
          setSelectedIds(enrolledRes.data.schedule_ids || [])
        }
      } catch {
        if (!cancelled) setError('Өгөгдөл ачааллахад алдаа гарлаа')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [student.student_id])

  const toggleSchedule = id =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await api.put(`/students/${student.student_id}/schedules`, { schedule_ids: selectedIds })
      toast.success('Хичээлийн бүртгэл хадгалагдлаа')
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Хадгалахад алдаа гарлаа')
    } finally { setSaving(false) }
  }

  const formatLabel = s =>
    `${s.subject} — ${DAY_MN[s.day] || s.day} ${s.start_time}–${s.end_time}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-lg p-6 fade-in flex flex-col gap-4 max-h-[80vh]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <BookOpen size={18} className="text-teal-400" />
            {student.name} — Хичээл
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1 text-lg leading-none">✕</button>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>
        )}

        <div className="overflow-y-auto flex-1 space-y-2">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="h-10 bg-white/5 rounded-xl animate-pulse" />
            ))
          ) : allSchedules.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-6">Идэвхтэй хичээл байхгүй</p>
          ) : (
            allSchedules.map(s => (
              <label
                key={s.id}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all
                  ${selectedIds.includes(s.id)
                    ? 'bg-teal-500/10 border-teal-500/30 text-teal-300'
                    : 'bg-white/3 border-border text-slate-400 hover:border-teal-500/20'}`}
              >
                <input
                  type="checkbox"
                  className="accent-teal-500 w-4 h-4 flex-shrink-0"
                  checked={selectedIds.includes(s.id)}
                  onChange={() => toggleSchedule(s.id)}
                />
                <span className="text-sm flex-1">{formatLabel(s)}</span>
                <span className="text-xs opacity-60 flex-shrink-0">{s.room}</span>
              </label>
            ))
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t border-border">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Болих</button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="btn-primary flex-1 justify-center"
          >
            {saving ? 'Хадгалж байна...' : `Хадгалах (${selectedIds.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}
