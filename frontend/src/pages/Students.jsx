import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, Search, ScanFace, Pencil, Trash2, CheckCircle, XCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'

export default function Students() {
  const navigate              = useNavigate()
  const [students, setStudents] = useState([])
  const [total,    setTotal]  = useState(0)
  const [page,     setPage]   = useState(1)
  const [pages,    setPages]  = useState(1)
  const [search,   setSearch] = useState('')
  const [loading,  setLoading] = useState(true)
  const [modal,    setModal]  = useState(null) // null | 'add' | student obj
  const [delId,    setDelId]  = useState(null)

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
              <select className="input" value={form.year} onChange={e => setForm(f=>({...f,year:e.target.value}))} required>
                <option value="">Сонгох</option>
                {[1,2,3,4,5,6].map(y=><option key={y} value={y}>{y}-р курс</option>)}
              </select>
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

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-sm p-6 fade-in text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
          <Trash2 size={22} className="text-red-400" />
        </div>
        <p className="text-slate-200 mb-5">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel}  className="btn-secondary flex-1 justify-center">Болих</button>
          <button onClick={onConfirm} className="btn-danger    flex-1 justify-center">Устгах</button>
        </div>
      </div>
    </div>
  )
}
