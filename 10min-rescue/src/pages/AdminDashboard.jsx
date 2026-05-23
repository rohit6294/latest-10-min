import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  addDoc,
  GeoPoint,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import { callBackend } from '../backend'
import AdminStatsBar from '../components/admin/AdminStatsBar'
import DriverVerificationCard from '../components/admin/DriverVerificationCard'
import DriverDocModal from '../components/admin/DriverDocModal'

// ─── Utility badges ──────────────────────────────────────────────────────────

function VerificationBadge({ status }) {
  const map = {
    pending:  { cls: 'bg-amber-100 text-amber-700',  label: 'Pending'  },
    verified: { cls: 'bg-green-100 text-green-700',  label: 'Verified' },
    rejected: { cls: 'bg-red-100   text-red-700',    label: 'Rejected' },
  }
  const s = map[status] ?? map.pending
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
}

function OnlineBadge({ isOnline }) {
  return isOnline
    ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Online</span>
    : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Offline</span>
}

function RequestStatusBadge({ status }) {
  const map = {
    // Firestore status values (snake_case from Flutter app)
    pending_driver:    { cls: 'bg-amber-100  text-amber-700',   label: 'Finding Driver'     },
    driver_assigned:   { cls: 'bg-blue-100   text-blue-700',    label: 'Driver En Route'    },
    patient_picked_up: { cls: 'bg-purple-100 text-purple-700',  label: 'Patient Picked Up'  },
    pending_hospital:  { cls: 'bg-orange-100 text-orange-700',  label: 'Needs Hospital'     },
    hospital_assigned: { cls: 'bg-indigo-100 text-indigo-700',  label: 'Hospital Assigned'  },
    in_transit:        { cls: 'bg-cyan-100   text-cyan-700',    label: 'In Transit'         },
    completed:         { cls: 'bg-green-100  text-green-700',   label: 'Completed'          },
    cancelled:         { cls: 'bg-gray-100   text-gray-500',    label: 'Cancelled'          },
  }
  const s = map[status] ?? { cls: 'bg-gray-100 text-gray-500', label: status || '—' }
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function Skeleton({ className = '' }) {
  return <div className={`bg-gray-200 rounded-lg animate-pulse ${className}`} />
}

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabButton({ active, onClick, children, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
        active
          ? 'bg-navy text-white shadow-sm'
          : 'text-gray-500 hover:text-navy hover:bg-gray-100'
      }`}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
          active ? 'bg-white/20 text-white' : 'bg-emergency text-white'
        }`}>
          {badge}
        </span>
      )}
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const TABS = ['Pending Verification', 'All Drivers', 'Hospitals', 'Fleets', 'All Requests', '🚨 SOS Requests', '📞 Callbacks', '⚙️ Create Account']

export default function AdminDashboard() {
  const navigate = useNavigate()

  const [authLoading, setAuthLoading] = useState(true)
  const [drivers, setDrivers]       = useState([])
  const [hospitals, setHospitals]   = useState([])
  const [requests, setRequests]     = useState([])
  const [sosRequests, setSosRequests] = useState([])
  const [callbacks, setCallbacks] = useState([])
  const [fleets, setFleets]         = useState([])
  const [dataLoading, setDataLoading] = useState(true)

  const [activeTab, setActiveTab]   = useState(0)
  const [docModal, setDocModal]     = useState(null) // driver object
  const [bedModal, setBedModal]     = useState(null) // hospital object
  const [editHospitalModal, setEditHospitalModal] = useState(null)
  const [editFleetModal, setEditFleetModal] = useState(null)
  const [editDriverModal, setEditDriverModal] = useState(null)

  // approve/reject loading maps  { [driverId]: true }
  const [approving, setApproving]   = useState({})
  const [rejecting, setRejecting]   = useState({})

  // All-drivers filter
  const [driverFilter, setDriverFilter] = useState('All')

  // ── Auth guard ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (!user) {
        navigate('/admin', { replace: true })
      } else {
        setAuthLoading(false)
      }
    })
    return unsub
  }, [navigate])

  // ── Real-time data ──
  useEffect(() => {
    if (authLoading) return

    // Track which collections have responded (success OR error).
    // Once all 5 have responded, hide skeleton — even if some failed.
    const respondedCollections = new Set()
    const markResponded = (name) => {
      respondedCollections.add(name)
      if (respondedCollections.size >= 6) setDataLoading(false)
    }

    // Safety: if any stream is slow/silently broken, force UI to render after 6s
    const safetyTimer = setTimeout(() => setDataLoading(false), 6000)

    const sortByCreatedAtDesc = (docs) => docs.sort((a, b) => {
      const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0)
      const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0)
      return tb - ta
    })

    const unsubDrivers = onSnapshot(
      collection(db, 'drivers'),
      snap => {
        setDrivers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        markResponded('drivers')
      },
      err => { console.error('drivers stream:', err); markResponded('drivers') }
    )
    const unsubHospitals = onSnapshot(
      collection(db, 'hospitals'),
      snap => {
        setHospitals(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        markResponded('hospitals')
      },
      err => { console.error('hospitals stream:', err); markResponded('hospitals') }
    )
    const unsubRequests = onSnapshot(
      collection(db, 'rescue_requests'),
      snap => {
        setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        markResponded('rescue_requests')
      },
      err => { console.error('rescue_requests stream:', err); markResponded('rescue_requests') }
    )
    const unsubSos = onSnapshot(
      collection(db, 'sos_requests'),
      snap => {
        setSosRequests(sortByCreatedAtDesc(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
        markResponded('sos_requests')
      },
      err => { console.error('sos_requests stream:', err); markResponded('sos_requests') }
    )
    const unsubCB = onSnapshot(
      collection(db, 'callback_requests'),
      snap => {
        setCallbacks(sortByCreatedAtDesc(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
        markResponded('callback_requests')
      },
      err => {
        console.error('callback_requests stream (likely rules issue):', err)
        markResponded('callback_requests')
      }
    )
    const unsubFleets = onSnapshot(
      collection(db, 'ambulance_fleets'),
      snap => {
        setFleets(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        markResponded('ambulance_fleets')
      },
      err => {
        console.error('ambulance_fleets stream:', err)
        markResponded('ambulance_fleets')
      }
    )

    return () => {
      clearTimeout(safetyTimer)
      unsubDrivers(); unsubHospitals(); unsubRequests(); unsubSos(); unsubCB(); unsubFleets()
    }
  }, [authLoading])

  // ── Actions ──

  async function handleApprove(driverId) {
    setApproving(p => ({ ...p, [driverId]: true }))
    try {
      await updateDoc(doc(db, 'drivers', driverId), {
        verificationStatus: 'verified',
        verifiedAt: serverTimestamp(),
      })
    } catch (e) {
      console.error('Approve failed', e)
    } finally {
      setApproving(p => ({ ...p, [driverId]: false }))
    }
  }

  async function handleReject(driver, reason) {
    setRejecting(p => ({ ...p, [driver.id]: true }))
    try {
      await updateDoc(doc(db, 'drivers', driver.id), {
        verificationStatus: 'rejected',
        rejectionReason: reason,
      })
    } catch (e) {
      console.error('Reject failed', e)
    } finally {
      setRejecting(p => ({ ...p, [driver.id]: false }))
    }
  }

  async function handleToggleAvailable(driver) {
    await updateDoc(doc(db, 'drivers', driver.id), {
      isAvailable: !driver.isAvailable,
    })
  }

  async function handleToggleHospital(hospital) {
    await updateDoc(doc(db, 'hospitals', hospital.id), {
      isActive: !hospital.isActive,
    })
  }

  async function handleSignOut() {
    await signOut(auth)
    navigate('/admin', { replace: true })
  }

  // ── Derived data ──

  const pendingDrivers = drivers.filter(
    d => d.verificationStatus === 'pending' && d.documents && Object.keys(d.documents).length > 0
  )

  const filteredDrivers = (() => {
    if (driverFilter === 'Online')   return drivers.filter(d => d.isOnline)
    if (driverFilter === 'Verified') return drivers.filter(d => d.verificationStatus === 'verified')
    if (driverFilter === 'Pending')  return drivers.filter(d => d.verificationStatus === 'pending')
    return drivers
  })()

  const sortedRequests = [...requests].sort((a, b) => {
    const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt ?? 0)
    const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt ?? 0)
    return tb - ta
  })

  const onlineCount = drivers.filter(d => d.isOnline).length

  function formatTime(ts) {
    if (!ts) return '—'
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  function formatDate(ts) {
    if (!ts) return '—'
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function driverName(id) {
    const d = drivers.find(dr => dr.id === id)
    return d?.name ?? id ?? '—'
  }

  function hospitalName(id) {
    const h = hospitals.find(ho => ho.id === id)
    return h?.name ?? id ?? '—'
  }

  // ── Loading splash ──
  if (authLoading) {
    return (
      <div className="min-h-screen bg-light-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 bg-emergency rounded-2xl flex items-center justify-center shadow-lg shadow-emergency/40 animate-pulse">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <p className="text-gray-400 text-sm">Authenticating...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-light-bg">
      {/* ── Header ── */}
      <header className="bg-navy shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo + title */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 brand-icon shadow-lg shadow-brand-red/40">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div className="hidden sm:block">
              <span className="text-white font-bold text-lg">Suraksha <span className="text-brand-red">Kavach</span></span>
              <span className="text-white/40 mx-2">|</span>
              <span className="text-white/70 text-sm font-medium">Admin Panel</span>
            </div>
            <span className="sm:hidden text-white font-bold text-base">Admin Panel</span>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Online badge */}
            <div className="flex items-center gap-2 bg-green-500/20 border border-green-400/30 rounded-full px-3 py-1.5">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-green-300 text-xs font-semibold">{onlineCount} Online</span>
            </div>

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm font-medium transition-colors bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Stats bar */}
        {dataLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <Skeleton className="w-9 h-9 mb-3" />
                <Skeleton className="w-12 h-7 mb-1" />
                <Skeleton className="w-24 h-3" />
              </div>
            ))}
          </div>
        ) : (
          <AdminStatsBar drivers={drivers} hospitals={hospitals} requests={requests} />
        )}

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Tab bar */}
          <div className="px-4 pt-4 pb-0 border-b border-gray-100 overflow-x-auto">
            <div className="flex gap-1 pb-0 min-w-max">
              {TABS.map((tab, i) => (
                <TabButton
                  key={tab}
                  active={activeTab === i}
                  onClick={() => setActiveTab(i)}
                  badge={
                    i === 0 ? pendingDrivers.length
                    : i === 5 ? sosRequests.filter(s => s.status === 'pending').length
                    : i === 6 ? callbacks.filter(c => c.status === 'pending_call').length
                    : undefined
                  }
                >
                  {tab}
                </TabButton>
              ))}
            </div>
          </div>

          <div className="p-4 sm:p-6">
            {/* ── Tab 0: Pending Verification ── */}
            {activeTab === 0 && (
              <div>
                {dataLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="bg-gray-50 rounded-2xl p-5 space-y-3">
                        <div className="flex gap-3"><Skeleton className="w-10 h-10 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div></div>
                        <Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" />
                        <Skeleton className="h-9 w-full rounded-xl" />
                      </div>
                    ))}
                  </div>
                ) : pendingDrivers.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-gray-500 font-medium">All caught up!</p>
                    <p className="text-gray-400 text-sm mt-1">No drivers pending verification.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pendingDrivers.map(driver => (
                      <DriverVerificationCard
                        key={driver.id}
                        driver={driver}
                        onApprove={handleApprove}
                        onReject={handleReject}
                        approving={!!approving[driver.id]}
                        rejecting={!!rejecting[driver.id]}
                        onViewDocs={setDocModal}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Tab 1: All Drivers ── */}
            {activeTab === 1 && (
              <div>
                {/* Filter bar */}
                <div className="flex gap-2 mb-4 flex-wrap">
                  {['All', 'Online', 'Verified', 'Pending'].map(f => (
                    <button
                      key={f}
                      onClick={() => setDriverFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        driverFilter === f
                          ? 'bg-navy text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {f}
                      {f === 'All' && <span className="ml-1 opacity-60">({drivers.length})</span>}
                      {f === 'Online' && <span className="ml-1 opacity-60">({drivers.filter(d => d.isOnline).length})</span>}
                      {f === 'Verified' && <span className="ml-1 opacity-60">({drivers.filter(d => d.verificationStatus === 'verified').length})</span>}
                      {f === 'Pending' && <span className="ml-1 opacity-60">({drivers.filter(d => d.verificationStatus === 'pending').length})</span>}
                    </button>
                  ))}
                </div>

                {dataLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : filteredDrivers.length === 0 ? (
                  <p className="text-center text-gray-400 py-10">No drivers found.</p>
                ) : (
                  <div className="overflow-x-auto -mx-4 sm:-mx-6">
                    <table className="w-full text-sm min-w-[700px]">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 sm:px-6 pb-3">Name</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Phone</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Vehicle No.</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Status</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Verified</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filteredDrivers.map(driver => (
                          <tr key={driver.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 sm:px-6 py-3 font-medium text-navy">{driver.name || '—'}</td>
                            <td className="px-3 py-3 text-gray-600">{driver.phone || '—'}</td>
                            <td className="px-3 py-3 text-gray-600 font-mono text-xs">{driver.vehicleNumber || '—'}</td>
                            <td className="px-3 py-3"><OnlineBadge isOnline={driver.isOnline} /></td>
                            <td className="px-3 py-3"><VerificationBadge status={driver.verificationStatus} /></td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setEditDriverModal(driver)}
                                  className="text-xs font-semibold text-indigo-600 hover:underline"
                                >
                                  Edit
                                </button>
                                <span className="text-gray-200">|</span>
                                <button
                                  onClick={() => setDocModal(driver)}
                                  className="text-xs font-medium text-accent-blue hover:underline"
                                >
                                  Docs
                                </button>
                                <span className="text-gray-200">|</span>
                                {driver.isAvailable ? (
                                  <button
                                    onClick={() => handleToggleAvailable(driver)}
                                    className="text-xs font-medium text-red-500 hover:underline"
                                  >
                                    Suspend
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleToggleAvailable(driver)}
                                    className="text-xs font-medium text-green-600 hover:underline"
                                  >
                                    Activate
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab 2: Hospitals ── */}
            {activeTab === 2 && (
              <div>
                {dataLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : hospitals.length === 0 ? (
                  <p className="text-center text-gray-400 py-10">No hospitals registered.</p>
                ) : (
                  <div className="overflow-x-auto -mx-4 sm:-mx-6">
                    <table className="w-full text-sm min-w-[860px]">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 sm:px-6 pb-3">Name</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Beds (avail/total)</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Rating</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Active</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {hospitals.map(hospital => (
                          <tr key={hospital.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 sm:px-6 py-3">
                              <div className="font-medium text-navy">{hospital.name || '—'}</div>
                              <div className="text-xs text-gray-400">{hospital.phone || '—'}</div>
                            </td>
                            <td className="px-3 py-3 text-xs">
                              <div className="flex flex-col gap-0.5">
                                <span><span className="text-red-600 font-bold">ICU:</span> {hospital.icuAvailable || 0}/{hospital.icuBeds || 0}</span>
                                <span><span className="text-amber-600 font-bold">Adv:</span> {hospital.advancedAvailable || 0}/{hospital.advancedBeds || 0}</span>
                                <span><span className="text-green-600 font-bold">Norm:</span> {hospital.normalAvailable || 0}/{hospital.normalBeds || 0}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-xs">
                              {(hospital.rating || 0) > 0 ? (
                                <span className="inline-flex items-center gap-1 text-amber-600 font-bold">
                                  ⭐ {(hospital.rating || 0).toFixed(1)}
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-3">
                              <button
                                onClick={() => handleToggleHospital(hospital)}
                                className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors focus:outline-none ${
                                  hospital.isActive ? 'bg-green-500' : 'bg-gray-300'
                                }`}
                                title={hospital.isActive ? 'Deactivate' : 'Activate'}
                              >
                                <span
                                  className={`inline-block w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                    hospital.isActive ? 'translate-x-4' : 'translate-x-0.5'
                                  }`}
                                />
                              </button>
                            </td>
                            <td className="px-3 py-3">
                              <button
                                onClick={() => setBedModal(hospital)}
                                className="text-xs font-bold bg-brand-red/10 text-brand-red hover:bg-brand-red hover:text-white px-3 py-1.5 rounded-lg transition-colors"
                              >
                                Edit Beds
                              </button>
                              <button
                                onClick={() => setEditHospitalModal(hospital)}
                                className="text-xs font-bold border-2 border-gray-200 text-navy hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors ml-2"
                              >
                                Edit Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab 3: Fleets ── */}
            {activeTab === 3 && (
              <div>
                {dataLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : fleets.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                      </svg>
                    </div>
                    <p className="text-gray-500 font-medium">No fleets registered yet.</p>
                    <p className="text-gray-400 text-sm mt-1">Create one from the ⚙️ Create Account tab.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-4 sm:-mx-6">
                    <table className="w-full text-sm min-w-[780px]">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 sm:px-6 pb-3">Fleet Name</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Contact</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Phone</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Join Code</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Drivers</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Status</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {fleets.map(fleet => {
                          const linkedDrivers = drivers.filter(d => d.fleetId === fleet.id)
                          return (
                            <tr key={fleet.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-4 sm:px-6 py-3">
                                <div className="font-medium text-navy">{fleet.name || '—'}</div>
                                <div className="text-xs text-gray-400">{fleet.email || '—'}</div>
                              </td>
                              <td className="px-3 py-3 text-gray-600 text-xs">{fleet.contactPerson || '—'}</td>
                              <td className="px-3 py-3 text-gray-600 text-xs">{fleet.phone || '—'}</td>
                              <td className="px-3 py-3">
                                {fleet.joinCode ? (
                                  <span className="font-mono text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg font-bold tracking-widest">{fleet.joinCode}</span>
                                ) : <span className="text-gray-300 text-xs">Not set</span>}
                              </td>
                              <td className="px-3 py-3">
                                <span className="text-xs font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded-full">{linkedDrivers.length}</span>
                              </td>
                              <td className="px-3 py-3">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${fleet.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {fleet.isActive !== false ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="px-3 py-3">
                                <button
                                  onClick={() => setEditFleetModal(fleet)}
                                  className="text-xs font-bold border-2 border-gray-200 text-navy hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  Edit Details
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab 5: SOS Requests ── */}
            {activeTab === 5 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-gray-500">
                    Real-time SOS requests from the website. Location saved automatically.
                  </p>
                  <span className="text-xs bg-emergency/10 text-emergency font-semibold px-3 py-1 rounded-full">
                    {sosRequests.filter(s => s.status === 'pending').length} Pending
                  </span>
                </div>
                {dataLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
                  </div>
                ) : sosRequests.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                    </div>
                    <p className="text-gray-400 font-medium">No SOS requests yet.</p>
                    <p className="text-gray-400 text-sm mt-1">They'll appear here instantly when someone uses the SOS page.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sosRequests.map(sos => (
                      <div
                        key={sos.id}
                        className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-all ${
                          sos.status === 'pending'
                            ? 'bg-emergency/5 border-emergency/20'
                            : 'bg-gray-50 border-gray-100'
                        }`}
                      >
                        {/* Icon */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          sos.status === 'pending' ? 'bg-emergency/15' : 'bg-gray-200'
                        }`}>
                          <svg className={`w-5 h-5 ${sos.status === 'pending' ? 'text-emergency' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                          </svg>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              sos.status === 'pending' ? 'bg-emergency text-white' : 'bg-green-100 text-green-700'
                            }`}>
                              {sos.status === 'pending' ? '🚨 PENDING' : '✅ RESOLVED'}
                            </span>
                            <span className="text-xs text-gray-400">{formatTime(sos.createdAt)}</span>
                            {sos.accuracy && (
                              <span className="text-xs text-gray-400">±{sos.accuracy}m accuracy</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <a
                              href={sos.mapsLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-semibold text-accent-blue hover:underline flex items-center gap-1"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                              </svg>
                              View on Google Maps
                            </a>
                            <span className="text-xs text-gray-400 font-mono">
                              {sos.latitude?.toFixed(5)}, {sos.longitude?.toFixed(5)}
                            </span>
                          </div>
                        </div>

                        {/* Action */}
                        {sos.status === 'pending' && (
                          <button
                            onClick={() => updateDoc(doc(db, 'sos_requests', sos.id), { status: 'resolved', resolvedAt: serverTimestamp() })}
                            className="shrink-0 bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
                          >
                            Mark Resolved
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Tab 4: All Requests ── */}
            {activeTab === 4 && (
              <div>
                {dataLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : sortedRequests.length === 0 ? (
                  <p className="text-center text-gray-400 py-10">No rescue requests found.</p>
                ) : (
                  <div className="overflow-x-auto -mx-4 sm:-mx-6">
                    <table className="w-full text-sm min-w-[780px]">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 sm:px-6 pb-3">Patient</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Emergency</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Status</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Driver</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Hospital</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-3">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {sortedRequests.map(req => (
                          <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 sm:px-6 py-3">
                              <div className="font-medium text-navy">{req.patientName || '—'}</div>
                              {req.patientPhone && <div className="text-xs text-gray-400">{req.patientPhone}</div>}
                            </td>
                            <td className="px-3 py-3">
                              <span className="text-xs bg-orange-50 text-orange-700 font-medium px-2 py-0.5 rounded-full border border-orange-100">
                                {req.emergencyType || '—'}
                              </span>
                            </td>
                            <td className="px-3 py-3"><RequestStatusBadge status={req.status} /></td>
                            <td className="px-3 py-3 text-gray-600 text-xs">
                              {req.assignedDriverId ? driverName(req.assignedDriverId) : <span className="text-gray-300">Unassigned</span>}
                            </td>
                            <td className="px-3 py-3 text-gray-600 text-xs">
                              {req.assignedHospitalId ? hospitalName(req.assignedHospitalId) : <span className="text-gray-300">Unassigned</span>}
                            </td>
                            <td className="px-3 py-3 text-gray-400 text-xs">{formatTime(req.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab 6: Callbacks ── */}
            {activeTab === 6 && (
              <CallbacksTab
                callbacks={callbacks}
                drivers={drivers}
                hospitals={hospitals}
                formatTime={formatTime}
              />
            )}

            {/* ── Tab 7: Create Account ── */}
            {activeTab === 7 && (
              <CreateAccountTab
                drivers={drivers}
                hospitals={hospitals}
                fleets={fleets}
              />
            )}
          </div>
        </div>
      </main>

      {/* Doc Modal */}
      {docModal && (
        <DriverDocModal
          driver={docModal}
          onClose={() => setDocModal(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          approving={!!approving[docModal.id]}
          rejecting={!!rejecting[docModal.id]}
        />
      )}

      {/* Bed Modal */}
      {bedModal && (
        <BedManagementModal
          hospital={bedModal}
          onClose={() => setBedModal(null)}
        />
      )}

      {/* Edit Hospital Modal */}
      {editHospitalModal && (
        <EditHospitalModal
          hospital={editHospitalModal}
          onClose={() => setEditHospitalModal(null)}
        />
      )}

      {/* Edit Fleet Modal */}
      {editFleetModal && (
        <EditFleetModal
          fleet={editFleetModal}
          onClose={() => setEditFleetModal(null)}
        />
      )}

      {/* Edit Driver Modal */}
      {editDriverModal && (
        <EditDriverModal
          driver={editDriverModal}
          fleets={fleets}
          onClose={() => setEditDriverModal(null)}
        />
      )}
    </div>
  )
}

// ─── Bed Management Modal ───────────────────────────────────────────────────

function BedManagementModal({ hospital, onClose }) {
  const [icuBeds, setIcuBeds] = useState(hospital.icuBeds || 0)
  const [icuAvailable, setIcuAvailable] = useState(hospital.icuAvailable || 0)
  const [advancedBeds, setAdvancedBeds] = useState(hospital.advancedBeds || 0)
  const [advancedAvailable, setAdvancedAvailable] = useState(hospital.advancedAvailable || 0)
  const [normalBeds, setNormalBeds] = useState(hospital.normalBeds || 0)
  const [normalAvailable, setNormalAvailable] = useState(hospital.normalAvailable || 0)
  const [rating, setRating] = useState(hospital.rating || 0)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'hospitals', hospital.id), {
        icuBeds: Number(icuBeds) || 0,
        icuAvailable: Math.min(Number(icuAvailable) || 0, Number(icuBeds) || 0),
        advancedBeds: Number(advancedBeds) || 0,
        advancedAvailable: Math.min(Number(advancedAvailable) || 0, Number(advancedBeds) || 0),
        normalBeds: Number(normalBeds) || 0,
        normalAvailable: Math.min(Number(normalAvailable) || 0, Number(normalBeds) || 0),
        rating: Math.min(5, Math.max(0, Number(rating) || 0)),
      })
      onClose()
    } catch (e) {
      console.error('Save failed:', e)
      alert('Failed to save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-navy">{hospital.name}</h2>
            <p className="text-xs text-gray-400">Bed availability & rating</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-navy">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <BedRow label="ICU (Type A)" color="red" total={icuBeds} avail={icuAvailable} setTotal={setIcuBeds} setAvail={setIcuAvailable} />
          <BedRow label="Advanced (Type B)" color="amber" total={advancedBeds} avail={advancedAvailable} setTotal={setAdvancedBeds} setAvail={setAdvancedAvailable} />
          <BedRow label="Normal (Type C)" color="green" total={normalBeds} avail={normalAvailable} setTotal={setNormalBeds} setAvail={setNormalAvailable} />
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Rating (0-5)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="5"
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red"
            />
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border-2 border-gray-200 text-navy font-semibold py-2.5 rounded-xl hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 bg-brand-red hover:bg-brand-red-dark text-white font-bold py-2.5 rounded-xl disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BedRow({ label, color, total, avail, setTotal, setAvail }) {
  const colorClass = color === 'red' ? 'text-red-600' : color === 'amber' ? 'text-amber-600' : 'text-green-600'
  return (
    <div>
      <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${colorClass}`}>{label}</label>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] text-gray-400 mb-1">Total beds</div>
          <input
            type="number"
            min="0"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-navy focus:outline-none focus:border-brand-red"
          />
        </div>
        <div>
          <div className="text-[10px] text-gray-400 mb-1">Available now</div>
          <input
            type="number"
            min="0"
            max={total}
            value={avail}
            onChange={(e) => setAvail(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-navy focus:outline-none focus:border-brand-red"
          />
        </div>
      </div>
    </div>
  )
}

// ─── Edit Hospital Modal ─────────────────────────────────────────────────────

function EditHospitalModal({ hospital, onClose }) {
  const [name, setName] = useState(hospital.name || '')
  const [phone, setPhone] = useState(hospital.phone || '')
  const [address, setAddress] = useState(hospital.address || '')
  const [latitude, setLatitude] = useState(hospital.location?.latitude || '')
  const [longitude, setLongitude] = useState(hospital.location?.longitude || '')
  const [facilities, setFacilities] = useState(
    Array.isArray(hospital.facilities) ? hospital.facilities.join(', ') : ''
  )
  const [showMapPicker, setShowMapPicker] = useState(false)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const updates = {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        facilities: facilities
          .split(',')
          .map((f) => f.trim())
          .filter((f) => f.length > 0),
      }
      if (latitude !== '' && longitude !== '') {
        updates.location = new GeoPoint(Number(latitude), Number(longitude))
      } else {
        updates.location = null
      }
      await updateDoc(doc(db, 'hospitals', hospital.id), updates)
      onClose()
    } catch (e) {
      console.error('Save failed:', e)
      alert('Failed to save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-navy">Edit Hospital Details</h2>
            <p className="text-xs text-gray-400">Update general information & location</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-navy">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Hospital Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Top 5 Facilities (comma-separated)</label>
            <input
              type="text"
              value={facilities}
              onChange={(e) => setFacilities(e.target.value)}
              placeholder="e.g. Cardiac Care, Trauma Center, Pediatrics"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Address</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red"
              />
              <button
                type="button"
                onClick={() => setShowMapPicker(true)}
                className="shrink-0 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold px-4 py-2.5 rounded-xl border border-blue-200 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
                Pick
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Latitude</label>
              <input
                type="number"
                step="any"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Longitude</label>
              <input
                type="number"
                step="any"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red font-mono"
              />
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border-2 border-gray-200 text-navy font-semibold py-2.5 rounded-xl hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="flex-1 bg-brand-red hover:bg-brand-red-dark text-white font-bold py-2.5 rounded-xl disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {showMapPicker && (
        <LocationPickerModal
          initialAddress={address}
          initialCoords={latitude !== '' && longitude !== '' ? { lat: Number(latitude), lng: Number(longitude) } : undefined}
          onConfirm={(addr, coords) => {
            setAddress(addr)
            setLatitude(coords.lat)
            setLongitude(coords.lng)
            setShowMapPicker(false)
          }}
          onClose={() => setShowMapPicker(false)}
        />
      )}
    </div>
  )
}

// ─── Edit Fleet Modal ────────────────────────────────────────────────────────

function EditFleetModal({ fleet, onClose }) {
  const [name, setName] = useState(fleet.name || '')
  const [contactPerson, setContactPerson] = useState(fleet.contactPerson || '')
  const [phone, setPhone] = useState(fleet.phone || '')
  const [address, setAddress] = useState(fleet.address || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'ambulance_fleets', fleet.id), {
        name: name.trim(),
        contactPerson: contactPerson.trim(),
        phone: phone.trim(),
        address: address.trim(),
      })
      onClose()
    } catch (e) {
      console.error('Save failed:', e)
      alert('Failed to save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-navy">Edit Fleet / NGO Details</h2>
            <p className="text-xs text-gray-400">Update general information & contact person</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-navy">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Fleet Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Contact Person *</label>
            <input
              type="text"
              required
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red"
            />
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border-2 border-gray-200 text-navy font-semibold py-2.5 rounded-xl hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !name.trim() || !contactPerson.trim()}
            className="flex-1 bg-brand-red hover:bg-brand-red-dark text-white font-bold py-2.5 rounded-xl disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Driver Modal ───────────────────────────────────────────────────────

function EditDriverModal({ driver, fleets, onClose }) {
  const [name, setName] = useState(driver.name || '')
  const [phone, setPhone] = useState(driver.phone || '')
  const [vehicleNumber, setVehicleNumber] = useState(driver.vehicleNumber || '')
  const [vehicleType, setVehicleType] = useState(driver.vehicleType || 'BLS')
  const [selectedFleetId, setSelectedFleetId] = useState(driver.fleetId || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const ambulanceType = vehicleType === 'ALS' ? 'A' : vehicleType === 'BLS' ? 'B' : 'C'
      const chosenFleet = fleets.find(f => f.id === selectedFleetId)
      
      await updateDoc(doc(db, 'drivers', driver.id), {
        name: name.trim(),
        phone: phone.trim(),
        vehicleNumber: vehicleNumber.trim(),
        vehicleType,
        ambulanceType,
        fleetId: selectedFleetId || null,
        fleetName: chosenFleet ? chosenFleet.name : null,
      })
      onClose()
    } catch (e) {
      console.error('Save failed:', e)
      alert('Failed to save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-navy">Edit Driver Details</h2>
            <p className="text-xs text-gray-400">Update general information & vehicle linking</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-navy">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Driver Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Vehicle Number</label>
            <input
              type="text"
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Vehicle Type</label>
            <div className="grid grid-cols-3 gap-2">
              {['BLS', 'ALS', 'Patient Transport'].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setVehicleType(t)}
                  className={`py-2 rounded-lg font-semibold text-xs border-2 transition-colors ${
                    vehicleType === t ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Link to Fleet (Optional)</label>
            <select
              value={selectedFleetId}
              onChange={(e) => setSelectedFleetId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red bg-white"
            >
              <option value="">— No fleet (Independent driver) —</option>
              {fleets.map(f => (
                <option key={f.id} value={f.id}>{f.name} {f.phone ? `(${f.phone})` : ''}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border-2 border-gray-200 text-navy font-semibold py-2.5 rounded-xl hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="flex-1 bg-brand-red hover:bg-brand-red-dark text-white font-bold py-2.5 rounded-xl disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Callbacks Tab ───────────────────────────────────────────────────────

function CallbacksTab({ callbacks, drivers, hospitals, formatTime }) {
  const [showNew, setShowNew] = useState(false)

  const STATUS_MAP = {
    pending_call: { cls: 'bg-amber-100 text-amber-700', label: 'Pending Call' },
    called: { cls: 'bg-blue-100 text-blue-700', label: 'Called' },
    converted: { cls: 'bg-green-100 text-green-700', label: 'Converted' },
    cancelled: { cls: 'bg-gray-100 text-gray-500', label: 'Cancelled' },
  }

  const URGENCY_MAP = {
    critical: { cls: 'bg-red-100 text-red-700', label: '🔴 Critical' },
    serious: { cls: 'bg-amber-100 text-amber-700', label: '🟡 Serious' },
    stable: { cls: 'bg-green-100 text-green-700', label: '🟢 Stable' },
  }

  async function markCalled(id) {
    await updateDoc(doc(db, 'callback_requests', id), {
      status: 'called',
      calledAt: serverTimestamp(),
    })
  }

  async function cancel(id) {
    await updateDoc(doc(db, 'callback_requests', id), { status: 'cancelled' })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          Callback requests from /callback page. Call patient and convert if needed.
        </p>
        <button
          onClick={() => setShowNew(true)}
          className="bg-brand-red hover:bg-brand-red-dark text-white text-xs font-bold px-4 py-2 rounded-xl"
        >
          + New Callback
        </button>
      </div>

      {callbacks.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">📞</div>
          <p className="text-gray-400 font-medium">No callback requests yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {callbacks.map(cb => {
            const status = STATUS_MAP[cb.status] || STATUS_MAP.pending_call
            const urgency = URGENCY_MAP[cb.urgencyLevel] || URGENCY_MAP.stable
            return (
              <div key={cb.id} className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row gap-3 sm:items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${status.cls}`}>{status.label}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${urgency.cls}`}>{urgency.label}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Type {cb.ambulanceType || 'C'}</span>
                      <span className="text-xs text-gray-400">{formatTime(cb.createdAt)}</span>
                    </div>
                    <div className="font-semibold text-navy">{cb.patientName || '—'}</div>
                    <a href={`tel:${cb.patientPhone}`} className="text-sm text-accent-blue hover:underline font-medium">
                      📞 {cb.patientPhone}
                    </a>
                    {cb.emergencyDescription && (
                      <p className="text-sm text-gray-600 mt-1.5">{cb.emergencyDescription}</p>
                    )}
                  </div>
                  {cb.status === 'pending_call' && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => markCalled(cb.id)}
                        className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold px-3 py-2 rounded-lg"
                      >
                        Mark Called
                      </button>
                      <button
                        onClick={() => cancel(cb.id)}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold px-3 py-2 rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showNew && <NewCallbackModal onClose={() => setShowNew(false)} />}
    </div>
  )
}

function NewCallbackModal({ onClose }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [description, setDescription] = useState('')
  const [ambulanceType, setAmbulanceType] = useState('C')
  const [urgency, setUrgency] = useState('stable')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim() || !phone.trim()) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'callback_requests'), {
        patientName: name.trim(),
        patientPhone: phone.trim(),
        emergencyDescription: description.trim(),
        ambulanceType,
        urgencyLevel: urgency,
        status: 'pending_call',
        adminNote: '',
        createdAt: serverTimestamp(),
      })
      onClose()
    } catch (e) {
      console.error(e)
      alert('Failed to add')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="font-bold text-navy">Log New Callback</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-navy">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Patient name" className="w-full border border-gray-200 rounded-xl px-4 py-2.5" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" type="tel" className="w-full border border-gray-200 rounded-xl px-4 py-2.5" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={3} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 resize-none" />
          <div>
            <div className="text-xs font-semibold text-gray-400 mb-1.5">Ambulance Type</div>
            <div className="grid grid-cols-3 gap-2">
              {['A', 'B', 'C'].map(t => (
                <button key={t} onClick={() => setAmbulanceType(t)} className={`py-2 rounded-lg font-bold text-sm border-2 ${ambulanceType === t ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 text-gray-500'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-400 mb-1.5">Urgency</div>
            <div className="grid grid-cols-3 gap-2">
              {[['critical', 'red'], ['serious', 'amber'], ['stable', 'green']].map(([u, c]) => (
                <button key={u} onClick={() => setUrgency(u)} className={`py-2 rounded-lg font-semibold text-xs capitalize border-2 ${urgency === u ? `border-${c}-500 bg-${c}-50 text-${c}-700` : 'border-gray-200 text-gray-500'}`}>
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 border-2 border-gray-200 py-2.5 rounded-xl font-semibold">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 bg-brand-red text-white py-2.5 rounded-xl font-bold disabled:opacity-60">
            {saving ? 'Saving...' : 'Add Callback'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create Account Tab ───────────────────────────────────────────────────

function CreateAccountTab({ drivers, hospitals, fleets }) {
  const [accountType, setAccountType] = useState('hospital')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [locationCoords, setLocationCoords] = useState(null) // { lat, lng }
  const [showMapPicker, setShowMapPicker] = useState(false)
  const [contactPerson, setContactPerson] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [vehicleType, setVehicleType] = useState('BLS')
  const [selectedFleetId, setSelectedFleetId] = useState('')
  const [icuBeds, setIcuBeds] = useState(0)
  const [advancedBeds, setAdvancedBeds] = useState(0)
  const [normalBeds, setNormalBeds] = useState(0)
  const [facilities, setFacilities] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null) // { success, message } or { error }

  function resetForm() {
    setEmail(''); setPassword(''); setDisplayName(''); setPhone('')
    setAddress(''); setContactPerson(''); setVehicleNumber('')
    setVehicleType('BLS'); setIcuBeds(0); setAdvancedBeds(0); setNormalBeds(0)
    setFacilities('')
    setLocationCoords(null); setSelectedFleetId('')
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!email || !password || !displayName) return
    setSaving(true)
    setResult(null)
    try {
      const idToken = await auth.currentUser?.getIdToken()
      const payload = {
        accountType, email, password, displayName, phone,
        ...(accountType === 'hospital' && {
          address,
          icuBeds: Number(icuBeds),
          advancedBeds: Number(advancedBeds),
          normalBeds: Number(normalBeds),
          facilities: facilities.split(',').map(f => f.trim()).filter(f => f.length > 0),
          ...(locationCoords && { latitude: locationCoords.lat, longitude: locationCoords.lng }),
        }),
        ...(accountType === 'fleet' && { contactPerson: contactPerson || displayName, address }),
        ...(accountType === 'driver' && {
          vehicleNumber,
          vehicleType,
          ...(selectedFleetId && {
            fleetId: selectedFleetId,
            fleetName: fleets.find(f => f.id === selectedFleetId)?.name || '',
          }),
        }),
      }
      const res = await callBackend('/admin/create-account', { body: payload, idToken })
      setResult({ success: true, message: res.message })
      resetForm()
    } catch (err) {
      setResult({ error: err.message || 'Failed to create account.' })
    } finally {
      setSaving(false)
    }
  }

  const ACCOUNT_TYPES = [
    { key: 'hospital', label: 'Hospital', icon: '🏥', color: 'red', desc: 'Emergency hospital that receives patients' },
    { key: 'fleet', label: 'Fleet / NGO', icon: '🚑', color: 'blue', desc: 'Ambulance fleet that manages drivers' },
    { key: 'driver', label: 'Driver', icon: '👨‍⚕️', color: 'green', desc: 'Individual ambulance driver' },
  ]

  return (
    <div className="max-w-2xl mx-auto">
      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-red-50 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-red-600">{hospitals.length}</div>
          <div className="text-xs text-red-500 font-medium">Hospitals</div>
        </div>
        <div className="bg-blue-50 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{fleets.length}</div>
          <div className="text-xs text-blue-500 font-medium">Fleets</div>
        </div>
        <div className="bg-green-50 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{drivers.length}</div>
          <div className="text-xs text-green-500 font-medium">Drivers</div>
        </div>
      </div>

      {/* Account type selector */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {ACCOUNT_TYPES.map(t => (
          <button
            key={t.key}
            onClick={() => { setAccountType(t.key); setResult(null) }}
            className={`rounded-2xl p-4 text-left border-2 transition-all ${
              accountType === t.key
                ? `border-${t.color}-500 bg-${t.color}-50 shadow-sm`
                : 'border-gray-100 hover:border-gray-200 bg-white'
            }`}
          >
            <div className="text-2xl mb-1">{t.icon}</div>
            <div className={`font-bold text-sm ${accountType === t.key ? `text-${t.color}-700` : 'text-navy'}`}>{t.label}</div>
            <div className="text-xs text-gray-400 mt-0.5">{t.desc}</div>
          </button>
        ))}
      </div>

      {/* Create form */}
      <form onSubmit={handleCreate} className="bg-white border border-gray-100 rounded-2xl p-6 space-y-4">
        <h3 className="font-bold text-navy text-lg flex items-center gap-2">
          {ACCOUNT_TYPES.find(t => t.key === accountType)?.icon}
          Create {ACCOUNT_TYPES.find(t => t.key === accountType)?.label} Account
        </h3>

        {result && (
          <div className={`rounded-xl px-4 py-3 text-sm ${
            result.success ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {result.success ? '✅ ' : '❌ '}{result.message || result.error}
          </div>
        )}

        {/* Common fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              {accountType === 'hospital' ? 'Hospital Name' : accountType === 'fleet' ? 'Fleet / NGO Name' : 'Driver Name'} *
            </label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} required
              placeholder={accountType === 'hospital' ? 'City General Hospital' : accountType === 'fleet' ? 'Red Cross Ambulance' : 'Rahul Kumar'}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Email *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="account@example.com"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Password *</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="Min 6 characters" minLength={6}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Phone</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="+91 9876543210"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red" />
          </div>
        </div>

        {/* Hospital-specific fields */}
        {accountType === 'hospital' && (
          <div className="space-y-3 pt-2 border-t border-gray-100">
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">Hospital Details</h4>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Address & Location</label>
              <div className="flex gap-2">
                <input value={address} onChange={e => setAddress(e.target.value)}
                  placeholder="Search or type address..."
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red" />
                <button type="button" onClick={() => setShowMapPicker(true)}
                  className="shrink-0 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold px-4 py-2.5 rounded-xl border border-blue-200 transition-colors flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                  Pick on Map
                </button>
              </div>
              {locationCoords && (
                <div className="mt-2 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs text-green-700 font-medium">Location set: {locationCoords.lat.toFixed(5)}, {locationCoords.lng.toFixed(5)}</span>
                  <button type="button" onClick={() => setLocationCoords(null)} className="ml-auto text-green-500 hover:text-red-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            {showMapPicker && (
              <LocationPickerModal
                initialAddress={address}
                initialCoords={locationCoords}
                onConfirm={(addr, coords) => { setAddress(addr); setLocationCoords(coords); setShowMapPicker(false) }}
                onClose={() => setShowMapPicker(false)}
              />
            )}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-red-600 mb-1">ICU Beds</label>
                <input type="number" min="0" value={icuBeds} onChange={e => setIcuBeds(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-navy focus:outline-none focus:border-brand-red" />
              </div>
              <div>
                <label className="block text-xs font-bold text-amber-600 mb-1">Advanced Beds</label>
                <input type="number" min="0" value={advancedBeds} onChange={e => setAdvancedBeds(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-navy focus:outline-none focus:border-brand-red" />
              </div>
              <div>
                <label className="block text-xs font-bold text-green-600 mb-1">Normal Beds</label>
                <input type="number" min="0" value={normalBeds} onChange={e => setNormalBeds(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-navy focus:outline-none focus:border-brand-red" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Top 5 Facilities (comma-separated)</label>
              <input value={facilities} onChange={e => setFacilities(e.target.value)}
                placeholder="e.g. Cardiac Care, Trauma Center, Pediatrics"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red" />
            </div>
          </div>
        )}

        {/* Fleet-specific fields */}
        {accountType === 'fleet' && (
          <div className="space-y-3 pt-2 border-t border-gray-100">
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">Fleet Details</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Contact Person</label>
                <input value={contactPerson} onChange={e => setContactPerson(e.target.value)}
                  placeholder="Fleet manager name"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Address</label>
                <input value={address} onChange={e => setAddress(e.target.value)}
                  placeholder="Office address"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red" />
              </div>
            </div>
          </div>
        )}

        {/* Driver-specific fields */}
        {accountType === 'driver' && (
          <div className="space-y-3 pt-2 border-t border-gray-100">
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">Driver Details</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Vehicle Number</label>
                <input value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)}
                  placeholder="MH 01 AB 1234"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Vehicle Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {['BLS', 'ALS', 'Patient Transport'].map(t => (
                    <button key={t} type="button" onClick={() => setVehicleType(t)}
                      className={`py-2 rounded-lg font-semibold text-xs border-2 transition-colors ${
                        vehicleType === t ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Admin-created drivers are auto-verified. No document upload needed.
            </p>

            {/* Fleet linking */}
            <div className="pt-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Link to Fleet (Optional)</label>
              <select
                value={selectedFleetId}
                onChange={e => setSelectedFleetId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red bg-white"
              >
                <option value="">— No fleet (Independent driver) —</option>
                {fleets.map(f => (
                  <option key={f.id} value={f.id}>{f.name} {f.phone ? `(${f.phone})` : ''}</option>
                ))}
              </select>
              {selectedFleetId && (
                <div className="mt-1.5 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                  <span className="text-xs text-blue-700 font-medium">🚑 Will be linked to: {fleets.find(f => f.id === selectedFleetId)?.name}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={saving || !email || !password || !displayName}
          className="w-full bg-navy hover:bg-navy-light text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating Account...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create {ACCOUNT_TYPES.find(t => t.key === accountType)?.label} Account
            </>
          )}
        </button>
      </form>
    </div>
  )
}

// ─── Location Picker Modal ───────────────────────────────────────────────

function LocationPickerModal({ initialAddress, initialCoords, onConfirm, onClose }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerRef = useRef(null)
  const [searchQuery, setSearchQuery] = useState(initialAddress || '')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedCoords, setSelectedCoords] = useState(initialCoords || { lat: 20.5937, lng: 78.9629 }) // Default: India center
  const [selectedAddress, setSelectedAddress] = useState(initialAddress || '')
  const [zoom, setZoom] = useState(initialCoords ? 16 : 5)

  // Load Leaflet CSS
  useEffect(() => {
    if (!document.getElementById('leaflet-css-admin')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css-admin'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
  }, [])

  // Initialize map
  useEffect(() => {
    let cancelled = false
    const initMap = async () => {
      const L = await import('leaflet')
      if (cancelled || !mapRef.current) return

      // Fix default marker icons
      delete L.Icon.Default.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(mapRef.current).setView([selectedCoords.lat, selectedCoords.lng], zoom)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(map)

      const marker = L.marker([selectedCoords.lat, selectedCoords.lng], { draggable: true }).addTo(map)

      marker.on('dragend', () => {
        const pos = marker.getLatLng()
        setSelectedCoords({ lat: pos.lat, lng: pos.lng })
        reverseGeocode(pos.lat, pos.lng)
      })

      map.on('click', (e) => {
        marker.setLatLng(e.latlng)
        setSelectedCoords({ lat: e.latlng.lat, lng: e.latlng.lng })
        reverseGeocode(e.latlng.lat, e.latlng.lng)
      })

      mapInstanceRef.current = map
      markerRef.current = marker

      // Auto-resize fix
      setTimeout(() => map.invalidateSize(), 100)
    }
    initMap()
    return () => { cancelled = true; mapInstanceRef.current?.remove() }
  }, [])

  const reverseGeocode = useCallback(async (lat, lng) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`)
      const data = await res.json()
      if (data.display_name) {
        setSelectedAddress(data.display_name)
        setSearchQuery(data.display_name)
      }
    } catch (_) {}
  }, [])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchResults([])
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&countrycodes=in`)
      const data = await res.json()
      setSearchResults(data)
    } catch (_) {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  const selectSearchResult = (result) => {
    const lat = parseFloat(result.lat)
    const lng = parseFloat(result.lon)
    setSelectedCoords({ lat, lng })
    setSelectedAddress(result.display_name)
    setSearchQuery(result.display_name)
    setSearchResults([])
    if (mapInstanceRef.current && markerRef.current) {
      mapInstanceRef.current.setView([lat, lng], 17)
      markerRef.current.setLatLng([lat, lng])
    }
  }

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setSelectedCoords({ lat, lng })
        if (mapInstanceRef.current && markerRef.current) {
          mapInstanceRef.current.setView([lat, lng], 16)
          markerRef.current.setLatLng([lat, lng])
        }
        reverseGeocode(lat, lng)
      },
      () => {}
    )
  }

  return (
    <div className="fixed inset-0 z-[999] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-navy text-lg">📍 Pick Hospital Location</h3>
            <p className="text-xs text-gray-400 mt-0.5">Search address, then drag the pin to exact spot</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search bar */}
        <div className="px-6 py-3 border-b border-gray-50">
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search hospital name or address..."
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-navy focus:outline-none focus:border-blue-500"
            />
            <button onClick={handleSearch} disabled={searching}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm disabled:opacity-60">
              {searching ? '...' : '🔍 Search'}
            </button>
            <button onClick={handleUseMyLocation} title="Use my location"
              className="bg-green-50 hover:bg-green-100 text-green-700 font-semibold px-3 py-2.5 rounded-xl border border-green-200">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
            </button>
          </div>

          {/* Search results dropdown */}
          {searchResults.length > 0 && (
            <div className="mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
              {searchResults.map((r, i) => (
                <button key={i} onClick={() => selectSearchResult(r)}
                  className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0 transition-colors">
                  <div className="text-sm text-navy font-medium truncate">{r.display_name}</div>
                  <div className="text-xs text-gray-400">{parseFloat(r.lat).toFixed(5)}, {parseFloat(r.lon).toFixed(5)}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Map */}
        <div ref={mapRef} className="flex-1 min-h-[350px]" style={{ cursor: 'crosshair' }} />

        {/* Footer with coordinates + confirm */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-xs text-gray-400 font-medium">Selected Location</div>
              <div className="text-sm text-navy font-mono font-bold">{selectedCoords.lat.toFixed(6)}, {selectedCoords.lng.toFixed(6)}</div>
              {selectedAddress && <div className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{selectedAddress}</div>}
            </div>
            <button onClick={onClose} className="border-2 border-gray-200 text-gray-600 font-semibold px-5 py-2.5 rounded-xl hover:bg-gray-100">
              Cancel
            </button>
            <button
              onClick={() => onConfirm(selectedAddress || searchQuery, selectedCoords)}
              className="bg-green-600 hover:bg-green-700 text-white font-bold px-5 py-2.5 rounded-xl flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Confirm Location
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
