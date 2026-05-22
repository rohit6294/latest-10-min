const { auth, db } = require('./firebase')

async function requireAuth(req) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) {
    const err = new Error('Missing bearer token')
    err.status = 401
    throw err
  }
  const idToken = header.slice('Bearer '.length).trim()
  try {
    return await auth.verifyIdToken(idToken)
  } catch (e) {
    const err = new Error('Invalid token: ' + e.message)
    err.status = 401
    throw err
  }
}

async function requireAdmin(req) {
  const decoded = await requireAuth(req)
  const adminSnap = await db.doc(`admins/${decoded.uid}`).get()
  if (!adminSnap.exists) {
    const err = new Error('Only admins can perform this action.')
    err.status = 403
    throw err
  }
  return decoded
}

module.exports = { requireAuth, requireAdmin }
