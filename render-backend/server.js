const express = require('express')
const cors = require('cors')

require('./lib/firebase') // initialise admin SDK

const adminRoutes = require('./routes/admin')
const rescueRoutes = require('./routes/rescue')
const whatsappRoutes = require('./routes/whatsapp')

const app = express()

const allowed = (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim())
app.use(
  cors({
    origin: allowed.includes('*') ? true : allowed,
  })
)
app.use(express.json({ limit: '256kb' }))

app.get('/', (req, res) => res.send('min-rescue-backend OK'))
app.get('/healthz', (req, res) => res.json({ ok: true, ts: Date.now() }))

app.use('/admin', adminRoutes)
app.use('/rescue', rescueRoutes)
app.use('/whatsapp', whatsappRoutes)

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: err.message || 'Internal error' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`min-rescue-backend listening on :${PORT}`)
})
