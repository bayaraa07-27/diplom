import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
import api from '../utils/api'

const AttendanceContext = createContext(null)

export function AttendanceProvider({ children }) {
  const [selectedSchId,     setSelectedSchId]     = useState('')
  const [enrolledStudents,  setEnrolledStudents]  = useState([])
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [summary,           setSummary]           = useState(null)
  const [enrolledLoading,   setEnrolledLoading]   = useState(false)
  const [attendanceLoading, setAttendanceLoading] = useState(false)

  // Derived — attendanceRecords-аас тооцоолно
  const alreadyIds = useMemo(() =>
    attendanceRecords
      .filter(r => r.status === 'present' || r.status === 'late' || r.late)
      .map(r => r.student_id),
    [attendanceRecords]
  )

  const specialStatuses = useMemo(() => {
    const map = {}
    attendanceRecords.forEach(r => {
      if (r.status === 'sick' || r.status === 'excused') map[r.student_id] = r.status
    })
    return map
  }, [attendanceRecords])

  // ── Fetch функцүүд ────────────────────────────────────────────────

  const refreshEnrolled = useCallback(async () => {
    if (!selectedSchId) { setEnrolledStudents([]); setEnrolledLoading(false); return }
    setEnrolledLoading(true)
    try {
      const { data } = await api.get(`/students/by-schedule/${selectedSchId}`)
      setEnrolledStudents(data.students || [])
    } catch {
      setEnrolledStudents([])
    } finally {
      setEnrolledLoading(false)
    }
  }, [selectedSchId])

  const refreshAttendance = useCallback(async () => {
    if (!selectedSchId) { setAttendanceRecords([]); setAttendanceLoading(false); return }
    setAttendanceLoading(true)
    // Local date ашиглах — UTC-аас ялгаатай timezone-д date мismatch гарахаас сэргийлнэ
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    try {
      const { data } = await api.get(`/attendance/?date=${today}&limit=500`)
      const records = data.records || []
      // Зөвхөн тухайн хичээлийн болон schedule_id-гүй (хичээлгүй скан) бүртгэлийг үлдээнэ.
      // Бусад хичээлийн бүртгэлийг хасснаар хичээл хоорондын бохирдлоос сэргийлнэ.
      const filtered = {}
      records.forEach(r => {
        if (r.schedule_id === selectedSchId) {
          filtered[r.student_id] = r             // хичээл-specific бүртгэлд давуу эрх
        } else if (!r.schedule_id && !filtered[r.student_id]) {
          filtered[r.student_id] = r             // хичээлгүй скан — fallback
        }
      })
      setAttendanceRecords(Object.values(filtered))
    } catch {
      setAttendanceRecords([])
    } finally {
      setAttendanceLoading(false)
    }
  }, [selectedSchId])

  const refreshSummary = useCallback(async () => {
    try {
      const { data } = await api.get('/attendance/today-summary')
      setSummary(data)
    } catch {}
  }, [])

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshAttendance(), refreshSummary()])
  }, [refreshAttendance, refreshSummary])

  // selectedSchId өөрчлөгдөх бүрт мэдээллийг дахин ачаална
  useEffect(() => {
    setAttendanceRecords([])
    setEnrolledStudents([])
    // Fetch эхлэхээс өмнө loading=true — enrolledStudents ачаалагдаад attendanceRecords хоосон үед
    // "ирээгүй" харагдахаас сэргийлнэ
    setAttendanceLoading(true)
    setEnrolledLoading(true)
    refreshEnrolled()
    refreshAll()
  }, [selectedSchId, refreshEnrolled, refreshAll])

  // ── Mutation функцүүд ─────────────────────────────────────────────

  // Reports засвар хийсний дараа шуурхай local update — 30с хүлээхгүй
  const updateLocalRecord = useCallback((studentId, newStatus, attendanceId) => {
    if (newStatus === 'absent') {
      setAttendanceRecords(prev => prev.filter(r => r.student_id !== studentId))
    } else {
      setAttendanceRecords(prev => {
        const exists = prev.find(r => r.student_id === studentId)
        if (exists) {
          return prev.map(r =>
            r.student_id === studentId
              ? { ...r, status: newStatus === 'late' ? 'present' : newStatus, late: newStatus === 'late' }
              : r
          )
        }
        // Шинэ бичлэг — өмнө нь absent байсан оюутан
        return [...prev, {
          student_id:    studentId,
          status:        newStatus === 'late' ? 'present' : newStatus,
          late:          newStatus === 'late',
          attendance_id: attendanceId || null,
          check_in:      new Date().toISOString(),
          manual:        true,
        }]
      })
    }
    refreshSummary()
  }, [refreshSummary])

  // scanFrame-аас сервер буцаасан already_registered ID-уудыг attendanceRecords-д нэгтгэнэ
  const syncAlreadyIds = useCallback((ids) => {
    setAttendanceRecords(prev => {
      const existingIds = new Set(prev.map(r => r.student_id))
      const additions = ids
        .filter(id => !existingIds.has(id))
        .map(id => ({ student_id: id, status: 'present', late: false, manual: false }))
      const merged = prev.map(r =>
        ids.includes(r.student_id) && r.status === 'absent'
          ? { ...r, status: 'present' }
          : r
      )
      return additions.length > 0 ? [...merged, ...additions] : merged
    })
  }, [])

  return (
    <AttendanceContext.Provider value={{
      selectedSchId,
      setSelectedSchId,
      enrolledStudents,
      attendanceRecords,
      alreadyIds,
      specialStatuses,
      summary,
      enrolledLoading,
      attendanceLoading,
      refreshEnrolled,
      refreshAttendance,
      refreshSummary,
      refreshAll,
      updateLocalRecord,
      syncAlreadyIds,
    }}>
      {children}
    </AttendanceContext.Provider>
  )
}

export const useAttendance = () => useContext(AttendanceContext)
