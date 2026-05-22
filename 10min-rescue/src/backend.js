// Render backend URL. Override in deployments with VITE_BACKEND_URL.
export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || 'https://min-rescue-backend.onrender.com'

export async function callBackend(path, { method = 'POST', body, idToken } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (idToken) headers.Authorization = `Bearer ${idToken}`

  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  let data = null
  try {
    data = await res.json()
  } catch (_) {}

  if (!res.ok) {
    const msg = (data && data.error) || `Backend error ${res.status}`
    throw new Error(msg)
  }
  return data
}
