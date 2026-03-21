import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { ScanFace, Eye, EyeOff, LogIn } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Login() {
  const { login }        = useAuth()
  const navigate         = useNavigate()
  const [form, setForm]  = useState({ email: '', password: '' })
  const [show, setShow]  = useState(false)
  const [busy, setBusy]  = useState(false)

  const handleSubmit = async e => {
    e.preventDefault()
    setBusy(true)
    try {
      await login(form.email, form.password)
      toast.success('Тавтай морил!')
      navigate('/')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Нэвтрэхэд алдаа гарлаа')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      {/* Background grid */}
      <div className="fixed inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%23252840%22 fill-opacity=%220.4%22%3E%3Cpath d=%22M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-30 pointer-events-none" />

      <div className="relative w-full max-w-md fade-in">
        {/* Glow */}
        <div className="absolute -inset-1 bg-primary-500/20 rounded-3xl blur-2xl" />

        <div className="relative card p-8">
          {/* Header */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary-500/15 border border-primary-500/30
                            flex items-center justify-center mb-4">
              <ScanFace size={32} className="text-primary-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">FaceAttend</h1>
            <p className="text-slate-500 text-sm mt-1">Царай танилтын ирц систем</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Имэйл</label>
              <input
                type="email"
                className="input"
                placeholder="admin@university.mn"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label">Нууц үг</label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  className="input pr-11"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={busy} className="btn-primary w-full justify-center py-3 mt-2">
              <LogIn size={17} />
              {busy ? 'Нэвтэрч байна...' : 'Нэвтрэх'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-600 mt-6">
            Монгол Улсын Их Сургуулийн Мэдээллийн Систем
          </p>
        </div>
      </div>
    </div>
  )
}
