import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Layout     from './components/Layout'
import Login      from './pages/Login'
import Dashboard  from './pages/Dashboard'
import Students   from './pages/Students'
import Attendance from './pages/Attendance'
import Reports    from './pages/Reports'
import Enroll     from './pages/Enroll'
import Schedules  from './pages/Schedules'

function PrivateRoute({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: '#181c2e', border: '1px solid #252840', color: '#e2e8f0' },
            success: { iconTheme: { primary: '#10b981', secondary: '#181c2e' } },
            error:   { iconTheme: { primary: '#ef4444', secondary: '#181c2e' } },
          }}
        />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index              element={<Dashboard />} />
            <Route path="students"   element={<Students />} />
            <Route path="attendance" element={<Attendance />} />
            <Route path="enroll/:id" element={<Enroll />} />
            <Route path="reports"    element={<Reports />} />
            <Route path="schedules"  element={<Schedules />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}