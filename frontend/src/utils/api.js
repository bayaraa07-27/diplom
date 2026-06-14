import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

const MAX_RETRIES = 3
const RETRY_DELAY = 1000 // ms

api.interceptors.response.use(
  res => res,
  async err => {
    const config = err.config
    if (!config) return Promise.reject(err)

    config.retryCount = config.retryCount || 0
    const status = err.response?.status

    // 401: redirect without retry
    if (status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
      return Promise.reject(err)
    }

    // Retry on timeout, 5xx, or network errors
    const shouldRetry = !status || status >= 500 || err.code === 'ECONNABORTED'
    if (shouldRetry && config.retryCount < MAX_RETRIES) {
      config.retryCount++
      const delay = RETRY_DELAY * Math.pow(2, config.retryCount - 1)
      await new Promise(resolve => setTimeout(resolve, delay))
      return api(config)
    }

    return Promise.reject(err)
  }
)

export default api