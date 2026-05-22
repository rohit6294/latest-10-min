import { useState, useMemo } from 'react'
import { collection, doc, setDoc, serverTimestamp, getDocs, query, where, GeoPoint } from 'firebase/firestore'
import { db } from '../firebase'
import { callBackend } from '../backend'

// ─── Constants ─────────────────────────────────────────────────────────────

const STEPS = {
  step1_info: 'step1_info',
  step2_type: 'step2_type',
  step3_locating: 'step3_locating',
  step3_hospital: 'step3_hospital',
  step4_confirm: 'step4_confirm',
  saving: 'saving',
  done: 'done',
  error: 'error',
}

const URGENCIES = [
  { id: 'critical', label: 'Critical', color: 'red', desc: 'Unconscious, not breathing, cardiac arrest', defaultType: 'A' },
  { id: 'serious', label: 'Serious', color: 'amber', desc: 'Severe injury, heavy bleeding, breathing issues', defaultType: 'B' },
  { id: 'stable', label: 'Stable', color: 'green', desc: 'Minor injury, transport needed', defaultType: 'C' },
]

const TYPES = [
  { id: 'A', label: 'ICU', full: 'ICU Ambulance', desc: 'Ventilator, cardiac monitor, life support', color: 'red' },
  { id: 'B', label: 'Advanced', full: 'Advanced Ambulance', desc: 'Oxygen, defibrillator, advanced monitoring', color: 'amber' },
  { id: 'C', label: 'Normal', full: 'Normal Ambulance', desc: 'Basic transport and first aid', color: 'green' },
]

const COLOR_MAP = {
  red: { bg: 'bg-red-500', bgLight: 'bg-red-500/10', text: 'text-red-500', border: 'border-red-500' },
  amber: { bg: 'bg-amber-500', bgLight: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500' },
  green: { bg: 'bg-green-500', bgLight: 'bg-green-500/10', text: 'text-green-500', border: 'border-green-500' },
}

// ─── Haversine distance ────────────────────────────────────────────────────

function distanceKm(lat1, lng1, lat2, lng2) {
  const r = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function SosPage() {
  const [step, setStep] = useState(STEPS.step1_info)
  const [errorMsg, setErrorMsg] = useState('')

  const [description, setDescription] = useState('')
  const [patientName, setPatientName] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [urgency, setUrgency] = useState('')
  const [ambulanceType, setAmbulanceType] = useState('')
  const [coords, setCoords] = useState(null)
  const [hospitals, setHospitals] = useState([])
  const [selectedHospitalId, setSelectedHospitalId] = useState(null)
  const [hospitalsLoading, setHospitalsLoading] = useState(false)

  const goToStep2 = () => {
    if (description.trim().length < 5) {
      setErrorMsg('Please describe the emergency (at least 5 characters)')
      return
    }
    if (patientPhone.trim().length < 10) {
      setErrorMsg('Please enter a 10-digit mobile number so the driver can reach you')
      return
    }
    if (!urgency) {
      setErrorMsg('Please select urgency level')
      return
    }
    const auto = URGENCIES.find(u => u.id === urgency)?.defaultType || 'C'
    setAmbulanceType(auto)
    setErrorMsg('')
    setStep(STEPS.step2_type)
  }

  const goToStep3 = async () => {
    if (!ambulanceType) return
    setErrorMsg('')
    setStep(STEPS.step3_locating)

    if (!navigator.geolocation) {
      setErrorMsg('Your browser does not support location.')
      setStep(STEPS.error)
      return
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords
        const c = { latitude, longitude, accuracy: Math.round(accuracy) }
        setCoords(c)
        setStep(STEPS.step3_hospital)
        await loadHospitals(c, ambulanceType)
      },
      (err) => {
        if (err.code === 1) setErrorMsg('Location access denied. Please tap "Allow" and try again.')
        else if (err.code === 2) setErrorMsg('GPS signal weak. Move to an open area and retry.')
        else if (err.code === 3) setErrorMsg('Location request timed out. Check your connection.')
        else setErrorMsg('Could not get your location.')
        setStep(STEPS.error)
      },
      { timeout: 10000, maximumAge: 0, enableHighAccuracy: true }
    )
  }

  const loadHospitals = async (c, type) => {
    setHospitalsLoading(true)
    try {
      const q = query(collection(db, 'hospitals'), where('isActive', '==', true))
      const snap = await getDocs(q)
      const fieldName = type === 'A' ? 'icuAvailable' : type === 'B' ? 'advancedAvailable' : 'normalAvailable'
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(h => h.location && (h[fieldName] || 0) > 0)
        .map(h => {
          const lat = h.location.latitude ?? h.location._lat
          const lng = h.location.longitude ?? h.location._long
          const dist = distanceKm(c.latitude, c.longitude, lat, lng)
          return { ...h, _lat: lat, _lng: lng, _dist: dist, _available: h[fieldName] || 0 }
        })
        .filter(h => h._dist <= 50)
        .sort((a, b) => {
          const ratingDiff = (b.rating || 0) - (a.rating || 0)
          return ratingDiff !== 0 ? ratingDiff : a._dist - b._dist
        })
      setHospitals(list)
    } catch (e) {
      console.error('Hospital query error:', e)
      setHospitals([])
    } finally {
      setHospitalsLoading(false)
    }
  }

  const sendSOS = async () => {
    setStep(STEPS.saving)
    try {
      const mapsLink = `https://maps.google.com/?q=${coords.latitude},${coords.longitude}`
      const preferredHospital = hospitals.find(h => h.id === selectedHospitalId)
      // Write to rescue_requests — the single collection the driver app,
      // matching Cloud Functions and tracking page all work from.
      const ref = doc(collection(db, 'rescue_requests'))
      await setDoc(ref, {
        requestId: ref.id,
        patientName: patientName.trim(),
        patientPhone: patientPhone.trim(),
        patientLocation: new GeoPoint(coords.latitude, coords.longitude),
        accuracy: coords.accuracy,
        mapsLink,
        emergencyType: description.trim(),
        emergencyDescription: description.trim(),
        ambulanceType,
        urgencyLevel: urgency,
        preferredHospitalId: selectedHospitalId,
        preferredHospitalName: preferredHospital?.name || '',
        preferredHospitalAddress: preferredHospital?.address || '',
        hospitalChosenBy: selectedHospitalId ? 'patient' : '',
        source: 'web_sos',
        status: 'pending_driver',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        currentDriverSearchRadius: 1,
        notifiedDriverIds: [],
        assignedDriverId: null,
        currentHospitalSearchRadius: 1,
        notifiedHospitalIds: [],
        assignedHospitalId: null,
        device: navigator.userAgent.slice(0, 80),
      })
      // Save the request id so the user can resume tracking after closing the tab.
      try {
        localStorage.setItem('lastSosId', ref.id)
        localStorage.setItem('lastSosCreatedAt', String(Date.now()))
      } catch (_) {}
      // Kick off driver matching on Render backend (replaces the Firestore
      // trigger that's unavailable on the free Firebase Spark plan).
      // Fire-and-forget: the driver app also listens to Firestore directly,
      // so a slow/failed backend call doesn't block the patient flow.
      callBackend('/rescue/match-driver', { body: { requestId: ref.id } }).catch((e) =>
        console.warn('match-driver backend call failed (non-fatal):', e)
      )
      // Redirect to live tracking page.
      window.location.href = `/track/${ref.id}`
    } catch (e) {
      console.error('Firestore error:', e)
      setErrorMsg('Could not send. Please call us directly: +91 78660 67136')
      setStep(STEPS.error)
    }
  }

  return (
    <div className="min-h-screen bg-navy text-white">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-navy via-navy-light to-navy" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-red/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-md mx-auto min-h-screen flex flex-col px-4 py-6 sm:py-8">
        <Header step={step} />
        <div className="flex-1 flex flex-col">
          {step === STEPS.step1_info && (
            <Step1Info
              description={description}
              setDescription={setDescription}
              patientName={patientName}
              setPatientName={setPatientName}
              patientPhone={patientPhone}
              setPatientPhone={setPatientPhone}
              urgency={urgency}
              setUrgency={setUrgency}
              error={errorMsg}
              onNext={goToStep2}
            />
          )}
          {step === STEPS.step2_type && (
            <Step2Type
              ambulanceType={ambulanceType}
              setAmbulanceType={setAmbulanceType}
              onBack={() => setStep(STEPS.step1_info)}
              onNext={goToStep3}
            />
          )}
          {step === STEPS.step3_locating && <LocatingScreen />}
          {step === STEPS.step3_hospital && (
            <Step3Hospital
              hospitals={hospitals}
              loading={hospitalsLoading}
              selectedHospitalId={selectedHospitalId}
              setSelectedHospitalId={setSelectedHospitalId}
              ambulanceType={ambulanceType}
              onBack={() => setStep(STEPS.step2_type)}
              onNext={() => setStep(STEPS.step4_confirm)}
            />
          )}
          {step === STEPS.step4_confirm && (
            <Step4Confirm
              description={description}
              urgency={urgency}
              ambulanceType={ambulanceType}
              hospital={hospitals.find(h => h.id === selectedHospitalId)}
              coords={coords}
              onBack={() => setStep(STEPS.step3_hospital)}
              onSend={sendSOS}
            />
          )}
          {step === STEPS.saving && <SavingScreen />}
          {step === STEPS.done && <DoneScreen coords={coords} />}
          {step === STEPS.error && (
            <ErrorScreen errorMsg={errorMsg} onRetry={() => { setErrorMsg(''); setStep(STEPS.step1_info) }} />
          )}
        </div>
      </div>
    </div>
  )
}

function Header({ step }) {
  const stepNumber = useMemo(() => {
    if (step === STEPS.step1_info) return 1
    if (step === STEPS.step2_type) return 2
    if (step === STEPS.step3_locating || step === STEPS.step3_hospital) return 3
    if (step === STEPS.step4_confirm) return 4
    if (step === STEPS.saving || step === STEPS.done) return 5
    return null
  }, [step])

  return (
    <div className="mb-6 sm:mb-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 brand-icon">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <div>
          <div className="text-base font-bold leading-tight">10Min<span className="text-brand-red">Rescue</span></div>
          <div className="text-[11px] text-white/60 uppercase tracking-widest">Emergency SOS</div>
        </div>
      </div>
      {stepNumber !== null && stepNumber <= 5 && (
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              className={`flex-1 h-1 rounded-full ${
                n <= stepNumber ? 'bg-brand-red' : 'bg-white/15'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Step1Info({ description, setDescription, patientName, setPatientName, patientPhone, setPatientPhone, urgency, setUrgency, error, onNext }) {
  return (
    <div className="flex flex-col flex-1">
      <h1 className="text-2xl sm:text-3xl font-extrabold mb-2">What happened?</h1>
      <p className="text-white/60 text-sm mb-5">Tell us about the emergency briefly</p>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="e.g. Father collapsed, severe chest pain, struggling to breathe"
        rows={4}
        className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-brand-red focus:bg-white/10 transition-colors resize-none"
      />

      <h2 className="text-base font-bold mt-6 mb-3">Your contact details</h2>
      <input
        type="text"
        value={patientName}
        onChange={(e) => setPatientName(e.target.value)}
        placeholder="Patient / caller name (optional)"
        className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-brand-red focus:bg-white/10 transition-colors mb-2.5"
      />
      <input
        type="tel"
        inputMode="numeric"
        value={patientPhone}
        onChange={(e) => setPatientPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
        placeholder="Mobile number — so the driver can call you"
        className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-brand-red focus:bg-white/10 transition-colors"
      />

      <h2 className="text-base font-bold mt-6 mb-3">How urgent is it?</h2>
      <div className="space-y-2.5">
        {URGENCIES.map(u => {
          const c = COLOR_MAP[u.color]
          const selected = urgency === u.id
          return (
            <button
              key={u.id}
              onClick={() => setUrgency(u.id)}
              className={`w-full text-left rounded-2xl p-4 border-2 transition-all ${
                selected
                  ? `${c.bgLight} ${c.border}`
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${c.bg}`} />
                <div className="flex-1">
                  <div className={`font-bold text-base ${selected ? c.text : 'text-white'}`}>
                    {u.label}
                  </div>
                  <div className="text-xs text-white/50 mt-0.5">{u.desc}</div>
                </div>
                {selected && <CheckIcon className={c.text} />}
              </div>
            </button>
          )
        })}
      </div>

      {error && (
        <div className="mt-4 p-3 bg-brand-red/10 border border-brand-red/30 rounded-xl text-brand-red text-sm">
          {error}
        </div>
      )}

      <div className="mt-auto pt-6">
        <button
          onClick={onNext}
          className="w-full bg-brand-red hover:bg-brand-red-dark text-white font-bold py-4 rounded-2xl transition-colors text-base"
        >
          Continue →
        </button>
        <a
          href="tel:+917866067136"
          className="block text-center mt-3 text-white/50 hover:text-white text-sm py-2"
        >
          Or call us now: +91 78660 67136
        </a>
      </div>
    </div>
  )
}

function Step2Type({ ambulanceType, setAmbulanceType, onBack, onNext }) {
  return (
    <div className="flex flex-col flex-1">
      <h1 className="text-2xl sm:text-3xl font-extrabold mb-2">Ambulance Type</h1>
      <p className="text-white/60 text-sm mb-5">Pre-selected based on urgency. Change if needed.</p>

      <div className="space-y-3">
        {TYPES.map(t => {
          const c = COLOR_MAP[t.color]
          const selected = ambulanceType === t.id
          return (
            <button
              key={t.id}
              onClick={() => setAmbulanceType(t.id)}
              className={`w-full text-left rounded-2xl p-4 border-2 transition-all ${
                selected ? `${c.bgLight} ${c.border}` : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${c.bg} font-black text-white text-lg`}>
                  {t.id}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-bold text-base ${selected ? c.text : 'text-white'}`}>
                    {t.full}
                  </div>
                  <div className="text-xs text-white/60 mt-1">{t.desc}</div>
                </div>
                {selected && <CheckIcon className={`${c.text} mt-1`} />}
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-auto pt-6 grid grid-cols-3 gap-3">
        <button
          onClick={onBack}
          className="bg-white/10 hover:bg-white/15 text-white font-semibold py-4 rounded-2xl transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          className="col-span-2 bg-brand-red hover:bg-brand-red-dark text-white font-bold py-4 rounded-2xl transition-colors"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}

function LocatingScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <div className="w-24 h-24 bg-accent-blue/20 rounded-full flex items-center justify-center mb-6">
        <svg className="w-12 h-12 text-accent-blue animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
      <h1 className="text-2xl font-extrabold mb-2">Getting your location...</h1>
      <p className="text-white/60 text-sm">Please tap "Allow" when your browser asks for location</p>
    </div>
  )
}

function Step3Hospital({ hospitals, loading, selectedHospitalId, setSelectedHospitalId, ambulanceType, onBack, onNext }) {
  const typeName = TYPES.find(t => t.id === ambulanceType)?.label || 'Normal'

  return (
    <div className="flex flex-col flex-1">
      <h1 className="text-2xl sm:text-3xl font-extrabold mb-2">Choose Hospital</h1>
      <p className="text-white/60 text-sm mb-5">
        Hospitals with <span className="text-brand-red font-semibold">{typeName} beds</span> available
      </p>

      <div className="space-y-2.5 flex-1 overflow-y-auto -mx-1 px-1 max-h-[55vh]">
        <button
          onClick={() => setSelectedHospitalId(null)}
          className={`w-full text-left rounded-2xl p-4 border-2 transition-all ${
            selectedHospitalId === null
              ? 'bg-brand-red/10 border-brand-red'
              : 'bg-white/5 border-white/10 hover:bg-white/10'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-red/20 rounded-xl flex items-center justify-center">⚡</div>
            <div className="flex-1">
              <div className="font-bold">Let System Decide</div>
              <div className="text-xs text-white/50">Driver picks fastest hospital after pickup</div>
            </div>
            {selectedHospitalId === null && <CheckIcon className="text-brand-red" />}
          </div>
        </button>

        {loading && (
          <div className="text-center py-8 text-white/50 text-sm">Loading nearby hospitals...</div>
        )}

        {!loading && hospitals.length === 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-amber-300 text-sm">
            No hospitals nearby with available beds. Selecting "Let System Decide" — driver will assist.
          </div>
        )}

        {hospitals.map(h => {
          const selected = selectedHospitalId === h.id
          return (
            <button
              key={h.id}
              onClick={() => setSelectedHospitalId(h.id)}
              className={`w-full text-left rounded-2xl p-4 border-2 transition-all ${
                selected ? 'bg-brand-red/10 border-brand-red' : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-accent-blue/20 rounded-xl flex items-center justify-center text-lg shrink-0">🏥</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base mb-1 truncate">{h.name || 'Hospital'}</div>
                  {h.address && <div className="text-xs text-white/50 mb-2 truncate">{h.address}</div>}
                  <div className="flex flex-wrap gap-1.5">
                    {(h.rating || 0) > 0 && (
                      <span className="text-[11px] bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded-md font-semibold">
                        ⭐ {(h.rating || 0).toFixed(1)}
                      </span>
                    )}
                    <span className="text-[11px] bg-green-500/15 text-green-300 px-2 py-0.5 rounded-md font-semibold">
                      🛏 {h._available} beds
                    </span>
                    <span className="text-[11px] bg-blue-500/15 text-blue-300 px-2 py-0.5 rounded-md font-semibold">
                      📍 {h._dist.toFixed(1)} km
                    </span>
                  </div>
                </div>
                {selected && <CheckIcon className="text-brand-red shrink-0" />}
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-auto pt-6 grid grid-cols-3 gap-3">
        <button
          onClick={onBack}
          className="bg-white/10 hover:bg-white/15 text-white font-semibold py-4 rounded-2xl transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          className="col-span-2 bg-brand-red hover:bg-brand-red-dark text-white font-bold py-4 rounded-2xl transition-colors"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}

function Step4Confirm({ description, urgency, ambulanceType, hospital, coords, onBack, onSend }) {
  const u = URGENCIES.find(x => x.id === urgency)
  const t = TYPES.find(x => x.id === ambulanceType)
  const uColor = COLOR_MAP[u.color]

  return (
    <div className="flex flex-col flex-1">
      <h1 className="text-2xl sm:text-3xl font-extrabold mb-2">Review & Send</h1>
      <p className="text-white/60 text-sm mb-5">Make sure everything is correct</p>

      <div className="space-y-3">
        <ReviewRow label="Emergency" value={description} />
        <ReviewRow
          label="Urgency"
          value={
            <span className={`inline-flex items-center gap-2 ${uColor.text} font-bold`}>
              <span className={`w-2 h-2 rounded-full ${uColor.bg}`}></span>
              {u.label}
            </span>
          }
        />
        <ReviewRow label="Ambulance Type" value={`Type ${t.id} — ${t.full}`} />
        <ReviewRow label="Hospital" value={hospital ? hospital.name : 'System will assign'} />
        <ReviewRow label="Location" value={`${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`} small />
      </div>

      <div className="mt-auto pt-6 space-y-3">
        <button
          onClick={onSend}
          className="w-full bg-brand-red hover:bg-brand-red-dark text-white font-extrabold py-5 rounded-2xl transition-colors text-lg shadow-2xl shadow-brand-red/30 animate-pulse-glow"
        >
          🚨 SEND SOS NOW
        </button>
        <button
          onClick={onBack}
          className="w-full bg-white/10 hover:bg-white/15 text-white font-semibold py-3.5 rounded-2xl transition-colors text-sm"
        >
          ← Edit details
        </button>
      </div>
    </div>
  )
}

function ReviewRow({ label, value, small }) {
  return (
    <div className="bg-white/5 rounded-xl p-3 border border-white/5">
      <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">{label}</div>
      <div className={`text-white ${small ? 'text-xs font-mono' : 'text-sm font-medium'}`}>{value}</div>
    </div>
  )
}

function SavingScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <div className="w-24 h-24 bg-amber-500/20 rounded-full flex items-center justify-center mb-6">
        <svg className="w-12 h-12 text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
      <h1 className="text-2xl font-extrabold mb-2">Notifying drivers...</h1>
      <p className="text-white/60 text-sm">Saving your request to our system</p>
    </div>
  )
}

function DoneScreen({ coords }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mb-6">
        <svg className="w-14 h-14 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h1 className="text-3xl font-extrabold text-green-400 mb-2">Help is Coming!</h1>
      <p className="text-white/70 text-base mb-6 max-w-xs">
        Nearest available driver is being notified. Hospital has been alerted.
      </p>
      {coords && (
        <a
          href={`https://maps.google.com/?q=${coords.latitude},${coords.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white/60 hover:text-white hover:bg-white/10 transition-all w-full max-w-xs mb-4"
        >
          📍 View your location on Maps
          <span className="block text-[10px] mt-1 text-white/40 font-mono">
            {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
          </span>
        </a>
      )}
      <div className="bg-white/5 rounded-2xl p-4 text-sm text-white/60 space-y-1 max-w-xs w-full mb-4">
        <p className="font-medium text-white">Keep your phone with you.</p>
        <p>A team member will call you shortly.</p>
      </div>
      <a
        href="tel:+917866067136"
        className="block w-full max-w-xs bg-brand-red/20 hover:bg-brand-red/30 border border-brand-red/30 text-brand-red font-bold py-3.5 rounded-2xl transition-all text-sm"
      >
        📞 Call us: +91 78660 67136
      </a>
    </div>
  )
}

function ErrorScreen({ errorMsg, onRetry }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <div className="w-24 h-24 bg-brand-red/20 rounded-full flex items-center justify-center mb-6">
        <svg className="w-12 h-12 text-brand-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <h1 className="text-2xl font-extrabold mb-2">Something went wrong</h1>
      <p className="text-white/60 text-sm mb-6 max-w-xs">{errorMsg}</p>
      <button
        onClick={onRetry}
        className="w-full max-w-xs bg-white/10 hover:bg-white/15 text-white font-semibold py-3.5 rounded-2xl transition-all"
      >
        Try Again
      </button>
      <a
        href="tel:+917866067136"
        className="block w-full max-w-xs mt-3 bg-brand-red hover:bg-brand-red-dark text-white font-bold py-3.5 rounded-2xl transition-all"
      >
        📞 Call Now: +91 78660 67136
      </a>
    </div>
  )
}

function CheckIcon({ className = '' }) {
  return (
    <svg className={`w-5 h-5 ${className}`} fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  )
}
