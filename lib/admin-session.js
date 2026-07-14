export function getAdminToken() {
  return typeof window === 'undefined' ? '' : window.localStorage.getItem('amarktai_token') || ''
}

export function clearAdminSession() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem('amarktai_token')
  window.localStorage.removeItem('amarktai_user')
}

export function redirectToLogin() {
  if (typeof window === 'undefined' || window.location.pathname === '/login') return
  const next = `${window.location.pathname}${window.location.search}`
  window.location.replace(`/login?next=${encodeURIComponent(next)}`)
}

export async function adminFetch(input, init = {}) {
  const token = getAdminToken()
  const headers = new Headers(init.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(input, { ...init, headers })
  if (response.status === 401 || response.status === 403) {
    clearAdminSession()
    redirectToLogin()
  }
  return response
}
