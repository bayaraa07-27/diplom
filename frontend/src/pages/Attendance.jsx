import { useState, useRef, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import {
  ScanFace, Clock, Wifi, WifiOff, ChevronDown,
  Users, CalendarDays, AlertCircle, Shield, ShieldOff
} from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const CONSTRAINTS   = { width: 640, height: 480, facingMode: 'user' }
const SCAN_INTERVAL = 2000

export default function Attendance() {
  const webcamRef    = useRef(null)
  const canvasRef    = useRef(null)
  const intervalRef  = useRef(null)
  const clockRef     = useRef(null)

  const [schedules,   setSchedules]   = useState([])
  const [selectedSch, setSelectedSch] = useState(null)
  const [isScanning,  setIsScanning]  = useState(false)
  const [registered,  setRegistered]  = useState([])
  const [alreadyIds,  setAlreadyIds]  = useState([])
  const [summary,     setSummary]     = useState(null)
  const [faceCount,   setFaceCount]   = useState(0)
  const [scanStatus,  setScanStatus]  = useState('idle')
  const [currentTime, setCurrentTime] = useState(new Date())
  const [autoMode,    setAutoMode]    = useState(true)
  const [livenessOk,  setLivenessOk]  = useState(null) // null=мэдэгдэхгүй, true=бэлэн, false=суулгагдаагүй

  const today = new Date().toISOString().split('T')[0]

  // ── Цаг шинэчлэх (1 секунд тутамд) ─────────────────────────────
  useEffect(() => {
    clockRef.current = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(clockRef.current)
  }, [])

  // ── Хичээлийн цагийг автоматаар шалгах ──────────────────────────
  useEffect(() => {
    if (!autoMode || schedules.length === 0) return

    const nowStr = format(currentTime, 'HH:mm')

    // Одоо явагдаж байгаа хичээл хайх
    const ongoing = schedules.find(s => {
      return nowStr >= s.start_time && nowStr <= s.end_time && s.is_active
    })

    if (ongoing) {
      // Хичээл байвал → автоматаар сонгож скан эхлүүлнэ
      if (!selectedSch || selectedSch.id !== ongoing.id) {
        setSelectedSch(ongoing)
        if (!isScanning) {
          setIsScanning(true)
          setRegistered([])
          setAlreadyIds([])
          toast.success(`${ongoing.subject} хичээл эхэллээ — ирц бүртгэл автоматаар эхэллээ`, {
            duration: 4000, icon: '🎓'
          })
        }
      }
    } else {
      // Хичээл дуусвал → автоматаар зогсооно
      if (isScanning && selectedSch) {
        const stillActive = schedules.find(s =>
          nowStr >= s.start_time && nowStr <= s.end_time && s.is_active
        )
        if (!stillActive) {
          setIsScanning(false)
          if (selectedSch) {
            toast(`${selectedSch.subject} хичээл дууслаа — скан зогслоо`, {
              duration: 4000, icon: '⏹'
            })
          }
        }
      }
    }
  }, [currentTime, schedules, autoMode])

  // ── Анхны ачаалалт ───────────────────────────────────────────────
  useEffect(() => {
    loadSchedules()
    loadSummary()
    checkLivenessStatus()
  }, [])

  const loadSchedules = async () => {
    try {
      const { data } = await api.get('/schedules/today')
      setSchedules(data.schedules)
    } catch {}
  }

  const loadSummary = async () => {
    try {
      const { data } = await api.get('/attendance/today-summary')
      setSummary(data)
    } catch {}
  }

  const checkLivenessStatus = async () => {
    try {
      const { data } = await api.get('/attendance/liveness-status')
      setLivenessOk(data.initialized && data.models_loaded > 0)
    } catch { setLivenessOk(false) }
  }

  // ── Scanning interval ────────────────────────────────────────────
  useEffect(() => {
    if (isScanning) {
      intervalRef.current = setInterval(scanFrame, SCAN_INTERVAL)
    } else {
      clearInterval(intervalRef.current)
      setScanStatus('idle')
      clearCanvas()
    }
    return () => clearInterval(intervalRef.current)
  }, [isScanning, selectedSch, alreadyIds])

  // ── Canvas дээр царайн хүрээ зурах ──────────────────────────────
  const drawFaces = useCallback((faces, imgW, imgH) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx    = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const scaleX = canvas.width  / (imgW || 640)
    const scaleY = canvas.height / (imgH || 480)

    faces.forEach(face => {
      if (!face.location) return
      const [top, right, bottom, left] = face.location
      const x = left   * scaleX
      const y = top    * scaleY
      const w = (right  - left)  * scaleX
      const h = (bottom - top)   * scaleY

      // Spoof илэрсэн үед шар өнгө
      const color = face.spoof            ? '#f59e0b' :
                    face.status === 'new'     ? '#10b981' :
                    face.status === 'already' ? '#4f6ef7' : '#ef4444'

      // Булан тэмдэглэгч (corner brackets)
      ctx.strokeStyle = color
      ctx.lineWidth   = 2.5
      const cs = Math.min(w, h) * 0.25  // corner size
      ;[
        [x,     y,     cs,  0,   0,   cs],
        [x+w,   y,     -cs, 0,   0,   cs],
        [x,     y+h,   cs,  0,   0,  -cs],
        [x+w,   y+h,   -cs, 0,   0,  -cs],
      ].forEach(([ox, oy, dx1, dy1, dx2, dy2]) => {
        ctx.beginPath()
        ctx.moveTo(ox + dx1, oy + dy1)
        ctx.lineTo(ox, oy)
        ctx.lineTo(ox + dx2, oy + dy2)
        ctx.stroke()
      })

      // Нэрийн шошго
      if (face.name) {
        const label = face.spoof            ? '⚠️ SPOOF' :
                      face.status === 'new' ? `✓ ${face.name}` :
                      face.status === 'already' ? face.name : '?'
        const tw = ctx.measureText(label).width + 10
        ctx.fillStyle = color + 'cc'
        ctx.fillRect(x, y - 24, Math.max(tw, 80), 24)
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 12px sans-serif'
        ctx.fillText(label, x + 5, y - 7)
      }

      // Confidence
      if (face.confidence > 0) {
        ctx.fillStyle = '#ffffff88'
        ctx.font = '10px sans-serif'
        ctx.fillText(`${face.confidence}%`, x + 4, y + h - 4)
      }
    })
  }, [])

  const clearCanvas = () => {
    const c = canvasRef.current
    if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height)
  }

  // ── Скан хийх гол функц ─────────────────────────────────────────
  const scanFrame = useCallback(async () => {
    const screenshot = webcamRef.current?.getScreenshot()
    if (!screenshot) return
    setScanStatus('scanning')
    try {
      const { data } = await api.post('/attendance/recognize-multi', {
        image:               screenshot,
        schedule_id:         selectedSch?.id || null,
        already_registered:  alreadyIds,
      })
      setFaceCount(data.total_faces)
      if (data.total_faces === 0) { setScanStatus('empty'); clearCanvas(); return }

      const video = webcamRef.current?.video
      drawFaces(data.faces, video?.videoWidth, video?.videoHeight)

      if (data.new_count > 0) {
        setScanStatus('found')
        setAlreadyIds(data.already_registered)
        setRegistered(prev => {
          const existing = new Set(prev.map(r => r.student_id))
          return [
            ...data.new_registrations.filter(r => !existing.has(r.student_id)),
            ...prev,
          ]
        })
        data.new_registrations.forEach(r =>
          toast.success(
            `${r.name}${r.late ? ' · Хоцорсон' : ''}`,
            { duration: 3000, icon: '✓' }
          )
        )
        // Spoof илэрсэн царайнуудыг мэдэгдэх
        const spoofCount = data.faces?.filter(f => f.spoof).length || 0
        if (spoofCount > 0) {
          toast.error(`⚠️ ${spoofCount} зураг/дэлгэц илэрлээ — бүртгэгдсэнгүй`, {
            duration: 5000
          })
        }
        loadSummary()
      } else {
        setScanStatus(data.total_faces > 0 ? 'found' : 'empty')
      }
    } catch { setScanStatus('idle') }
  }, [selectedSch, alreadyIds, drawFaces])

  const toggleScanning = () => {
    if (!isScanning) { setRegistered([]); setAlreadyIds([]); clearCanvas() }
    setIsScanning(s => !s)
  }

  const borderColor = scanStatus === 'found'    ? 'border-emerald-500' :
                      scanStatus === 'scanning' ? 'border-primary-500' :
                      scanStatus === 'empty'    ? 'border-slate-600'   : 'border-border'

  const nowStr      = format(currentTime, 'HH:mm:ss')

  return (
    <div className="fade-in space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Ирц бүртгэх</h1>
          <p className="text-slate-500 text-sm mt-1 flex items-center gap-1.5">
            <CalendarDays size={13} /> {format(currentTime, 'yyyy/MM/dd')}
          </p>
        </div>
        {/* Цагийн тоолуур */}
        <div className="card px-4 py-2 flex items-center gap-2">
          <Clock size={15} className="text-primary-400" />
          <span className="font-mono text-xl font-medium text-white">{nowStr}</span>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Нийт',     value: summary.total_students, color: 'text-slate-300'  },
            { label: 'Ирсэн',    value: summary.present,        color: 'text-emerald-400'},
            { label: 'Ирээгүй',  value: summary.absent,         color: 'text-red-400'   },
            { label: 'Хоцорсон', value: summary.late,           color: 'text-amber-400' },
          ].map(s => (
            <div key={s.label} className="card p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Auto mode toggle */}
      <div className={`card px-4 py-3 flex items-center justify-between
        ${autoMode ? 'border-primary-500/30 bg-primary-500/5' : ''}`}>
        <div>
          <p className="text-sm font-medium text-slate-200 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${autoMode ? 'bg-primary-400 animate-pulse' : 'bg-slate-600'}`} />
            Автомат горим
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {autoMode
              ? 'Хичээлийн цагт автоматаар скан эхэлж, дуусахад зогсоно'
              : 'Гараар эхлүүлэх горим идэвхтэй'}
          </p>
        </div>
        <button
          onClick={() => setAutoMode(a => !a)}
          className={`relative w-11 h-6 rounded-full transition-colors duration-200
            ${autoMode ? 'bg-primary-500' : 'bg-white/10'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200
            ${autoMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Liveness статус badge */}
      {livenessOk !== null && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm
          ${livenessOk
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
          {livenessOk
            ? <><Shield size={15} /> AI Liveness Detection идэвхтэй — утасны зураг илрүүлнэ</>
            : <><ShieldOff size={15} /> AI Liveness model суулгагдаагүй — зөвхөн царай танилт ажиллана</>}
        </div>
      )}

      {/* Өнөөдрийн хичээлүүд */}
      {schedules.length > 0 && (
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-400 mb-3">Өнөөдрийн хичээлүүд</p>
          <div className="flex flex-wrap gap-2">
            {schedules.map(s => {
              const now = format(currentTime, 'HH:mm')
              const status = now >= s.start_time && now <= s.end_time ? 'ongoing'  :
                             now <  s.start_time                     ? 'upcoming' : 'done'
              return (
                <button
                  key={s.id}
                  onClick={() => { setSelectedSch(s); if (!isScanning) {} }}
                  disabled={isScanning}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-all
                    ${selectedSch?.id === s.id
                      ? 'bg-primary-500/15 border-primary-500/40 text-primary-300'
                      : 'bg-white/3 border-border text-slate-400 hover:border-primary-500/30'}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0
                    ${status === 'ongoing'  ? 'bg-emerald-400 animate-pulse' :
                      status === 'upcoming' ? 'bg-amber-400' : 'bg-slate-600'}`}
                  />
                  <span className="font-medium">{s.subject}</span>
                  <span className="font-mono text-xs opacity-70">{s.start_time}–{s.end_time}</span>
                  <span className="text-xs opacity-50">{s.room}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-5">

        {/* Camera — 3/5 */}
        <div className="lg:col-span-3 card p-5 space-y-4">

          {/* Manual schedule selector (auto mode off үед) */}
          {!autoMode && (
            <div>
              <label className="label">Хичээл сонгох</label>
              <div className="relative">
                <select
                  className="input pr-8 appearance-none"
                  value={selectedSch?.id || ''}
                  onChange={e => setSelectedSch(schedules.find(s => s.id === e.target.value) || null)}
                  disabled={isScanning}
                >
                  <option value="">— Хичээлгүй —</option>
                  {schedules.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.subject} · {s.start_time}–{s.end_time} · {s.room}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Active schedule info */}
          {selectedSch && (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-primary-500/10 border border-primary-500/20">
              <div className="w-2 h-2 rounded-full bg-primary-400 animate-pulse flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary-300">{selectedSch.subject}</p>
                <p className="text-xs text-slate-500">
                  {selectedSch.start_time}–{selectedSch.end_time} · {selectedSch.room} ·
                  Хоцролт: {selectedSch.late_after_minutes} мин
                </p>
              </div>
            </div>
          )}

          {/* Webcam + canvas */}
          <div className={`relative rounded-2xl overflow-hidden border-2 transition-colors duration-300 bg-black ${borderColor}`}>
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              videoConstraints={CONSTRAINTS}
              screenshotQuality={0.8}
              className="w-full"
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />

            {/* Status overlay */}
            <div className="absolute top-3 left-3 flex items-center gap-2">
              {isScanning ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 text-xs font-medium text-emerald-400 backdrop-blur">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Скан хийж байна
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 text-xs font-medium text-slate-400 backdrop-blur">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                  Зогссон
                </span>
              )}
              {faceCount > 0 && isScanning && (
                <span className="px-2.5 py-1 rounded-full bg-black/70 text-xs text-primary-400 font-medium backdrop-blur">
                  {faceCount} царай
                </span>
              )}
            </div>

            {/* Progress bar */}
            {isScanning && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10">
                <div className="h-full bg-primary-500 origin-left"
                     style={{ animation: 'scaleX 2s linear infinite',
                              animationTimingFunction: 'linear' }} />
              </div>
            )}
          </div>

          {/* Start/stop */}
          <button
            onClick={toggleScanning}
            className={`w-full py-3 rounded-xl font-medium text-base flex items-center justify-center gap-2 transition-all
              ${isScanning
                ? 'bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25'
                : 'btn-primary'}`}
          >
            {isScanning
              ? <><WifiOff size={18} /> Зогсоох</>
              : <><Wifi    size={18} /> Скан эхлүүлэх</>}
          </button>

          <p className="text-xs text-center text-slate-600">
            {autoMode
              ? 'Автомат горим идэвхтэй — хичээлийн цагт өөрөө эхэлнэ'
              : `${SCAN_INTERVAL / 1000} секунд тутамд автоматаар скан хийнэ`}
          </p>
        </div>

        {/* Registered list — 2/5 */}
        <div className="lg:col-span-2 card p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Users size={16} className="text-primary-400" />
              Бүртгэгдсэн
            </h2>
            {registered.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20
                               text-emerald-400 text-xs font-medium">
                {registered.length} оюутан
              </span>
            )}
          </div>

          {/* Legend */}
          <div className="flex gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500" />Шинэ</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-primary-500" />Аль хэдийн</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500" />Танигдаагүй</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-500" />Spoof</span>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto max-h-80">
            {registered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <ScanFace size={34} className="text-slate-700 mb-3" />
                <p className="text-slate-500 text-sm">Одоогоор бүртгэл алга</p>
                <p className="text-slate-700 text-xs mt-1">
                  {autoMode ? 'Хичээлийн цагт автоматаар эхэлнэ' : 'Скан эхлүүлнэ үү'}
                </p>
              </div>
            ) : (
              registered.map(r => (
                <div key={r.student_id}
                     className="flex items-center gap-3 p-3 rounded-xl bg-white/3 hover:bg-white/5 transition-all fade-in">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center
                                  text-emerald-400 font-medium text-sm flex-shrink-0">
                    {r.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{r.name}</p>
                    <p className="text-xs text-slate-500">{r.department}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {r.late
                      ? <span className="badge-late">Хоцорсон</span>
                      : <span className="badge-present">Ирсэн</span>}
                    <span className="text-xs text-slate-600">{r.confidence}%</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {registered.length > 0 && (
            <div className="pt-3 border-t border-border space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Нийт бүртгэгдсэн</span>
                <span className="font-semibold text-emerald-400">{registered.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Хоцорсон</span>
                <span className="text-amber-400">{registered.filter(r => r.late).length}</span>
              </div>
              {selectedSch && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Хичээл</span>
                  <span className="text-slate-300 truncate ml-4">{selectedSch.subject}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}