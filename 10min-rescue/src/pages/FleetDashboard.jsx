import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { auth, db } from '../firebase'

/** 6-character A–Z, 2–9 join code (avoids 0/O, 1/I confusion). */
function makeJoinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

function timeAgo(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString()
}

const STATUS_LABELS = {
  pending_driver: { label: 'Finding Driver', cls: 'bg-yellow-100 text-yellow-700' },
  driver_assigned: { label: 'En Route', cls: 'bg-blue-100 text-blue-700' },
  patient_picked_up: { label: 'Picked Up', cls: 'bg-purple-100 text-purple-700' },
  awaiting_hospital_choice: { label: 'Picking Hospital', cls: 'bg-amber-100 text-amber-700' },
  hospital_assigned: { label: 'To Hospital', cls: 'bg-indigo-100 text-indigo-700' },
  in_transit: { label: 'In Transit', cls: 'bg-cyan-100 text-cyan-700' },
  completed: { label: 'Completed', cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500' },
}

const ACTIVE_TRIP_STATUSES = [
  'driver_assigned', 'patient_picked_up', 'awaiting_hospital_choice',
  'hospital_assigned', 'in_transit',
]

export default function FleetDashboard() {
  const navigate = useNavigate()
  const [authChecked, setAuthChecked] = useState(false)
  const [uid, setUid] = useState(null)
  const [fleet, setFleet] = useState(null)
  const [drivers, setDrivers] = useState([])
  const [trips, setTrips] = useState([])
  const [tab, setTab] = useState('drivers') // drivers | trips | settings
  const [linkPhone, setLinkPhone] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkMsg, setLinkMsg] = useState(null) // {ok: bool, text}
  const [codeBusy, setCodeBusy] = useState(false)

  // Auth guard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        navigate('/fleet')
        return
      }
      setUid(user.uid)
      setAuthChecked(true)
    })
    return unsub
  }, [navigate])

  // Live fleet doc
  useEffect(() => {
    if (!uid) return
    const unsub = onSnapshot(doc(db, 'ambulance_fleets', uid), (snap) => {
      if (snap.exists()) setFleet({ id: snap.id, ...snap.data() })
      else setFleet(null)
    })
    return unsub
  }, [uid])

  // Live drivers belonging to this fleet
  useEffect(() => {
    if (!uid) return
    const q = query(collection(db, 'drivers'), where('fleetId', '==', uid))
    const unsub = onSnapshot(q, (snap) => {
      setDrivers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, (err) => console.error('drivers stream:', err))
    return unsub
  }, [uid])

  // Live trips for this fleet's drivers (chunked by Firestore's 10-IN-clause limit)
  useEffect(() => {
    if (!uid) return
    const driverIds = drivers.map(d => d.id)
    if (driverIds.length === 0) {
      setTrips([])
      return
    }
    const chunks = []
    for (let i = 0; i < driverIds.length; i += 10) chunks.push(driverIds.slice(i, i + 10))
    const partials = new Map() // chunkIndex -> trips[]
    const unsubs = chunks.map((chunk, idx) => {
      const q = query(collection(db, 'rescue_requests'), where('assignedDriverId', 'in', chunk))
      return onSnapshot(q, (snap) => {
        partials.set(idx, snap.docs.map(d => ({ id: d.id, ...d.data() })))
        // Merge + dedupe by id
        const merged = new Map()
        partials.forEach(arr => arr.forEach(t => merged.set(t.id, t)))
        const all = [...merged.values()].sort((a, b) => {
          const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0)
          const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0)
          return tb - ta
        })
        setTrips(all)
      }, (err) => console.error('trips stream:', err))
    })
    return () => unsubs.forEach(u => u())
  }, [uid, drivers])

  async function handleSignOut() {
    await signOut(auth)
    navigate('/fleet')
  }

  async function regenerateJoinCode() {
    if (!uid) return
    setCodeBusy(true)
    try {
      await updateDoc(doc(db, 'ambulance_fleets', uid), {
        joinCode: makeJoinCode(),
        joinCodeUpdatedAt: serverTimestamp(),
      })
    } catch (e) {
      console.error('regen code failed', e)
      alert('Could not regenerate code.')
    } finally {
      setCodeBusy(false)
    }
  }

  async function linkDriverByPhone(e) {
    e.preventDefault()
    if (!uid) return
    const phone = linkPhone.trim()
    if (phone.length < 6) {
      setLinkMsg({ ok: false, text: 'Enter a valid phone number.' })
      return
    }
    setLinkBusy(true)
    setLinkMsg(null)
    try {
      // Look up driver by phone (drivers collection is fleet-readable per rules).
      const snap = await getDocs(query(collection(db, 'drivers'), where('phone', '==', phone)))
      if (snap.empty) {
        setLinkMsg({ ok: false, text: 'No driver found with that phone number.' })
        return
      }
      if (snap.docs.length > 1) {
        setLinkMsg({ ok: false, text: 'Multiple drivers found — link from app instead using the join code.' })
        return
      }
      const driver = snap.docs[0]
      if (driver.data().fleetId && driver.data().fleetId !== uid) {
        setLinkMsg({ ok: false, text: 'Driver is already linked to another fleet.' })
        return
      }
      await updateDoc(doc(db, 'drivers', driver.id), {
        fleetId: uid,
        fleetName: fleet?.name || '',
        fleetLinkedAt: serverTimestamp(),
      })
      setLinkMsg({ ok: true, text: `Linked ${driver.data().name || 'driver'} (${phone}).` })
      setLinkPhone('')
    } catch (e) {
      console.error('link driver failed', e)
      setLinkMsg({ ok: false, text: 'Failed — driver may not have granted fleet write access yet.' })
    } finally {
      setLinkBusy(false)
    }
  }

  async function unlinkDriver(driverId) {
    if (!confirm('Unlink this driver from your fleet?')) return
    try {
      await updateDoc(doc(db, 'drivers', driverId), {
        fleetId: null,
        fleetName: null,
        fleetLinkedAt: null,
      })
    } catch (e) {
      console.error('unlink failed', e)
      alert('Could not unlink — driver doc may be locked by rules.')
    }
  }

  const stats = useMemo(() => {
    const totalDrivers = drivers.length
    const onlineDrivers = drivers.filter(d => d.isOnline).length
    const verifiedDrivers = drivers.filter(d => d.verificationStatus === 'verified').length
    const activeTrips = trips.filter(t => ACTIVE_TRIP_STATUSES.includes(t.status)).length
    const today = new Date().toDateString()
    const completedToday = trips.filter(t => {
      if (t.status !== 'completed') return false
      const d = t.completedAt?.toDate ? t.completedAt.toDate() : t.createdAt?.toDate?.()
      return d && d.toDateString() === today
    }).length
    return { totalDrivers, onlineDrivers, verifiedDrivers, activeTrips, completedToday }
  }, [drivers, trips])

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-light-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-navy/60">Loading fleet...</p>
        </div>
      </div>
    )
  }

  if (!fleet) {
    return (
      <div className="min-h-screen bg-light-bg flex items-center justify-center p-6">
        <div className="max-w-md text-center bg-white rounded-3xl shadow-xl p-8">
          <p className="text-3xl mb-3">🚧</p>
          <h1 className="font-bold text-navy mb-2">Fleet profile missing</h1>
          <p className="text-sm text-gray-500 mb-4">
            Your account is signed in but no fleet profile is set up. Ask the Suraksha Kavach admin
            team to create your <code>ambulance_fleets/&lt;uid&gt;</code> document.
          </p>
          <button onClick={handleSignOut} className="text-sm font-semibold text-brand-red hover:underline">
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-light-bg">
      {/* Header */}
      <header className="bg-navy shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 brand-icon shadow-lg shadow-brand-red/40">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25" />
              </svg>
            </div>
            <div>
              <span className="text-white font-bold text-base hidden sm:inline">Suraksha <span className="text-brand-red">Kavach</span></span>
              <span className="text-white/40 mx-2 hidden sm:inline">|</span>
              <span className="text-white/70 text-sm font-medium">{fleet.name || 'Fleet'}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-green-500/20 border border-green-400/30 rounded-full px-3 py-1.5">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-green-300 text-xs font-semibold">{stats.onlineDrivers} Online</span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm font-medium bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Drivers" value={stats.totalDrivers} color="navy" />
          <StatCard label="Online Now" value={stats.onlineDrivers} color="green" pulse />
          <StatCard label="Verified" value={stats.verifiedDrivers} color="blue" />
          <StatCard label="Active Trips" value={stats.activeTrips} color="amber" pulse={stats.activeTrips > 0} />
          <StatCard label="Done Today" value={stats.completedToday} color="indigo" />
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-4 pt-4">
            <div className="flex gap-1">
              {[
                { id: 'drivers', label: `Fleet Drivers · ${drivers.length}` },
                { id: 'trips', label: `Live Trips · ${stats.activeTrips}` },
                { id: 'settings', label: 'Settings' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    tab === t.id ? 'bg-navy text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-navy'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 sm:p-6">
            {tab === 'drivers' && (
              <DriversTab
                drivers={drivers}
                onUnlink={unlinkDriver}
                linkPhone={linkPhone}
                setLinkPhone={setLinkPhone}
                linkBusy={linkBusy}
                linkMsg={linkMsg}
                onLink={linkDriverByPhone}
              />
            )}
            {tab === 'trips' && <TripsTab trips={trips} drivers={drivers} />}
            {tab === 'settings' && (
              <SettingsTab
                fleet={fleet}
                onRegen={regenerateJoinCode}
                codeBusy={codeBusy}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function StatCard({ label, value, color, pulse }) {
  const colors = {
    navy: 'text-navy bg-navy/5',
    green: 'text-green-600 bg-green-50',
    blue: 'text-blue-600 bg-blue-50',
    amber: 'text-amber-600 bg-amber-50',
    indigo: 'text-indigo-600 bg-indigo-50',
  }[color] || 'text-navy bg-navy/5'
  return (
    <div className={`rounded-2xl border border-gray-100 bg-white p-4 ${pulse && value > 0 ? 'ring-2 ring-current/20' : ''}`}>
      <div className={`inline-flex w-8 h-8 rounded-lg items-center justify-center ${colors} mb-3`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
      </div>
      <p className="text-2xl font-extrabold text-navy">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

function DriversTab({ drivers, onUnlink, linkPhone, setLinkPhone, linkBusy, linkMsg, onLink }) {
  return (
    <div className="space-y-5">
      <form onSubmit={onLink} className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Link a driver by phone</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={linkPhone}
            onChange={e => setLinkPhone(e.target.value)}
            placeholder="e.g. +919876543210"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red"
          />
          <button
            type="submit"
            disabled={linkBusy}
            className="bg-navy hover:bg-navy-light text-white font-semibold px-4 py-2.5 rounded-xl disabled:opacity-60"
          >
            {linkBusy ? 'Linking…' : 'Link Driver'}
          </button>
        </div>
        {linkMsg && (
          <p className={`text-xs mt-2 ${linkMsg.ok ? 'text-green-700' : 'text-red-600'}`}>{linkMsg.text}</p>
        )}
        <p className="text-[11px] text-gray-400 mt-2">
          Driver must already be registered in the mobile app. They can also self-link with your fleet code (Settings tab).
        </p>
      </form>

      {drivers.length === 0 ? (
        <div className="text-center py-14">
          <p className="text-3xl mb-2">🚑</p>
          <p className="text-navy font-semibold">No drivers linked yet</p>
          <p className="text-gray-400 text-sm mt-1">Share your fleet code or link drivers by phone above.</p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:-mx-6">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 sm:px-6 pb-3">Driver</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Vehicle</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Status</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Verified</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Linked</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {drivers.map(d => (
                <tr key={d.id} className="hover:bg-gray-50/50">
                  <td className="px-4 sm:px-6 py-3">
                    <div className="font-medium text-navy">{d.name || '—'}</div>
                    <div className="text-xs text-gray-400">{d.phone || '—'}</div>
                  </td>
                  <td className="px-3 py-3 text-gray-600 font-mono text-xs">{d.vehicleNumber || '—'}</td>
                  <td className="px-3 py-3">
                    {d.isOnline ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Online</span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Offline</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {d.verificationStatus === 'verified' ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Verified</span>
                    ) : d.verificationStatus === 'rejected' ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Rejected</span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pending</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500">{timeAgo(d.fleetLinkedAt)}</td>
                  <td className="px-3 py-3">
                    <button
                      onClick={() => onUnlink(d.id)}
                      className="text-xs font-semibold text-red-500 hover:underline"
                    >
                      Unlink
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TripsTab({ trips, drivers }) {
  const driverName = (id) => drivers.find(d => d.id === id)?.name || id?.slice(0, 6) || '—'
  if (trips.length === 0) {
    return (
      <div className="text-center py-14">
        <p className="text-3xl mb-2">🛣️</p>
        <p className="text-navy font-semibold">No trips yet</p>
        <p className="text-gray-400 text-sm mt-1">Trips by your drivers will appear here live.</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto -mx-4 sm:-mx-6">
      <table className="w-full text-sm min-w-[780px]">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 sm:px-6 pb-3">Patient</th>
            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Emergency</th>
            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Driver</th>
            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Hospital</th>
            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Status</th>
            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Started</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {trips.map(t => {
            const s = STATUS_LABELS[t.status] || { label: t.status, cls: 'bg-gray-100 text-gray-500' }
            return (
              <tr key={t.id} className="hover:bg-gray-50/50">
                <td className="px-4 sm:px-6 py-3">
                  <div className="font-medium text-navy">{t.patientName || '—'}</div>
                  {t.patientPhone && <div className="text-xs text-gray-400">{t.patientPhone}</div>}
                </td>
                <td className="px-3 py-3">
                  <span className="text-xs bg-orange-50 text-orange-700 font-medium px-2 py-0.5 rounded-full border border-orange-100 capitalize">
                    {t.emergencyType || '—'}
                  </span>
                </td>
                <td className="px-3 py-3 text-gray-700 text-xs">{driverName(t.assignedDriverId)}</td>
                <td className="px-3 py-3 text-gray-700 text-xs">{t.hospitalName || '—'}</td>
                <td className="px-3 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
                </td>
                <td className="px-3 py-3 text-gray-400 text-xs">{timeAgo(t.createdAt)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SettingsTab({ fleet, onRegen, codeBusy }) {
  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Fleet profile</p>
        <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
          <Row label="Name" value={fleet.name || '—'} />
          <Row label="Contact person" value={fleet.contactPerson || '—'} />
          <Row label="Phone" value={fleet.phone || '—'} />
          <Row label="Email" value={fleet.email || '—'} />
          <Row label="Address" value={fleet.address || '—'} />
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          To update profile details, contact the Suraksha Kavach admin team.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Driver join code</p>
        <div className="bg-white border-2 border-dashed border-brand-red/30 rounded-2xl p-5 flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-3xl font-extrabold text-brand-red tracking-widest">
              {fleet.joinCode || '— — — — — —'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Drivers enter this code in the mobile app's "Join Fleet" screen.
            </p>
          </div>
          <button
            onClick={onRegen}
            disabled={codeBusy}
            className="text-xs font-bold bg-navy hover:bg-navy-light text-white px-4 py-2 rounded-xl disabled:opacity-60"
          >
            {codeBusy ? 'Working…' : fleet.joinCode ? 'Regenerate' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-medium text-navy text-right truncate">{value}</span>
    </div>
  )
}
