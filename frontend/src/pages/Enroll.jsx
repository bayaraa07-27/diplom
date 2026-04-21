import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Webcam from 'react-webcam'
import {
  Camera, CheckCircle, ArrowLeft, RefreshCw,
  ScanFace, AlertCircle, Upload, ImagePlus, X
} from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'

const CONSTRAINTS = { width: 640, height: 480, facingMode: 'user' }
const STEPS = ['capture', 'preview', 'done']

export default function Enroll() {
  const { id }       = useParams()
  const navigate     = useNavigate()
  const webcamRef    = useRef(null)
  const fileInputRef = useRef(null)

  const [student,  setStudent]  = useState(null)
  const [mode,     setMode]     = useState('webcam')   // webcam | upload
  const [step,     setStep]     = useState('capture')  // capture | preview | done
  const [imgSrc,   setImgSrc]   = useState(null)
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState('')
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    api.get(`/students/${id}`)
      .then(r => setStudent(r.data))
      .catch(() => navigate('/students'))
  }, [id])

  // ── Webcam capture ───────────────────────────────────────────────
  const capture = useCallback(() => {
    const src = webcamRef.current?.getScreenshot()
    if (src) { setImgSrc(src); setStep('preview'); setError('') }
  }, [])

  // ── File upload → base64 ─────────────────────────────────────────
  const handleFile = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Зөвхөн зураг файл байршуулна уу (JPG, PNG, WEBP)')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Файлын хэмжээ 5MB-аас бихгүй байна')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      setImgSrc(e.target.result)
      setStep('preview')
      setError('')
    }
    reader.readAsDataURL(file)
  }

  const handleFileInput = (e) => handleFile(e.target.files[0])

  // ── Drag & Drop ──────────────────────────────────────────────────
  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  // ── Enroll API дуудах ────────────────────────────────────────────
  const handleEnroll = async () => {
    setBusy(true)
    setError('')
    try {
      await api.post(`/students/${id}/enroll-face`, { image: imgSrc })
      toast.success('Царай амжилттай бүртгэгдлээ!')
      setStep('done')
    } catch (err) {
      setError(err.response?.data?.error || 'Алдаа гарлаа')
    } finally { setBusy(false) }
  }

  const reset = () => { setStep('capture'); setImgSrc(null); setError('') }

  const stepIdx = STEPS.indexOf(step)

  return (
    <div className="fade-in max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/students')} className="btn-secondary p-2">
          <ArrowLeft size={17} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Царай бүртгэх</h1>
          {student && (
            <p className="text-slate-500 text-sm">
              {student.name} — {student.student_id} · {student.department}
            </p>
          )}
        </div>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-2 text-sm">
        {['Зураг сонгох', 'Баталгаажуулах', 'Дууссан'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors
              ${i === stepIdx ? 'bg-primary-500 text-white' :
                i < stepIdx  ? 'bg-emerald-500 text-white' : 'bg-white/10 text-slate-500'}`}>
              {i < stepIdx ? '✓' : i + 1}
            </div>
            <span className={i <= stepIdx ? 'text-slate-300' : 'text-slate-600'}>{s}</span>
            {i < 2 && <div className="w-8 h-px bg-border mx-1" />}
          </div>
        ))}
      </div>

      <div className="card p-6">

        {/* ── DONE ── */}
        {step === 'done' && (
          <div className="text-center py-8 space-y-4">
            <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/30
                            flex items-center justify-center mx-auto">
              <CheckCircle size={40} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Амжилттай!</h2>
              <p className="text-slate-400 mt-1">{student?.name}-ын царай бүртгэгдлээ</p>
              <p className="text-xs text-slate-600 mt-1">
                {mode === 'upload' ? '📁 Зургаас бүртгэсэн' : '📷 Камераас бүртгэсэн'}
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <button onClick={reset} className="btn-secondary">
                <RefreshCw size={15} /> Дахин бүртгэх
              </button>
              <button onClick={() => navigate('/students')} className="btn-primary">
                <ArrowLeft size={15} /> Жагсаалт руу буцах
              </button>
            </div>
          </div>
        )}

        {/* ── PREVIEW ── */}
        {step === 'preview' && (
          <div className="space-y-4">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <ScanFace size={18} className="text-primary-400" /> Зургийг шалгана уу
            </h2>
            <div className="relative rounded-2xl overflow-hidden border border-border bg-black">
              <img src={imgSrc} alt="preview" className="w-full object-contain max-h-80" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-2 border-primary-400/50 rounded-full" />
              </div>
            </div>
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> {error}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={reset} className="btn-secondary flex-1 justify-center">
                <RefreshCw size={15} /> Дахин сонгох
              </button>
              <button onClick={handleEnroll} disabled={busy} className="btn-primary flex-1 justify-center">
                <ScanFace size={15} />
                {busy ? 'Бүртгэж байна...' : 'Царай бүртгэх'}
              </button>
            </div>
          </div>
        )}

        {/* ── CAPTURE ── */}
        {step === 'capture' && (
          <div className="space-y-4">

            {/* Mode toggle */}
            <div className="flex rounded-xl border border-border overflow-hidden">
              {[
                { id: 'webcam', icon: Camera,    label: 'Камер ашиглах' },
                { id: 'upload', icon: ImagePlus, label: 'Зураг оруулах' },
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => { setMode(m.id); setError('') }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors
                    ${mode === m.id
                      ? 'bg-primary-500 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                >
                  <m.icon size={16} /> {m.label}
                </button>
              ))}
            </div>

            {/* ── Webcam mode ── */}
            {mode === 'webcam' && (
              <>
                <p className="text-sm text-slate-500">
                  Камерыг нүүрэндээ тохируулаад зураг авах товчийг дарна уу.
                </p>
                <div className="relative rounded-2xl overflow-hidden border border-border bg-black">
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    screenshotFormat="image/jpeg"
                    videoConstraints={CONSTRAINTS}
                    className="w-full"
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-52 h-52 border-2 border-primary-400/70 rounded-full" />
                  </div>
                  <div className="absolute left-0 right-0 h-0.5 bg-primary-400/40 scan-line pointer-events-none" />
                </div>
                <button onClick={capture} className="btn-primary w-full justify-center py-3 text-base">
                  <Camera size={19} /> Зураг авах
                </button>
              </>
            )}

            {/* ── Upload mode ── */}
            {mode === 'upload' && (
              <>
                <p className="text-sm text-slate-500">
                  Оюутны цагаан дэвсгэртэй, тодорхой харагдах зургийг оруулна уу.
                </p>

                {/* Drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative flex flex-col items-center justify-center gap-4 p-10 rounded-2xl border-2 border-dashed
                    cursor-pointer transition-all duration-200
                    ${dragging
                      ? 'border-primary-400 bg-primary-500/10'
                      : 'border-border hover:border-primary-500/50 hover:bg-white/3'}`}
                >
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors
                    ${dragging ? 'bg-primary-500/20' : 'bg-white/5'}`}>
                    <Upload size={28} className={dragging ? 'text-primary-400' : 'text-slate-500'} />
                  </div>
                  <div className="text-center">
                    <p className="text-slate-300 font-medium">
                      {dragging ? 'Энд тавина уу' : 'Зураг чирж тавих эсвэл дарж сонгох'}
                    </p>
                    <p className="text-slate-500 text-sm mt-1">JPG, PNG, WEBP · Дээд тал нь 5MB</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </div>

                {/* Эсвэл URL-ээс оруулах */}
                <UrlImport onLoad={(src) => { setImgSrc(src); setStep('preview'); setError('') }} />

                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> {error}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="card p-4">
        <p className="text-xs font-medium text-slate-400 mb-3">Зөвлөмж</p>
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
          {[
            '☀️ Сайн гэрэлтэй, тодорхой зураг',
            '👤 Зөвхөн нэг хүн байна уу',
            '😐 Шулуун харсан, цэлмэг зураг',
            '🕶 Нүдний шил, малгай байхгүй',
          ].map(t => <p key={t}>{t}</p>)}
        </div>
      </div>
    </div>
  )
}

// ── URL-ээс зураг оруулах ─────────────────────────────────────────
function UrlImport({ onLoad }) {
  const [url,    setUrl]    = useState('')
  const [busy,   setBusy]   = useState(false)
  const [error,  setError]  = useState('')
  const [show,   setShow]   = useState(false)

  const handleLoad = async () => {
    if (!url) return
    setBusy(true)
    setError('')
    try {
      const res  = await fetch(url)
      const blob = await res.blob()
      if (!blob.type.startsWith('image/')) throw new Error('Зураг биш файл байна')
      const reader = new FileReader()
      reader.onload = e => { onLoad(e.target.result); setUrl('') }
      reader.readAsDataURL(blob)
    } catch {
      setError('URL-аас зураг татахад алдаа гарлаа')
    } finally { setBusy(false) }
  }

  if (!show) return (
    <button onClick={() => setShow(true)} className="text-xs text-slate-500 hover:text-slate-300 w-full text-center py-1 transition-colors">
      URL-ээс зураг оруулах →
    </button>
  )

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="input flex-1 text-sm"
          placeholder="https://example.com/photo.jpg"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLoad()}
        />
        <button onClick={handleLoad} disabled={busy || !url} className="btn-primary px-3">
          {busy ? '...' : 'Оруулах'}
        </button>
        <button onClick={() => setShow(false)} className="btn-secondary p-2">
          <X size={15} />
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}