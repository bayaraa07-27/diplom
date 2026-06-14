import { createContext, useContext, useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(() => JSON.parse(localStorage.getItem('user') || 'null'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      // Optionally verify token with /me
      api.get('/auth/me').then(({ data }) => {
        setUser(data)
      }).catch(() => {
        logout()
      }).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email, password) => {
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      localStorage.setItem('token', data.token)
      localStorage.setItem('user',  JSON.stringify(data.user))
      api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`
      setUser(data.user)
      toast.success('Амжилттай нэвтэрлээ')
      return data.user
    } catch (error) {
      const message = error.response?.data?.error || 'Нэвтрэхэд алдаа гарлаа'
      toast.error(message)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    delete api.defaults.headers.common['Authorization']
    setUser(null)
    toast.success('Гарлаа')
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
