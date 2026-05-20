import { useState, useEffect, useRef } from 'react'
import { onSnapshot, collection, query, doc, where, orderBy, getDoc, updateDoc } from 'firebase/firestore'
import { signOut, onAuthStateChanged } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase'
import RequestCard from '../components/hospital/RequestCard'
import StatsBar from '../components/hospital/StatsBar'
import RequestModal from '../components/hospital/RequestModal'
import IncomingAlertOverlay from '../components/hospital/IncomingAlertOverlay'

const STATUS_LABELS = {
  pending_driver: { label: 'Finding Driver', color: 'yellow' },
  driver_assigned: { label: 'Driver En Route', color: 'blue' },
  patient_picked_up: { label: 'Patient Picked Up', color: 'purple' },
  awaiting_hospital_choice: { label: 'Picking Hospital', color: 'amber' },
  hospital_assigned: { label: 'Ambulance Coming', color: 'green' },
  in_transit: { label: 'In Transit', color: 'indigo' },
  completed: { label: 'Completed', color: 'gray' },
  cancelled: { label: 'Cancelled', color: 'gray' },
}

/** Plays a short two-tone alert chime via the Web Audio API (no asset file). */
function playAlertChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime
    ;[0, 0.26].forEach((offset, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = i === 0 ? 880 : 1175
      gain.gain.setValueAtTime(0.0001, now + offset)
      gain.gain.exponentialRampToValueAtTime(0.32, now + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.24)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + offset)
      osc.stop(now + offset + 0.27)
    })
    setTimeout(() => ctx.close(), 900)
  } catch (_) { /* autoplay blocked — silent fallback */ }
}

// Hospital is auto-notified — no accept/decline. Tabs reflect real lifecycle:
const TABS = [
  { id: 'incoming', label: 'Incoming', statuses: ['hospital_assigned'] },
  { id: 'active', label: 'In Transit', statuses: ['in_transit'] },
  { id: 'history', label: 'History', statuses: ['completed', 'cancelled'] },
]

export default function HospitalDashboard() {
  const navigate = useNavigate()
  const [hospitalName, setHospitalName] = useState('Hospital')
  const [hospital, setHospital] = useState(null) // full hospital doc
  const [requests, setRequests] = useState([])
  const [activeTab, setActiveTab] = useState('incoming')
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [dbError, setDbError] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [uid, setUid] = useState(null)
  const [showTotalsModal, setShowTotalsModal] = useState(false)

  // Auth guard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate('/hospital')
        return
      }
      setUid(user.uid)
      setAuthChecked(true)
      try {
        const hospDoc = await getDoc(doc(db, 'hospitals', user.uid))
        if (hospDoc.exists()) {
          setHospitalName(hospDoc.data().name || 'Hospital')
        }
      } catch (_) {}
    })
    return unsub
  }, [navigate])

  // Real-time hospital doc (for live bed counts)
  useEffect(() => {
    if (!uid) return
    const unsub = onSnapshot(doc(db, 'hospitals', uid), (snap) => {
      if (snap.exists()) {
        setHospital({ id: snap.id, ...snap.data() })
      }
    })
    return unsub
  }, [uid])

  async function adjustBeds(field, delta, totalField) {
    if (!hospital) return
    const total = hospital[totalField] || 0
    const current = hospital[field] || 0
    const newVal = Math.min(Math.max(0, current + delta), total)
    if (newVal === current) return
    await updateDoc(doc(db, 'hospitals', uid), { [field]: newVal })
  }

  // Real-time requests stream — ONLY this hospital's assigned requests
  useEffect(() => {
    if (!authChecked || !uid) return
    const q = query(
      collection(db, 'rescue_requests'),
      where('assignedHospitalId', '==', uid),
      orderBy('createdAt', 'desc')
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        setDbError(false)
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setRequests(docs)
      },
      (err) => {
        console.error('Firestore error:', err)
        // Likely missing index. Fall back: query without orderBy.
        const fallbackQ = query(
          collection(db, 'rescue_requests'),
          where('assignedHospitalId', '==', uid)
        )
        onSnapshot(fallbackQ, (snap2) => {
          const docs = snap2.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => {
              const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0)
              const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0)
              return tb - ta
            })
          setRequests(docs)
          setDbError(false)
        }, (err2) => {
          console.error('Fallback also failed:', err2)
          setDbError(true)
        })
      }
    )
    return unsub
  }, [authChecked, uid])

  async function handleSignOut() {
    await signOut(auth)
    navigate('/hospital')
  }

  const filteredRequests = requests.filter(r =>
    TABS.find(t => t.id === activeTab)?.statuses.includes(r.status)
  )

  const incomingCount = requests.filter(r => r.status === 'hospital_assigned').length
  const activeCount = requests.filter(r => r.status === 'in_transit').length

  // Alert (chime) when a NEW ambulance is assigned to this hospital.
  const prevIncomingRef = useRef(null)
  useEffect(() => {
    if (prevIncomingRef.current === null) {
      prevIncomingRef.current = incomingCount // skip the chime on first load
      return
    }
    if (incomingCount > prevIncomingRef.current) {
      playAlertChime()
    }
    prevIncomingRef.current = incomingCount
  }, [incomingCount])

  // Surface the incoming count in the browser tab title.
  useEffect(() => {
    document.title = incomingCount > 0
      ? `(${incomingCount}) Ambulance incoming — Suraksha Kavach`
      : 'Suraksha Kavach Hospital'
    return () => { document.title = 'Suraksha Kavach' }
  }, [incomingCount])

  // Request browser notification permission once on first user interaction.
  useEffect(() => {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'default') {
      const ask = () => {
        Notification.requestPermission().catch(() => {})
        window.removeEventListener('click', ask)
      }
      window.addEventListener('click', ask, { once: true })
      return () => window.removeEventListener('click', ask)
    }
  }, [])

  // First unacknowledged incoming request gets the full-screen overlay.
  const pendingAlert = requests.find(
    r => r.status === 'hospital_assigned' && !r.hospitalAckAt
  )

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-light-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-navy/60">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-light-bg">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 brand-icon">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-navy text-sm">Suraksha <span className="text-brand-red">Kavach</span></span>
              <p className="text-xs text-gray-400">{hospitalName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {incomingCount > 0 && (
              <span className="bg-brand-red text-white text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">
                {incomingCount} New
              </span>
            )}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-red transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* DB Error Banner */}
        {dbError && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="font-semibold text-red-700 text-sm">Database connection error</p>
              <p className="text-red-600 text-xs mt-0.5">
                Firestore database may not be set up. Go to Firebase Console → Firestore Database → Create database (Test mode).
              </p>
            </div>
          </div>
        )}

        {/* Stats */}
        <StatsBar requests={requests} />

        {/* Bed Availability Panel */}
        {hospital && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 mt-6">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <div>
                <h2 className="font-bold text-navy text-base sm:text-lg flex items-center gap-2">
                  🛏 Bed Availability
                </h2>
                <p className="text-xs text-gray-400">Update in real-time. Patients see this on /sos.</p>
              </div>
              <div className="flex items-center gap-2">
                {(hospital.rating || 0) > 0 && (
                  <span className="text-amber-600 font-bold text-sm">⭐ {(hospital.rating || 0).toFixed(1)}</span>
                )}
                <button
                  onClick={() => setShowTotalsModal(true)}
                  className="text-xs font-bold bg-navy text-white hover:bg-navy-light px-3 py-1.5 rounded-lg transition-colors"
                >
                  Set Total Beds
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <BedPanelRow label="ICU" color="red" available={hospital.icuAvailable || 0} total={hospital.icuBeds || 0} onMinus={() => adjustBeds('icuAvailable', -1, 'icuBeds')} onPlus={() => adjustBeds('icuAvailable', +1, 'icuBeds')} />
              <BedPanelRow label="Advanced" color="amber" available={hospital.advancedAvailable || 0} total={hospital.advancedBeds || 0} onMinus={() => adjustBeds('advancedAvailable', -1, 'advancedBeds')} onPlus={() => adjustBeds('advancedAvailable', +1, 'advancedBeds')} />
              <BedPanelRow label="Normal" color="green" available={hospital.normalAvailable || 0} total={hospital.normalBeds || 0} onMinus={() => adjustBeds('normalAvailable', -1, 'normalBeds')} onPlus={() => adjustBeds('normalAvailable', +1, 'normalBeds')} />
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-2xl p-1.5 shadow-sm border border-gray-100 mb-6 mt-6">
          {TABS.map(tab => {
            const count = tab.id === 'incoming' ? incomingCount
              : tab.id === 'active' ? activeCount : null
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                  activeTab === tab.id
                    ? 'bg-navy text-white shadow-md'
                    : 'text-gray-500 hover:text-navy hover:bg-gray-50'
                }`}
              >
                {tab.label}
                {count !== null && count > 0 && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    activeTab === tab.id
                      ? 'bg-white/20 text-white'
                      : tab.id === 'incoming'
                        ? 'bg-red-100 text-emergency'
                        : 'bg-blue-100 text-blue-600'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Request List */}
        {filteredRequests.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              {activeTab === 'incoming' ? (
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              )}
            </div>
            <p className="text-navy font-semibold">
              {activeTab === 'incoming' ? 'No incoming requests' : activeTab === 'active' ? 'No active cases' : 'No history yet'}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              {activeTab === 'incoming' ? 'New emergency requests will appear here in real-time' : 'Requests will show here once processed'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRequests.map(req => (
              <RequestCard
                key={req.id}
                request={req}
                statusLabels={STATUS_LABELS}
                onView={() => setSelectedRequest(req)}
                onAccept={null}
                accepting={false}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedRequest && (
        <RequestModal
          request={selectedRequest}
          statusLabels={STATUS_LABELS}
          onClose={() => setSelectedRequest(null)}
          onAccept={null}
          accepting={false}
        />
      )}

      {/* Set Total Beds Modal */}
      {showTotalsModal && hospital && (
        <SetTotalsModal
          hospital={hospital}
          uid={uid}
          onClose={() => setShowTotalsModal(false)}
        />
      )}

      {/* Full-screen incoming-ambulance alert (overrides everything else). */}
      {pendingAlert && (
        <IncomingAlertOverlay
          key={pendingAlert.id}
          request={pendingAlert}
          onAcknowledged={() => setSelectedRequest(pendingAlert)}
        />
      )}
    </div>
  )
}

function SetTotalsModal({ hospital, uid, onClose }) {
  const [icuBeds, setIcuBeds] = useState(hospital.icuBeds || 0)
  const [advancedBeds, setAdvancedBeds] = useState(hospital.advancedBeds || 0)
  const [normalBeds, setNormalBeds] = useState(hospital.normalBeds || 0)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const newIcu = Math.max(0, Number(icuBeds) || 0)
      const newAdv = Math.max(0, Number(advancedBeds) || 0)
      const newNorm = Math.max(0, Number(normalBeds) || 0)
      await updateDoc(doc(db, 'hospitals', uid), {
        icuBeds: newIcu,
        advancedBeds: newAdv,
        normalBeds: newNorm,
        // Clamp available counts to new totals
        icuAvailable: Math.min(hospital.icuAvailable || 0, newIcu),
        advancedAvailable: Math.min(hospital.advancedAvailable || 0, newAdv),
        normalAvailable: Math.min(hospital.normalAvailable || 0, newNorm),
      })
      onClose()
    } catch (e) {
      console.error(e)
      alert('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h2 className="font-bold text-navy">Set Total Beds</h2>
            <p className="text-xs text-gray-400">Set the total bed capacity for each type</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-navy">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <BedTotalInput label="ICU (Type A)" color="red" value={icuBeds} onChange={setIcuBeds} />
          <BedTotalInput label="Advanced (Type B)" color="amber" value={advancedBeds} onChange={setAdvancedBeds} />
          <BedTotalInput label="Normal (Type C)" color="green" value={normalBeds} onChange={setNormalBeds} />
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-700 text-xs">
            ⚠️ Available beds will be clamped to the new total if you reduce capacity.
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 border-2 border-gray-200 py-2.5 rounded-xl font-semibold">
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="flex-1 bg-navy text-white py-2.5 rounded-xl font-bold disabled:opacity-60">
            {saving ? 'Saving...' : 'Save Totals'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BedTotalInput({ label, color, value, onChange }) {
  const cls = color === 'red' ? 'text-red-600' : color === 'amber' ? 'text-amber-600' : 'text-green-600'
  return (
    <div>
      <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${cls}`}>{label}</label>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-navy focus:outline-none focus:border-brand-red text-lg font-bold"
        placeholder="e.g. 10"
      />
    </div>
  )
}

function BedPanelRow({ label, color, available, total, onMinus, onPlus }) {
  const colorClass = {
    red: 'bg-red-500 text-red-600 bg-red-50',
    amber: 'bg-amber-500 text-amber-600 bg-amber-50',
    green: 'bg-green-500 text-green-600 bg-green-50',
  }[color]
  const [bgBtn, textColor, bgRow] = colorClass.split(' ')

  return (
    <div className={`${bgRow} rounded-xl p-3 sm:p-4 border border-gray-100`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`text-xs font-bold uppercase tracking-widest ${textColor}`}>{label}</div>
        <div className="text-[10px] text-gray-400">Type {color === 'red' ? 'A' : color === 'amber' ? 'B' : 'C'}</div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onMinus}
          disabled={available === 0}
          className={`w-9 h-9 rounded-lg ${bgBtn} text-white font-bold disabled:opacity-30 disabled:cursor-not-allowed shrink-0`}
        >
          −
        </button>
        <div className="text-center">
          <div className={`text-2xl font-extrabold ${textColor}`}>{available}</div>
          <div className="text-[10px] text-gray-400">of {total}</div>
        </div>
        <button
          onClick={onPlus}
          disabled={available === total}
          className={`w-9 h-9 rounded-lg ${bgBtn} text-white font-bold disabled:opacity-30 disabled:cursor-not-allowed shrink-0`}
        >
          +
        </button>
      </div>
    </div>
  )
}
