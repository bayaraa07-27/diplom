import { useState, useRef, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import {
  ScanFace, Clock, Wifi, WifiOff,
  Users, CalendarDays, CheckCircle,
  Pencil, Check, X, RotateCcw, AlertTriangle, Thermometer, CalendarCheck
} from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import Dropdown from '../components/Dropdown'
import { useAttendance } from '../contexts/AttendanceContext'
import { useAuth } from '../hooks/useAuth'

const CONSTRAINTS   = { width: 1280, height: 720, facingMode: 'user' }
const SCAN_INTERVAL = 1500

const STATUS_LABEL = { present: 'Ирсэн', late: 'Хоцорсон', absent: 'Ирсэнгүй', sick: 'Өвчтэй', excused: 'Чөлөөтэй' }
const STATUS_COLOR = { present: 'text-emerald-400', late: 'text-amber-400', absent: 'text-red-400', sick: 'text-purple-400', excused: 'text-sky-400' }

export default function Attendance() {
  const webcamRef       = useRef(null)
  const canvasRef       = useRef(null)
  const displayCanvasRef = useRef(null)
  const animFrameRef    = useRef(null)
  const intervalRef     = useRef(null)
  const clockRef        = useRef(null)
  const scanFrameRef    = useRef(null)

  const ctx = useAttendance()
  const { user } = useAuth()

  // Page tabs
  const [pageTab, setPageTab] = useState('scan')

  const [schedules,   setSchedules]   = useState([])
  const [selectedSch, setSelectedSch] = useState(() => {
    try {
      const saved = localStorage.getItem('attendance_selectedSch')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const [isScanning,  setIsScanning]  = useState(false)
  const [registered,  setRegistered]  = useState([])
  const [faceCount,   setFaceCount]   = useState(0)
  const [scanStatus,  setScanStatus]  = useState('idle')
  const [currentTime, setCurrentTime] = useState(new Date())
  const [autoMode,    setAutoMode]    = useState(true)
  const [activeTab,   setActiveTab]   = useState('present')
  const [visitors,     setVisitors]     = useState([])
  const [unknownCount, setUnknownCount] = useState(0)

  // Edit tab state
  const [editSchId,    setEditSchId]    = useState('')
  const [editDate,     setEditDate]     = useState(new Date().toISOString().split('T')[0])
  const [dailyList,    setDailyList]    = useState(null)
  const [editLog,      setEditLog]      = useState([])
  const [editLoading,  setEditLoading]  = useState(false)
  const [updatingIds,  setUpdatingIds]  = useState(new Set())
  const [allSchedules, setAllSchedules] = useState([])

  // ── Цаг шинэчлэх ─────────────────────────────────────────────────
  useEffect(() => {
    clockRef.current = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(clockRef.current)
  }, [])

  // ── Хичээлийн цагийг автоматаар шалгах ──────────────────────────
  useEffect(() => {
    if (!autoMode || schedules.length === 0) return
    const nowStr = format(currentTime, 'HH:mm')
    const ongoing = schedules.find(s =>
      nowStr >= s.start_time && nowStr <= s.end_time && s.is_active
    )
    if (ongoing) {
      if (!selectedSch || selectedSch.id !== ongoing.id) {
        setSelectedSch(ongoing)
        if (!isScanning) {
          setIsScanning(true)
          setRegistered([])
          toast.success(`${ongoing.subject} хичээл эхэллээ — ирц бүртгэл автоматаар эхэллээ`, {
            duration: 4000, icon: '🎓', id: 'auto-mode-start'
          })
        }
      }
    } else if (isScanning && selectedSch) {
      const stillActive = schedules.find(s =>
        nowStr >= s.start_time && nowStr <= s.end_time && s.is_active
      )
      if (!stillActive) {
        setIsScanning(false)
        toast(`${selectedSch.subject} хичээл дууслаа — скан зогслоо`, {
          duration: 4000, icon: '⏹', id: 'auto-mode-stop'
        })
      }
    }
  }, [currentTime, schedules, autoMode, isScanning, selectedSch])

  // ── Анхны ачаалалт ───────────────────────────────────────────────
  useEffect(() => { loadSchedules() }, [])

  const loadSchedules = async () => {
    try {
      const { data } = await api.get('/schedules/today')
      setSchedules(data.schedules)
      setSelectedSch(prev => {
        if (!prev) return prev
        const found = data.schedules.find(s => s.id === prev.id)
        if (!found) return prev
        return found
      })
    } catch {}
  }

  // Load all schedules for edit tab
  useEffect(() => {
    api.get('/schedules/').then(r => setAllSchedules(r.data.schedules || [])).catch(() => {})
  }, [])

  // Sync editSchId with selectedSch (once, on first selection)
  useEffect(() => {
    if (selectedSch?.id && !editSchId) setEditSchId(selectedSch.id)
  }, [selectedSch?.id])

  // selectedSch-г localStorage-д хадгална
  useEffect(() => {
    if (selectedSch) localStorage.setItem('attendance_selectedSch', JSON.stringify(selectedSch))
  }, [selectedSch])

  const alreadyIdsRef = useRef(ctx.alreadyIds)
  useEffect(() => { alreadyIdsRef.current = ctx.alreadyIds }, [ctx.alreadyIds])

  useEffect(() => {
    const id = setInterval(() => ctx.refreshAll(), 30000)
    return () => clearInterval(id)
  }, [])

  const localSchId = selectedSch?.id ?? ''
  useEffect(() => {
    setRegistered([])
    setVisitors([])
    setUnknownCount(0)
    setActiveTab('present')
    ctx.setSelectedSchId(localSchId)
  }, [localSchId])

  // Canvas render loop
  useEffect(() => {
    const render = () => {
      const video  = webcamRef.current?.video
      const canvas = displayCanvasRef.current
      if (video && canvas && video.readyState >= 2 && video.videoWidth) {
        const vw   = video.videoWidth
        const vh   = video.videoHeight
        if (canvas.width !== vw)  canvas.width  = vw
        if (canvas.height !== vh) canvas.height = vh
        const c = canvas.getContext('2d')
        c.save()
        c.scale(-1, 1)
        c.drawImage(video, -vw, 0, vw, vh)
        c.restore()
      }
      animFrameRef.current = requestAnimationFrame(render)
    }
    animFrameRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [])

  // ── Scanning interval ────────────────────────────────────────────
  useEffect(() => {
    if (isScanning) {
      intervalRef.current = setInterval(() => scanFrameRef.current?.(), SCAN_INTERVAL)
    } else {
      clearInterval(intervalRef.current)
      setScanStatus('idle')
      clearCanvas()
    }
    return () => clearInterval(intervalRef.current)
  }, [isScanning, selectedSch])

  // ── Canvas дээр царайн хүрээ зурах ──────────────────────────────
  const drawFaces = useCallback((faces, screenshotW, screenshotH) => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width  = screenshotW || 1280
    canvas.height = screenshotH || 720
    const c = canvas.getContext('2d')
    c.clearRect(0, 0, canvas.width, canvas.height)

    faces.forEach(face => {
      if (!face.location) return
      const [top, right, bottom, origLeft] = face.location
      const x = origLeft
      const y = top
      const w = right - origLeft
      const h = bottom - top

      const color = face.status === 'new'     ? '#10b981' :
                    face.status === 'already' ? '#4f6ef7' :
                    face.status === 'spoof'   ? '#f59e0b' : '#ef4444'

      c.strokeStyle = color
      c.lineWidth   = 2
      c.strokeRect(x, y, w, h)

      const cs = Math.min(w, h) * 0.18
      c.lineWidth = 3.5
      ;[
        [x,     y,      1,  1],
        [x + w, y,     -1,  1],
        [x,     y + h,  1, -1],
        [x + w, y + h, -1, -1],
      ].forEach(([ox, oy, sx, sy]) => {
        c.beginPath()
        c.moveTo(ox + sx * cs, oy)
        c.lineTo(ox, oy)
        c.lineTo(ox, oy + sy * cs)
        c.stroke()
      })

      if (face.name || face.status === 'spoof') {
        c.font = 'bold 16px sans-serif'
        const label = face.status === 'new' ? `✓ ${face.name}` :
                      face.status === 'already' ? face.name :
                      face.status === 'spoof' ? (face.name || 'Хуурамч оролдлого') : '?'
        const tw = c.measureText(label).width + 12
        const lx = x
        const ly = y > 28 ? y - 28 : y + h + 4
        c.fillStyle = color + 'dd'
        c.beginPath()
        c.roundRect(lx, ly, Math.max(tw, 70), 24, 4)
        c.fill()
        c.fillStyle = '#fff'
        c.fillText(label, lx + 6, ly + 17)
      }

      if (face.status === 'spoof' && face.liveness_detail?.fft_score != null) {
        c.font = 'bold 14px sans-serif'
        const fftLabel = `FFT ${Number(face.liveness_detail.fft_score).toFixed(2)}`
        const tw = c.measureText(fftLabel).width + 12
        const lx = x
        const ly = y + h + 30
        c.fillStyle = color + 'dd'
        c.beginPath()
        c.roundRect(lx, ly, Math.max(tw, 72), 22, 4)
        c.fill()
        c.fillStyle = '#fff'
        c.fillText(fftLabel, lx + 6, ly + 16)
      }

      if (face.confidence > 0) {
        c.font = 'bold 16px sans-serif'
        c.fillStyle = '#ffffff'
        c.fillText(`${face.confidence}%`, x + 5, y + h - 6)
      }
    })
  }, [])

  const clearCanvas = () => {
    const c = canvasRef.current
    if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height)
  }

  const toggleScanning = () => {
    if (isScanning) {
      setIsScanning(false)
    } else {
      setRegistered([])
      setVisitors([])
      setUnknownCount(0)
      clearCanvas()
      setIsScanning(true)
    }
  }

  const scanFrame = useCallback(async () => {
    const video = webcamRef.current?.video
    if (!video || !video.videoWidth) return
    const tmp   = document.createElement('canvas')
    tmp.width   = CONSTRAINTS.width
    tmp.height  = CONSTRAINTS.height
    const tctx  = tmp.getContext('2d')
    tctx.save()
    tctx.scale(-1, 1)
    tctx.drawImage(video, -CONSTRAINTS.width, 0, CONSTRAINTS.width, CONSTRAINTS.height)
    tctx.restore()
    const screenshot = tmp.toDataURL('image/jpeg', 0.85)
    if (!screenshot) return
    setScanStatus('scanning')
    try {
      const { data } = await api.post('/attendance/recognize-multi', {
        image:              screenshot,
        schedule_id:        selectedSch?.id || null,
        already_registered: alreadyIdsRef.current,
        check_liveness:     true,
      })
      setFaceCount(data.total_faces)
      setUnknownCount(data.faces.filter(f => f.status === 'unknown').length)
      if (data.total_faces === 0) { setScanStatus('empty'); clearCanvas(); return }

      drawFaces(data.faces, CONSTRAINTS.width, CONSTRAINTS.height)
      const spoofFaces = data.faces.filter(f => f.status === 'spoof')
      if (spoofFaces.length > 0) {
        const detail = spoofFaces[0].liveness_detail
        const fftText = detail?.fft_score != null
          ? ` FFT ${Number(detail.fft_score).toFixed(2)}`
          : ''
        toast.error(`Хуурамч оролдлого илэрлээ.${fftText}`, { duration: 2500, id: 'spoof-detected' })
      }

      if (data.already_registered.length > 0) {
        ctx.syncAlreadyIds(data.already_registered)
      }

      if (data.new_count > 0) {
        setScanStatus('found')
        const enrolledSet = new Set(ctx.enrolledStudents.map(e => e.student_id))
        const newEnrolled = data.new_registrations.filter(r => enrolledSet.has(r.student_id))
        const newVisitors = data.new_registrations.filter(r => !enrolledSet.has(r.student_id))

        if (newEnrolled.length > 0) {
          setRegistered(prev => {
            const existing = new Set(prev.map(r => r.student_id))
            return [...newEnrolled.filter(r => !existing.has(r.student_id)), ...prev]
          })
          newEnrolled.forEach(r =>
            toast.success(`${r.name}${r.late ? ' · Хоцорсон' : ''}`, { duration: 3000, icon: '✓', id: `student-${r.student_id}` })
          )
        }
        if (newVisitors.length > 0) {
          setVisitors(prev => {
            const existing = new Set(prev.map(r => r.student_id))
            return [...newVisitors.filter(r => !existing.has(r.student_id)), ...prev]
          })
          newVisitors.forEach(r =>
            toast(`${r.name} — Зочин оюутан`, { icon: '👤', duration: 3000, id: `visitor-${r.student_id}` })
          )
        }
        ctx.refreshSummary()
      } else {
        setScanStatus(data.total_faces > 0 ? 'found' : 'empty')
      }
    } catch (err) {
      console.error('Face recognition error:', err)
      toast.error('Нүүр царай танилгахад алдаа гарлаа', { id: 'face-recognition-error' })
      setScanStatus('idle')
    }
  }, [selectedSch, drawFaces, ctx.enrolledStudents])

  useEffect(() => { scanFrameRef.current = scanFrame }, [scanFrame])

  // ── Edit tab functions ───────────────────────────────────────────

  const fetchDailyList = useCallback(async (date, schId, showLoading = true) => {
    if (showLoading) setEditLoading(true)
    try {
      if (schId) {
        const [logRes, enrolledRes, attRes] = await Promise.all([
          api.get(`/attendance/edits?date=${date}`),
          api.get(`/students/by-schedule/${schId}`),
          api.get(`/attendance/?date=${date}&limit=1000`),
        ])
        const enrolled    = enrolledRes.data.students || []
        const allRecords  = attRes.data.records       || []
        const enrolledIds = new Set(enrolled.map(s => s.student_id))

        const scheduleMap = {}
        const noSchMap    = {}
        allRecords
          .filter(r => enrolledIds.has(r.student_id))
          .forEach(r => {
            if (r.schedule_id === schId) {
              if (!scheduleMap[r.student_id]) scheduleMap[r.student_id] = r
            } else if (!r.schedule_id && !noSchMap[r.student_id]) {
              noSchMap[r.student_id] = r
            }
          })

        const records = enrolled.map(s => {
          const rec    = scheduleMap[s.student_id] || noSchMap[s.student_id] || null
          const isLate = rec
            ? (rec.status === 'late' || (rec.late && rec.status === 'present'))
            : false
          return {
            student_id:    s.student_id,
            name:          s.name,
            department:    s.department,
            attendance_id: rec?.id       || null,
            status:        !rec ? 'absent' : isLate ? 'late' : rec.status,
            check_in:      rec?.check_in || null,
            manual:        rec?.manual   || false,
          }
        })

        const relevantAttIds = new Set([
          ...Object.values(scheduleMap).map(r => r.id),
          ...Object.values(noSchMap).map(r => r.id),
        ].filter(Boolean))
        setEditLog((logRes.data.edits || []).filter(e => relevantAttIds.has(e.attendance_id)))

        setDailyList({
          records,
          total:   enrolled.length,
          present: records.filter(r => r.status === 'present' || r.status === 'late').length,
          absent:  records.filter(r => r.status === 'absent').length,
          sick:    records.filter(r => r.status === 'sick').length,
          excused: records.filter(r => r.status === 'excused').length,
        })
      } else {
        const [logRes, listRes] = await Promise.all([
          api.get(`/attendance/edits?date=${date}`),
          api.get(`/attendance/daily?date=${date}`),
        ])
        setEditLog(logRes.data.edits || [])
        setDailyList(listRes.data)
      }
    } catch { toast.error('Мэдээлэл авахад алдаа гарлаа') }
    finally  { if (showLoading) setEditLoading(false) }
  }, [])

  useEffect(() => {
    if (pageTab === 'edit') fetchDailyList(editDate, editSchId)
  }, [pageTab, editDate, editSchId, fetchDailyList])

  // 30 секунд тутамд edit list шинэчлэх
  useEffect(() => {
    if (pageTab !== 'edit') return
    const id = setInterval(() => fetchDailyList(editDate, editSchId, false), 30000)
    return () => clearInterval(id)
  }, [pageTab, editDate, editSchId, fetchDailyList])

  const updateStatus = async (record, newStatus) => {
    if (updatingIds.has(record.student_id)) return
    if (record.status === newStatus) return

    const tempId = `temp-${Date.now()}`
    setUpdatingIds(prev => new Set([...prev, record.student_id]))

    setEditLog(prev => [{
      id:             tempId,
      student_id:     record.student_id,
      student_name:   record.name,
      date:           editDate,
      old_status:     record.status,
      new_status:     newStatus,
      edited_at:      new Date().toISOString(),
      edited_by_name: user?.name || '',
    }, ...prev])

    setDailyList(prev => {
      if (!prev) return prev
      const updated = prev.records.map(r =>
        r.student_id === record.student_id ? { ...r, status: newStatus } : r
      )
      return {
        ...prev,
        records: updated,
        present: updated.filter(r => r.status === 'present' || r.status === 'late').length,
        absent:  updated.filter(r => r.status === 'absent').length,
        sick:    updated.filter(r => r.status === 'sick').length,
        excused: updated.filter(r => r.status === 'excused').length,
      }
    })

    try {
      if (record.attendance_id) {
        await api.put(`/attendance/${record.attendance_id}`, { status: newStatus })
      } else {
        if (newStatus === 'absent') {
          setEditLog(prev => prev.filter(e => e.id !== tempId))
          setDailyList(prev => {
            if (!prev) return prev
            const reverted = prev.records.map(r =>
              r.student_id === record.student_id ? { ...r, status: record.status } : r
            )
            return { ...prev, records: reverted }
          })
          return
        }
        try {
          await api.post('/attendance/manual', {
            student_id:  record.student_id,
            date:        editDate,
            status:      newStatus,
            schedule_id: editSchId || undefined,
          })
        } catch (manualErr) {
          if (manualErr?.response?.status === 409) {
            const existingId = manualErr.response?.data?.attendance_id
            if (!existingId) throw manualErr
            await api.put(`/attendance/${existingId}`, { status: newStatus })
          } else {
            throw manualErr
          }
        }
      }
      toast.success(`${record.name} — ${STATUS_LABEL[newStatus]}`, { id: `edit-success-${record.student_id}-${Date.now()}` })
      const today = new Date().toISOString().split('T')[0]
      if (editDate === today && editSchId && editSchId === ctx.selectedSchId) {
        ctx.updateLocalRecord(record.student_id, newStatus, record.attendance_id)
      }
      await fetchDailyList(editDate, editSchId, false)
    } catch (err) {
      setDailyList(prev => {
        if (!prev) return prev
        const reverted = prev.records.map(r =>
          r.student_id === record.student_id ? { ...r, status: record.status } : r
        )
        return { ...prev, records: reverted }
      })
      setEditLog(prev => prev.filter(e => e.id !== tempId))
      toast.error(err?.response?.data?.error || 'Засварлахад алдаа гарлаа', { id: `edit-error-${record.student_id}-${Date.now()}` })
    } finally {
      setUpdatingIds(prev => { const s = new Set(prev); s.delete(record.student_id); return s })
    }
  }

  const editMap = {}
  editLog.forEach(e => {
    if (!editMap[e.student_id]) editMap[e.student_id] = []
    editMap[e.student_id].push(e)
  })

  const editSelectedSch = allSchedules.find(s => s.id === editSchId) || null

  // ── Computed ─────────────────────────────────────────────────────

  const borderColor = scanStatus === 'found'    ? 'border-emerald-500' :
                      scanStatus === 'scanning' ? 'border-primary-500' :
                      scanStatus === 'empty'    ? 'border-slate-600'   : 'border-border'

  const nowStr = format(currentTime, 'HH:mm:ss')

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
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* Page tab switcher */}
          <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
            <button
              onClick={() => setPageTab('scan')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${pageTab === 'scan' ? 'bg-primary-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Wifi size={14} /> Бүртгэх
            </button>
            <button
              onClick={() => setPageTab('edit')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${pageTab === 'edit' ? 'bg-primary-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Pencil size={14} /> Засах
            </button>
          </div>
          <div className="card px-4 py-2 flex items-center gap-2">
            <Clock size={15} className="text-primary-400" />
            <span className="font-mono text-xl font-medium text-white">{nowStr}</span>
          </div>
        </div>
      </div>

      {/* ══════════════ БҮРТГЭХ TAB ══════════════ */}
      {pageTab === 'scan' && (
        <>
          {/* Summary */}
          {ctx.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Нийт',     value: ctx.summary.total_students, color: 'text-slate-300'  },
                { label: 'Ирсэн',    value: ctx.summary.present,        color: 'text-emerald-400'},
                { label: 'Ирээгүй',  value: ctx.summary.absent,         color: 'text-red-400'   },
                { label: 'Хоцорсон', value: ctx.summary.late,           color: 'text-amber-400' },
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
                {autoMode ? 'Хичээлийн цагт автоматаар скан эхэлж, дуусахад зогсоно'
                          : 'Гараар эхлүүлэх горим идэвхтэй'}
              </p>
            </div>
            <button onClick={() => setAutoMode(a => !a)}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200
                ${autoMode ? 'bg-primary-500' : 'bg-white/10'}`}>
              <span className={`absolute left-0 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200
                ${autoMode ? 'translate-x-6' /* on*/: 'translate-x-0'/*off*/ }`} />
            </button>
          </div>

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
                    <button key={s.id}
                      onClick={() => setSelectedSch(s)}
                      disabled={isScanning}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-all
                        ${selectedSch?.id === s.id
                          ? 'bg-primary-500/15 border-primary-500/40 text-primary-300'
                          : 'bg-white/3 border-border text-slate-400 hover:border-primary-500/30'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0
                        ${status === 'ongoing'  ? 'bg-emerald-400 animate-pulse' :
                          status === 'upcoming' ? 'bg-amber-400' : 'bg-slate-600'}`} />
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

              {!autoMode && (
                <div>
                  <label className="label">Хичээл сонгох</label>
                  <Dropdown
                    value={selectedSch?.id || ''}
                    onChange={val => setSelectedSch(schedules.find(s => s.id === val) || null)}
                    placeholder="— Хичээлгүй —"
                    options={schedules.map(s => ({
                      value: s.id,
                      label: `${s.subject} · ${s.start_time}–${s.end_time} · ${s.room}`,
                    }))}
                    disabled={isScanning}
                  />
                </div>
              )}

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
              <div className={`relative rounded-2xl overflow-hidden border-2 transition-colors duration-300 bg-black ${borderColor}`}
                   style={{ aspectRatio: '16/9' }}>
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  mirrored={true}
                  screenshotFormat="image/jpeg"
                  videoConstraints={CONSTRAINTS}
                  screenshotQuality={0.85}
                  className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
                />
                <canvas ref={displayCanvasRef} className="w-full h-full object-cover" style={{ display: 'block' }} />
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

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
                  {unknownCount > 0 && isScanning && (
                    <span className="px-2.5 py-1 rounded-full bg-black/70 text-xs text-red-400 font-medium backdrop-blur">
                      {unknownCount} танигдаагүй
                    </span>
                  )}
                </div>

                {isScanning && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10">
                    <div className="h-full bg-primary-500 origin-left"
                         style={{ animation: 'scaleX 2s linear infinite' }} />
                  </div>
                )}
              </div>

              <button
                onClick={toggleScanning}
                className={`w-full py-3 rounded-xl font-medium text-base flex items-center justify-center gap-2 transition-all
                  ${isScanning
                    ? 'bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25'
                    : 'btn-primary'}`}>
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

            {/* Present / Absent panel — 2/5 */}
            {(() => {
              const isLoading = ctx.attendanceLoading || ctx.enrolledLoading
              const registeredIds = new Set(registered.map(r => r.student_id))
              const dbPresent = ctx.enrolledStudents.filter(
                e => ctx.alreadyIds.includes(e.student_id) && !registeredIds.has(e.student_id)
              ).map(e => ({ ...e, confidence: null, late: false }))
              const presentStudents = [...registered, ...dbPresent]
              const presentIds = new Set(presentStudents.map(p => p.student_id))
              const absentStudents = selectedSch && !isLoading
                ? ctx.enrolledStudents.filter(e => !presentIds.has(e.student_id))
                : []
              return (
                <div className="lg:col-span-2 card p-5 flex flex-col gap-4">

                  <div className="flex rounded-xl overflow-hidden border border-border">
                    <button
                      onClick={() => setActiveTab('present')}
                      className={`flex-1 py-2 text-sm font-medium transition-colors
                        ${activeTab === 'present'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      Ирсэн ({presentStudents.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('absent')}
                      className={`flex-1 py-2 text-sm font-medium transition-colors border-l border-border
                        ${activeTab === 'absent'
                          ? 'bg-red-500/15 text-red-400'
                          : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      Ирээгүй ({isLoading ? '…' : absentStudents.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('visitor')}
                      className={`flex-1 py-2 text-sm font-medium transition-colors border-l border-border
                        ${activeTab === 'visitor'
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      Зочин ({visitors.length})
                    </button>
                  </div>

                  <div className="flex-1 space-y-2 overflow-y-auto max-h-80">

                    {isLoading && (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="w-7 h-7 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-3" />
                        <p className="text-slate-500 text-sm">Уншиж байна…</p>
                      </div>
                    )}

                    {!isLoading && activeTab === 'present' && (
                      presentStudents.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <ScanFace size={34} className="text-slate-700 mb-3" />
                          <p className="text-slate-500 text-sm">Одоогоор бүртгэл алга</p>
                          <p className="text-slate-700 text-xs mt-1">
                            {autoMode ? 'Хичээлийн цагт автоматаар эхэлнэ' : 'Скан эхлүүлнэ үү'}
                          </p>
                        </div>
                      ) : (
                        presentStudents.map(r => (
                          <div key={r.student_id}
                               className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 transition-all fade-in">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center
                                            text-emerald-400 font-medium text-sm flex-shrink-0">
                              {r.name[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-200 truncate">{r.name}</p>
                              <p className="text-xs text-slate-500">{r.department}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              {r.late
                                ? <span className="badge-late">Хоцорсон</span>
                                : <span className="badge-present">Ирсэн</span>}
                              {r.confidence != null && (
                                <span className="text-xs text-slate-600">{r.confidence}%</span>
                              )}
                            </div>
                          </div>
                        ))
                      )
                    )}

                    {!isLoading && activeTab === 'absent' && (
                      !selectedSch ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <Users size={34} className="text-slate-700 mb-3" />
                          <p className="text-slate-500 text-sm">Хичээл сонгоогүй байна</p>
                        </div>
                      ) : absentStudents.length === 0 && ctx.enrolledStudents.length > 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <CheckCircle size={34} className="text-emerald-700 mb-3" />
                          <p className="text-emerald-500 text-sm">Бүх оюутан ирсэн байна!</p>
                        </div>
                      ) : absentStudents.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <Users size={34} className="text-slate-700 mb-3" />
                          <p className="text-slate-500 text-sm">Бүртгэлтэй оюутан олдсонгүй</p>
                        </div>
                      ) : (
                        absentStudents.map(e => {
                          const sp = ctx.specialStatuses[e.student_id]
                          const borderCls = sp === 'sick'    ? 'bg-purple-500/5 border-purple-500/10 hover:bg-purple-500/10'
                                          : sp === 'excused' ? 'bg-sky-500/5 border-sky-500/10 hover:bg-sky-500/10'
                                          : 'bg-red-500/5 border-red-500/10 hover:bg-red-500/10'
                          const avatarCls = sp === 'sick'    ? 'bg-purple-500/20 text-purple-400'
                                          : sp === 'excused' ? 'bg-sky-500/20 text-sky-400'
                                          : 'bg-red-500/20 text-red-400'
                          return (
                            <div key={e.student_id}
                                 className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${borderCls}`}>
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center
                                              font-medium text-sm flex-shrink-0 ${avatarCls}`}>
                                {e.name[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-300 truncate">{e.name}</p>
                                <p className="text-xs text-slate-500">{e.department}</p>
                              </div>
                              {sp === 'sick'    && <span className="badge-sick flex-shrink-0">Өвчтэй</span>}
                              {sp === 'excused' && <span className="badge-excused flex-shrink-0">Чөлөөтэй</span>}
                              {!sp             && <span className="text-xs text-red-400 flex-shrink-0">Ирээгүй</span>}
                            </div>
                          )
                        })
                      )
                    )}
                    {!isLoading && activeTab === 'visitor' && (
                      visitors.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <Users size={34} className="text-slate-700 mb-3" />
                          <p className="text-slate-500 text-sm">Зочин оюутан алга</p>
                        </div>
                      ) : (
                        visitors.map(r => (
                          <div key={r.student_id}
                               className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 hover:bg-amber-500/10 transition-all fade-in">
                            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center
                                            text-amber-400 font-medium text-sm flex-shrink-0">
                              {r.name[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-200 truncate">{r.name}</p>
                              <p className="text-xs text-slate-500">{r.department}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">Зочин</span>
                              {r.confidence != null && (
                                <span className="text-xs text-slate-600">{r.confidence}%</span>
                              )}
                            </div>
                          </div>
                        ))
                      )
                    )}
                  </div>

                  <div className="pt-3 border-t border-border space-y-1.5 text-sm">
                    {selectedSch ? (
                      isLoading ? (
                        <div className="text-center text-slate-600 text-xs animate-pulse">Уншиж байна…</div>
                      ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Нийт бүртгэлтэй</span>
                          <span className="text-slate-300">{ctx.enrolledStudents.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Ирсэн</span>
                          <span className="font-semibold text-emerald-400">{presentStudents.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Ирээгүй</span>
                          <span className="text-red-400">{absentStudents.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Хоцорсон</span>
                          <span className="text-amber-400">{presentStudents.filter(r => r.late).length}</span>
                        </div>
                        {visitors.length > 0 && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Зочин</span>
                            <span className="text-amber-400">{visitors.length}</span>
                          </div>
                        )}
                      </>
                      )
                    ) : presentStudents.length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Нийт бүртгэгдсэн</span>
                        <span className="font-semibold text-emerald-400">{presentStudents.length}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        </>
      )}

      {/* ══════════════ ЗАСАХ TAB ══════════════ */}
      {pageTab === 'edit' && (
        <div className="space-y-4 fade-in">

          {/* Filters row */}
          <div className="card p-4 flex items-center gap-3 flex-wrap">
            <Dropdown
              value={editSchId}
              onChange={setEditSchId}
              placeholder="— Бүх оюутан —"
              options={allSchedules.map(s => ({
                value: s.id,
                label: `${s.subject} · ${s.start_time}–${s.end_time}`,
              }))}
              className="min-w-52"
            />

            <label className="text-sm text-slate-400">Огноо:</label>
            <input
              type="date"
              className="input w-auto"
              value={editDate}
              onChange={e => setEditDate(e.target.value)}
            />

            <button
              onClick={() => fetchDailyList(editDate, editSchId)}
              disabled={editLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-border
                         text-slate-400 hover:text-slate-200 text-sm transition-colors"
            >
              <RotateCcw size={14} className={editLoading ? 'animate-spin' : ''} />
              Шинэчлэх
            </button>

            {dailyList && (
              <span className="ml-auto text-xs text-slate-500 flex items-center gap-1.5 flex-wrap justify-end">
                <span>Нийт {dailyList.total}</span>
                <span>· Ирсэн <span className="text-emerald-400">{dailyList.present}</span></span>
                <span>· Ирсэнгүй <span className="text-red-400">{dailyList.absent}</span></span>
                {(dailyList.sick    || 0) > 0 && <span>· Өвчтэй <span className="text-purple-400">{dailyList.sick}</span></span>}
                {(dailyList.excused || 0) > 0 && <span>· Чөлөөтэй <span className="text-sky-400">{dailyList.excused}</span></span>}
              </span>
            )}
          </div>

          {/* Selected schedule info */}
          {editSelectedSch && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-primary-500/10 border border-primary-500/20">
              <div className="w-2 h-2 rounded-full bg-primary-400 flex-shrink-0" />
              <p className="text-sm font-medium text-primary-300">{editSelectedSch.subject}</p>
              <p className="text-xs text-slate-500">
                {editSelectedSch.start_time}–{editSelectedSch.end_time} · {editSelectedSch.room}
              </p>
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-slate-500 px-1">
            <span className="flex items-center gap-1.5"><Check         size={12} className="text-emerald-400" /> Ирсэн</span>
            <span className="flex items-center gap-1.5"><Clock         size={12} className="text-amber-400"   /> Хоцорсон</span>
            <span className="flex items-center gap-1.5"><X             size={12} className="text-red-400"     /> Ирсэнгүй</span>
            <span className="flex items-center gap-1.5"><Thermometer   size={12} className="text-purple-400"  /> Өвчтэй</span>
            <span className="flex items-center gap-1.5"><CalendarCheck size={12} className="text-sky-400"     /> Чөлөөтэй</span>
            <span className="flex items-center gap-1.5"><AlertTriangle size={12} className="text-amber-400"   /> Засвар хийгдсэн</span>
          </div>

          {/* Attendance table */}
          <div className="card">
            {editLoading ? (
              <div className="p-8 text-center text-slate-500 text-sm animate-pulse">Уншиж байна…</div>
            ) : !dailyList ? null : dailyList.records.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">Оюутан олдсонгүй</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Оюутан', 'Тэнхим', 'Ирэх цаг', 'Статус', 'Засварлах'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {dailyList.records.map((r, idx) => {
                      const isBusy    = updatingIds.has(r.student_id)
                      const edits     = editMap[r.student_id] || []
                      const showBelow = idx < dailyList.records.length / 2
                      return (
                        <tr key={r.student_id} className={`hover:bg-white/3 transition-colors ${isBusy ? 'opacity-50' : ''}`}>

                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-primary-500/20 flex items-center justify-center
                                              text-primary-400 text-xs font-medium flex-shrink-0">
                                {r.name[0]}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <p className="text-slate-200 font-medium leading-tight">{r.name}</p>
                                  {edits.length > 0 && (
                                    <div className="relative group">
                                      <AlertTriangle size={13} className="text-amber-400 cursor-help flex-shrink-0" />
                                      <div className={`absolute z-50 left-1/2 -translate-x-1/2
                                                      ${showBelow ? 'top-full mt-2' : 'bottom-full mb-2'}
                                                      invisible group-hover:visible opacity-0 group-hover:opacity-100
                                                      transition-opacity duration-150 pointer-events-none`}>
                                        {showBelow && (
                                          <div className="w-2 h-2 bg-slate-900 border-l border-t border-slate-700
                                                          rotate-45 mx-auto -mb-1" />
                                        )}
                                        <div className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5
                                                        shadow-2xl text-xs min-w-max space-y-1.5">
                                          <p className="text-slate-400 font-medium pb-1 border-b border-slate-800">
                                            Засварын түүх
                                          </p>
                                          {edits.map((e, i) => (
                                            <div key={i} className="flex items-center gap-2">
                                              <span className="text-slate-500 font-mono w-10">
                                                {e.edited_at ? format(new Date(e.edited_at), 'HH:mm') : '—'}
                                              </span>
                                              <span className={STATUS_COLOR[e.old_status] || 'text-slate-400'}>
                                                {STATUS_LABEL[e.old_status] || e.old_status}
                                              </span>
                                              <span className="text-slate-600">→</span>
                                              <span className={STATUS_COLOR[e.new_status] || 'text-slate-400'}>
                                                {STATUS_LABEL[e.new_status] || e.new_status}
                                              </span>
                                              {e.edited_by_name && (
                                                <span className="text-slate-500 text-xs">· {e.edited_by_name}</span>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                        {!showBelow && (
                                          <div className="w-2 h-2 bg-slate-900 border-r border-b border-slate-700
                                                          rotate-45 mx-auto -mt-1" />
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <p className="text-xs text-slate-600">{r.student_id}</p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3 text-slate-400 text-xs">{r.department}</td>

                          <td className="px-4 py-3 font-mono text-xs text-slate-500">
                            {r.check_in ? format(new Date(r.check_in), 'HH:mm') : '—'}
                            {r.manual && <span className="ml-1 text-amber-500/70" title="Гараар бүртгэсэн">✎</span>}
                          </td>

                          <td className="px-4 py-3">
                            {r.status === 'present' && <span className="badge-present">Ирсэн</span>}
                            {r.status === 'late'    && <span className="badge-late">Хоцорсон</span>}
                            {r.status === 'absent'  && <span className="badge-absent">Ирсэнгүй</span>}
                            {r.status === 'sick'    && <span className="badge-sick">Өвчтэй</span>}
                            {r.status === 'excused' && <span className="badge-excused">Чөлөөтэй</span>}
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {[
                                { s: 'present', label: 'Ирсэн',    icon: Check,         cls: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20' },
                                { s: 'late',    label: 'Хоцорсон', icon: Clock,         cls: 'text-amber-400   border-amber-500/30   bg-amber-500/10   hover:bg-amber-500/20'   },
                                { s: 'absent',  label: 'Ирсэнгүй', icon: X,             cls: 'text-red-400     border-red-500/30     bg-red-500/10     hover:bg-red-500/20'     },
                                { s: 'sick',    label: 'Өвчтэй',   icon: Thermometer,   cls: 'text-purple-400  border-purple-500/30  bg-purple-500/10  hover:bg-purple-500/20'  },
                                { s: 'excused', label: 'Чөлөөтэй', icon: CalendarCheck, cls: 'text-sky-400     border-sky-500/30     bg-sky-500/10     hover:bg-sky-500/20'     },
                              ].map(({ s, label, icon: Icon, cls }) => (
                                <button
                                  key={s}
                                  title={label}
                                  disabled={updatingIds.has(r.student_id) || r.status === s || (s === 'absent' && !r.attendance_id)}
                                  onClick={() => updateStatus(r, s)}
                                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium
                                    transition-all disabled:opacity-40 disabled:cursor-not-allowed ${cls}
                                    ${r.status === s ? 'ring-1 ring-current' : ''}`}
                                >
                                  <Icon size={11} /> {label}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
