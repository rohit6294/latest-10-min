import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
} from 'firebase/firestore'
import { db } from '../firebase'
import { callBackend } from '../backend'

// ─── Status display map ────────────────────────────────────────────────────

const STATUS = {
  pending_driver: {
    title: 'Finding nearest driver…',
    subtitle: "Sit tight — we're alerting drivers in your area",
    color: 'amber', icon: '🔍', pulse: true,
  },
  driver_assigned: {
    title: 'Driver is on the way',
    subtitle: 'Help is coming. Stay where you are.',
    color: 'green', icon: '🚑', pulse: false,
  },
  patient_picked_up: {
    title: "You're with the ambulance",
    subtitle: 'The crew is preparing the next step.',
    color: 'green', icon: '🚑', pulse: false,
  },
  awaiting_hospital_choice: {
    title: 'Choosing a hospital',
    subtitle: 'The crew is selecting the nearest suitable hospital.',
    color: 'green', icon: '🏥', pulse: false,
  },
  hospital_assigned: {
    title: 'Heading to the hospital',
    subtitle: 'On the way to the hospital now.',
    color: 'green', icon: '🏥', pulse: false,
  },
  in_transit: {
    title: 'On the way to the hospital',
    subtitle: 'The ambulance is transporting the patient.',
    color: 'green', icon: '🏥', pulse: false,
  },
  completed: {
    title: 'Trip complete',
    subtitle: 'The patient has reached the hospital. Stay safe!',
    color: 'green', icon: '✅', pulse: false,
  },
  cancelled: {
    title: 'Request cancelled',
    subtitle: 'This request was cancelled. Please send a new SOS if you still need help.',
    color: 'red', icon: '⚠️', pulse: false,
  },
}

const COLOR_CLASSES = {
  amber: { bg: 'bg-amber-500', text: 'text-amber-500', light: 'bg-amber-500/10', ring: 'border-amber-500/30' },
  green: { bg: 'bg-green-500', text: 'text-green-500', light: 'bg-green-500/10', ring: 'border-green-500/30' },
  red:   { bg: 'bg-red-500', text: 'text-red-500', light: 'bg-red-500/10', ring: 'border-red-500/30' },
}

const PICKED_UP_STATUSES = [
  'patient_picked_up', 'awaiting_hospital_choice', 'hospital_assigned',
  'in_transit', 'completed',
]

// ─── Helpers ───────────────────────────────────────────────────────────────

function distanceKm(lat1, lng1, lat2, lng2) {
  const r = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Read a Firestore GeoPoint (or a plain {latitude,longitude} object). */
function geo(point) {
  if (!point) return null
  const lat = point.latitude ?? point._lat
  const lng = point.longitude ?? point._long
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  return { lat, lng }
}

// ─── Main component ────────────────────────────────────────────────────────

// How long to wait before suggesting the public 108 helpline when no driver
// has accepted yet. Picked to be just long enough that one radius-expansion
// pass has run, but short enough that a panicked caller is not stranded.
const FALLBACK_108_AFTER_MS = 60 * 1000

export default function TrackPage() {
  const { requestId } = useParams()
  const [searchParams] = useSearchParams()
  const wantsRatePrompt = searchParams.get('rate') === '1'
  const [req, setReq] = useState(null)
  const [driverLocation, setDriverLocation] = useState(null) // {lat, lng}
  const [route, setRoute] = useState([]) // array of [lat, lng]
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [nowMs, setNowMs] = useState(Date.now())
  const [instructions, setInstructions] = useState([])
  const [ratingSubmitted, setRatingSubmitted] = useState(false)
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef({})
  const polylineRef = useRef(null)
  const ratingPanelRef = useRef(null)
  const ratingScrolledRef = useRef(false)
  // Anchor for the 108 fallback timer. Captured the first time we see a
  // createdAt on the doc so we can compute elapsed time from a reference
  // point that doesn't drift with the device clock.
  const timerAnchorRef = useRef(null)

  // Tick once a second so the "search elapsed" timer and 108 fallback banner
  // re-render without an explicit state update from Firestore.
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // ─── Subscribe to the rescue request ─────────────────────────────────
  useEffect(() => {
    if (!requestId) return
    const unsub = onSnapshot(
      doc(db, 'rescue_requests', requestId),
      (snap) => {
        if (!snap.exists()) {
          setNotFound(true)
          setLoading(false)
          return
        }
        setReq({ id: snap.id, ...snap.data() })
        setLoading(false)
      },
      (err) => {
        console.error(err)
        setNotFound(true)
        setLoading(false)
      }
    )
    return unsub
  }, [requestId])

  // ─── Auto-scroll to rating panel when arriving from WhatsApp ?rate=1 ──
  useEffect(() => {
    if (!wantsRatePrompt) return
    if (ratingScrolledRef.current) return
    if (req?.status !== 'completed') return
    if (req?.patientRating || ratingSubmitted) return
    const el = ratingPanelRef.current
    if (!el) return
    ratingScrolledRef.current = true
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [wantsRatePrompt, req?.status, req?.patientRating, ratingSubmitted])

  // ─── Subscribe to patient instructions subcollection ──────────────────
  useEffect(() => {
    if (!requestId) return
    const q = query(
      collection(db, 'rescue_requests', requestId, 'instructions'),
      orderBy('createdAt', 'asc')
    )
    const unsub = onSnapshot(q, (snap) => {
      setInstructions(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      )
    })
    return unsub
  }, [requestId])

  // ─── Subscribe to the driver's live location ─────────────────────────
  useEffect(() => {
    const driverId = req?.assignedDriverId
    if (!driverId) return
    const unsub = onSnapshot(
      doc(db, 'location_updates', driverId),
      (snap) => {
        if (snap.exists()) {
          const loc = geo(snap.data().location)
          if (loc) setDriverLocation(loc)
        }
      }
    )
    return unsub
  }, [req?.assignedDriverId])

  const patientLoc = geo(req?.patientLocation)
  const hospitalLoc = geo(req?.hospitalLocation)
  const pickedUp = PICKED_UP_STATUSES.includes(req?.status)
  // Before pickup the ambulance heads to the patient; after pickup, to the hospital.
  const target = (pickedUp && hospitalLoc) ? hospitalLoc : patientLoc

  // ─── Init Leaflet map ────────────────────────────────────────────────
  useEffect(() => {
    if (!patientLoc || !mapRef.current || mapInstanceRef.current) return

    import('leaflet').then((L) => {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link')
        link.id = 'leaflet-css'
        link.rel = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        document.head.appendChild(link)
      }

      const map = L.default.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([patientLoc.lat, patientLoc.lng], 14)
      mapInstanceRef.current = map

      L.default.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map)

      const patientIcon = L.default.divIcon({
        className: '',
        html: `<div class="patient-marker">
                 <div class="patient-marker-pulse"></div>
                 <div class="patient-marker-dot">📍</div>
               </div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      })
      markersRef.current.patient = L.default
        .marker([patientLoc.lat, patientLoc.lng], { icon: patientIcon })
        .addTo(map)
        .bindPopup('Patient location')
    })
  }, [patientLoc])

  // ─── Hospital marker ─────────────────────────────────────────────────
  useEffect(() => {
    if (!hospitalLoc || !mapInstanceRef.current) return
    import('leaflet').then((L) => {
      const map = mapInstanceRef.current
      const latLng = [hospitalLoc.lat, hospitalLoc.lng]
      if (markersRef.current.hospital) {
        markersRef.current.hospital.setLatLng(latLng)
      } else {
        const hospitalIcon = L.default.divIcon({
          className: '',
          html: `<div class="hospital-marker">🏥</div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        })
        markersRef.current.hospital = L.default
          .marker(latLng, { icon: hospitalIcon })
          .addTo(map)
          .bindPopup(req?.hospitalName || 'Hospital')
      }
    })
  }, [hospitalLoc, req?.hospitalName])

  // ─── Driver marker + fit bounds ──────────────────────────────────────
  useEffect(() => {
    if (!driverLocation || !mapInstanceRef.current) return
    import('leaflet').then((L) => {
      const map = mapInstanceRef.current
      const driverLatLng = [driverLocation.lat, driverLocation.lng]
      if (markersRef.current.driver) {
        markersRef.current.driver.setLatLng(driverLatLng)
      } else {
        const driverIcon = L.default.divIcon({
          className: '',
          html: `<div class="driver-marker">🚑</div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        })
        markersRef.current.driver = L.default
          .marker(driverLatLng, { icon: driverIcon })
          .addTo(map)
          .bindPopup(req?.driverName || 'Ambulance')
      }
      if (target) {
        const bounds = L.default.latLngBounds([
          [target.lat, target.lng],
          driverLatLng,
        ])
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 })
      }
    })
  }, [driverLocation, target, req?.driverName])

  // ─── Road route from OSRM (ambulance → current target) ───────────────
  useEffect(() => {
    if (!driverLocation || !target) return
    const url = `https://router.project-osrm.org/route/v1/driving/${driverLocation.lng},${driverLocation.lat};${target.lng},${target.lat}?overview=full&geometries=geojson`
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const coords = data?.routes?.[0]?.geometry?.coordinates
        if (coords) setRoute(coords.map(([lng, lat]) => [lat, lng]))
      })
      .catch(() => {})
  }, [driverLocation, target])

  // ─── Draw polyline ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || route.length === 0) return
    import('leaflet').then((L) => {
      const map = mapInstanceRef.current
      if (polylineRef.current) map.removeLayer(polylineRef.current)
      polylineRef.current = L.default
        .polyline(route, { color: '#2563EB', weight: 5, opacity: 0.85 })
        .addTo(map)
    })
  }, [route])

  // ─── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-navy text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">Loading your status…</p>
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-navy text-white flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-brand-red/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-brand-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold mb-2">Request not found</h1>
          <p className="text-white/60 text-sm mb-6">This request doesn't exist or has been removed.</p>
          <a href="/sos" className="block bg-brand-red hover:bg-brand-red-dark text-white font-bold py-3 rounded-2xl">
            Send New SOS
          </a>
        </div>
      </div>
    )
  }

  const statusInfo = STATUS[req.status] || STATUS.pending_driver
  const colorCls = COLOR_CLASSES[statusInfo.color]

  const dist = (driverLocation && target)
    ? distanceKm(driverLocation.lat, driverLocation.lng, target.lat, target.lng)
    : null
  const etaMin = dist != null ? Math.max(1, Math.round((dist / 40) * 60)) : null
  const hasDriver = !!req.assignedDriverId
  const hospitalName = req.hospitalName || req.preferredHospitalName
  const hospitalAddress = req.hospitalAddress || req.preferredHospitalAddress

  // Time since the request was created — used to drive the 108 fallback banner
  // when matching is taking too long. Robust against device-clock skew:
  // captures a one-time anchor of (clientNow, serverCreatedAt) and counts
  // elapsed time using the local clock's delta from that anchor, not the
  // wall-clock difference. If the device clock looks broken at anchor time
  // we assume the request was just created.
  const createdAtMs =
    req.createdAt?.toDate?.()?.getTime?.() ??
    (typeof req.createdAt?.seconds === 'number'
      ? req.createdAt.seconds * 1000
      : null)
  if (createdAtMs && !timerAnchorRef.current) {
    const apparentAge = Date.now() - createdAtMs
    const trustClock =
      apparentAge >= -2 * 60 * 1000 && apparentAge < 24 * 60 * 60 * 1000
    timerAnchorRef.current = {
      clientAnchorMs: Date.now(),
      initialAgeMs: trustClock ? Math.max(0, apparentAge) : 0,
    }
  }
  const elapsedMs = timerAnchorRef.current
    ? nowMs -
      timerAnchorRef.current.clientAnchorMs +
      timerAnchorRef.current.initialAgeMs
    : 0
  const showFallback108 =
    req.status === 'pending_driver' && elapsedMs >= FALLBACK_108_AFTER_MS
  const searchSeconds = Math.max(0, Math.round(elapsedMs / 1000))

  return (
    <div className="min-h-screen bg-light-bg text-navy pb-24">
      {/* Header */}
      <div className="bg-navy text-white">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 brand-icon">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-base font-bold">10Min<span className="text-brand-red">Rescue</span></h1>
            <p className="text-[10px] text-white/60 uppercase tracking-widest">Live tracking</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">

        {/* Status banner */}
        <div className={`relative rounded-3xl p-5 sm:p-6 ${colorCls.light} border-2 ${colorCls.ring} overflow-hidden`}>
          {statusInfo.pulse && (
            <div className={`absolute -top-12 -right-12 w-32 h-32 ${colorCls.bg} opacity-10 rounded-full animate-pulse`} />
          )}
          <div className="flex items-start gap-4 relative">
            <div className={`w-14 h-14 ${colorCls.bg} rounded-2xl flex items-center justify-center text-3xl shadow-lg`}>
              {statusInfo.icon}
            </div>
            <div className="flex-1">
              <h2 className={`text-xl sm:text-2xl font-extrabold ${colorCls.text} mb-1`}>
                {statusInfo.title}
              </h2>
              <p className="text-navy/70 text-sm">{statusInfo.subtitle}</p>
            </div>
          </div>
          {hasDriver && req.status !== 'completed' && req.status !== 'cancelled' && etaMin !== null && (
            <div className="grid grid-cols-2 gap-3 mt-5">
              <div className="bg-white rounded-xl p-3 text-center">
                <div className="text-xs text-gray-400 uppercase font-bold tracking-wide">Distance</div>
                <div className={`text-2xl font-extrabold ${colorCls.text}`}>{dist?.toFixed(1)} km</div>
              </div>
              <div className="bg-white rounded-xl p-3 text-center">
                <div className="text-xs text-gray-400 uppercase font-bold tracking-wide">ETA</div>
                <div className={`text-2xl font-extrabold ${colorCls.text}`}>~{etaMin} min</div>
              </div>
            </div>
          )}
        </div>

        {/* 108 fallback — show when no driver has accepted within FALLBACK_108_AFTER_MS */}
        {showFallback108 && (
          <div className="rounded-3xl border-2 border-red-500/40 bg-red-50 p-4 sm:p-5 shadow-lg shadow-red-500/10">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center text-xl shrink-0">
                🚨
              </div>
              <div className="flex-1">
                <div className="font-extrabold text-red-700 text-sm sm:text-base">
                  Still searching after {searchSeconds}s
                </div>
                <div className="text-red-600/80 text-xs sm:text-sm">
                  Don't wait — dial India's emergency line 108 right now.
                </div>
              </div>
            </div>
            <a
              href="tel:108"
              className="block w-full bg-red-600 hover:bg-red-700 text-white font-extrabold text-center py-4 rounded-2xl shadow-lg shadow-red-600/30 text-lg"
            >
              📞 CALL 108 NOW
            </a>
            <p className="text-[11px] text-red-700/70 text-center mt-2">
              We'll keep trying to dispatch a 10MinRescue ambulance in parallel.
            </p>
          </div>
        )}

        {/* Map */}
        <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100">
          <div ref={mapRef} className="w-full h-[300px] sm:h-[380px]" />
        </div>

        {/* Driver Card */}
        {hasDriver ? (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-bold text-green-600 uppercase tracking-widest">
                Ambulance assigned
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-accent-blue/10 rounded-2xl flex items-center justify-center text-2xl">
                🚑
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-navy text-base truncate">{req.driverName || 'Driver'}</div>
                <div className="text-sm text-gray-500 truncate">
                  {req.driverVehicleNumber || 'Vehicle'}
                  {req.driverAmbulanceType && ` · Type ${req.driverAmbulanceType}`}
                </div>
              </div>
              {req.driverPhone && (
                <a
                  href={`tel:${req.driverPhone}`}
                  className="w-12 h-12 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-green-500/30 transition-colors"
                  aria-label="Call driver"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.272.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        ) : req.status === 'pending_driver' ? (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <div>
                <div className="font-bold text-navy text-sm">Finding driver…</div>
                <div className="text-xs text-gray-500">Drivers nearby are being notified</div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Hospital Card */}
        {hospitalName && (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-widest">
                {req.assignedHospitalId ? 'Destination hospital' : 'Preferred hospital'}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center text-2xl">
                🏥
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-navy text-base truncate">{hospitalName}</div>
                {hospitalAddress && (
                  <div className="text-sm text-gray-500 truncate">{hospitalAddress}</div>
                )}
              </div>
              {req.hospitalPhone && (
                <a
                  href={`tel:${req.hospitalPhone}`}
                  className="w-12 h-12 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg transition-colors"
                  aria-label="Call hospital"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.272.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Patient instructions for the driver — text + voice */}
        {hasDriver && req.status !== 'completed' && req.status !== 'cancelled' && (
          <InstructionsPanel
            requestId={requestId}
            instructions={instructions}
          />
        )}

        {/* Rating modal trigger on completion */}
        {req.status === 'completed' && hasDriver && !req.patientRating && !ratingSubmitted && (
          <div ref={ratingPanelRef}>
            <RatingPanel
              requestId={requestId}
              driverName={req.driverName}
              onSubmitted={() => setRatingSubmitted(true)}
            />
          </div>
        )}

        {/* Show submitted rating confirmation */}
        {req.status === 'completed' && (req.patientRating || ratingSubmitted) && (
          <div className="bg-green-50 border border-green-200 rounded-3xl p-5 text-center">
            <div className="text-2xl mb-1">🙏</div>
            <div className="font-bold text-green-700 text-sm">Thanks for your feedback</div>
            <div className="text-green-600/80 text-xs mt-1">Your rating helps us improve.</div>
          </div>
        )}

        {/* Emergency description */}
        {req.emergencyDescription && (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Your emergency</div>
            <p className="text-navy text-sm leading-relaxed">{req.emergencyDescription}</p>
          </div>
        )}

        {/* Direct driver call — shown right above helpline so patient can reach driver fast */}
        {hasDriver && req.driverPhone && (
          <a
            href={`tel:${req.driverPhone}`}
            className="block w-full bg-green-600 hover:bg-green-700 text-white font-bold text-center py-4 rounded-2xl shadow-lg shadow-green-600/30 transition-colors"
          >
            📞 Call Driver{req.driverName ? ` (${req.driverName})` : ''}: {req.driverPhone}
          </a>
        )}

        {/* Always-visible emergency call */}
        <a
          href="tel:+917866067136"
          className="block w-full bg-brand-red hover:bg-brand-red-dark text-white font-bold text-center py-4 rounded-2xl shadow-lg shadow-brand-red/30 transition-colors"
        >
          📞 Emergency Line: +91 78660 67136
        </a>
      </div>

      <style>{`
        .patient-marker { position: relative; width: 40px; height: 40px; }
        .patient-marker-pulse {
          position: absolute; inset: 0; border-radius: 50%;
          background: rgba(230, 0, 18, 0.4);
          animation: patient-pulse 1.5s ease-out infinite;
        }
        .patient-marker-dot {
          position: absolute; inset: 0; width: 40px; height: 40px;
          background: #E60012; border: 3px solid white; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 20px; box-shadow: 0 4px 14px rgba(230, 0, 18, 0.5);
        }
        @keyframes patient-pulse {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }
        .driver-marker {
          width: 40px; height: 40px; background: #2563EB;
          border: 3px solid white; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 22px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.5);
        }
        .hospital-marker {
          width: 40px; height: 40px; background: #16A34A;
          border: 3px solid white; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 20px; box-shadow: 0 4px 14px rgba(22, 163, 74, 0.5);
        }
        .leaflet-control-attribution { display: none !important; }
      `}</style>
    </div>
  )
}

// ─── InstructionsPanel ────────────────────────────────────────────────────
// Lets a panicked patient/family member send extra context to the driver
// while help is on the way. Two channels: a short text note, or a voice
// recording (browser MediaRecorder, uploaded via the backend so the patient
// stays anonymous to Firebase Storage rules).

function InstructionsPanel({ requestId, instructions }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [micBlocked, setMicBlocked] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const recordTimerRef = useRef(null)

  // Detect Chrome vs Firefox/Safari to tailor the "how to re-enable mic"
  // guidance shown when the browser permission is denied.
  const browserName = (() => {
    const ua =
      typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
    if (/Edg\//.test(ua)) return 'edge'
    if (/Chrome\//.test(ua)) return 'chrome'
    if (/Firefox\//.test(ua)) return 'firefox'
    if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'safari'
    return 'other'
  })()

  const sendText = async () => {
    const t = text.trim()
    if (!t || sending) return
    setError('')
    setSending(true)
    try {
      await callBackend('/rescue/instruction', {
        body: { requestId, type: 'text', text: t },
      })
      setText('')
    } catch (e) {
      setError(e.message || 'Could not send. Try again.')
    } finally {
      setSending(false)
    }
  }

  const startRecording = async () => {
    setError('')
    setMicBlocked(false)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone not available on this browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/webm'
      // 16 kbps Opus keeps a 30s note around 60KB so it always fits the
      // Firestore inline-base64 path (we don't rely on Firebase Storage).
      const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 16000 })
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: mime })
        const arrayBuf = await blob.arrayBuffer()
        const base64 = bufferToBase64(arrayBuf)
        const dur = recordSeconds
        try {
          setSending(true)
          await callBackend('/rescue/instruction', {
            body: {
              requestId,
              type: 'audio',
              audioBase64: base64,
              mimeType: mime,
              durationSec: dur,
            },
          })
        } catch (e) {
          setError(e.message || 'Could not upload voice note.')
        } finally {
          setSending(false)
        }
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
      setRecordSeconds(0)
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((s) => {
          if (s >= 30) {
            stopRecording()
            return s
          }
          return s + 1
        })
      }, 1000)
    } catch (e) {
      // Browsers throw `NotAllowedError` on permission denial (Chrome,
      // Firefox, Safari, Edge). Anything else is treated as a generic error.
      const denied =
        e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
      if (denied) {
        setMicBlocked(true)
        setError('')
      } else {
        setError(e.message || 'Could not start recording. Try again.')
      }
    }
  }

  const stopRecording = () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current)
    recordTimerRef.current = null
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setRecording(false)
  }

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold text-blue-600 uppercase tracking-widest">
          Send extra info to driver
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Allergies, exact landmark, what just happened — anything helps the crew prepare.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 500))}
        placeholder="e.g. Patient is diabetic. We're at gate 3, blue door."
        rows={2}
        className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-navy placeholder-gray-400 text-sm focus:outline-none focus:border-blue-500 resize-none"
      />

      <div className="grid grid-cols-2 gap-2 mt-3">
        <button
          onClick={sendText}
          disabled={!text.trim() || sending}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-bold text-sm py-3 rounded-2xl transition-colors"
        >
          {sending ? 'Sending…' : 'Send text'}
        </button>

        {!recording ? (
          <button
            onClick={startRecording}
            disabled={sending}
            className="bg-rose-500 hover:bg-rose-600 disabled:bg-gray-300 text-white font-bold text-sm py-3 rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            🎤 Record voice
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="bg-rose-600 text-white font-bold text-sm py-3 rounded-2xl flex items-center justify-center gap-2 animate-pulse"
          >
            ⏹ Stop ({recordSeconds}s)
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs">
          {error}
        </div>
      )}

      {micBlocked && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs space-y-2">
          <div className="font-bold text-sm flex items-center gap-1.5">
            🎤 Microphone is blocked
          </div>
          <p className="leading-relaxed">
            You denied microphone access. Voice notes won't work until you
            re-allow it. You can still send text notes above.
          </p>
          <ol className="list-decimal pl-4 space-y-0.5">
            {browserName === 'chrome' || browserName === 'edge' ? (
              <>
                <li>Tap the 🔒 padlock at the left of the address bar.</li>
                <li>Find <b>Microphone</b> → set to <b>Allow</b>.</li>
                <li>Reload this page and tap Record again.</li>
              </>
            ) : browserName === 'firefox' ? (
              <>
                <li>Tap the 🔒 padlock left of the address bar.</li>
                <li>Click <b>Clear permission</b> next to Microphone.</li>
                <li>Reload and tap Record — answer <b>Allow</b> this time.</li>
              </>
            ) : browserName === 'safari' ? (
              <>
                <li>Open <b>Settings → Safari → Microphone</b>.</li>
                <li>Find this site, change to <b>Allow</b>.</li>
                <li>Reload this page and tap Record.</li>
              </>
            ) : (
              <>
                <li>Open your browser's site settings.</li>
                <li>Allow microphone access for this page.</li>
                <li>Reload and tap Record again.</li>
              </>
            )}
          </ol>
          <button
            onClick={() => setMicBlocked(false)}
            className="text-amber-700 underline text-[11px] mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {instructions.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            Sent ({instructions.length})
          </div>
          {instructions.map((it) => (
            <InstructionRow key={it.id} instruction={it} />
          ))}
        </div>
      )}
    </div>
  )
}

function InstructionRow({ instruction }) {
  const isAudio = instruction.type === 'audio'
  const audioSrc = instruction.audioUrl
    ? instruction.audioUrl
    : instruction.audioBase64
    ? `data:${instruction.mimeType || 'audio/webm'};base64,${instruction.audioBase64}`
    : null
  return (
    <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3">
      {isAudio ? (
        <div className="flex items-center gap-2">
          <span className="text-base">🎤</span>
          <span className="text-xs font-semibold text-blue-700">
            Voice note · {instruction.durationSec || '?'}s
          </span>
          {audioSrc && (
            <audio src={audioSrc} controls className="ml-auto h-8 max-w-[180px]" />
          )}
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <span className="text-base">📝</span>
          <p className="text-sm text-navy leading-snug">{instruction.text}</p>
        </div>
      )}
    </div>
  )
}

function bufferToBase64(arrayBuf) {
  const bytes = new Uint8Array(arrayBuf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// ─── RatingPanel ─────────────────────────────────────────────────────────
// Captured immediately after the ride is completed. Submits via the backend
// (which atomically updates the driver's running average + completed count).

function RatingPanel({ requestId, driverName, onSubmitted }) {
  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!stars || submitting) return
    setSubmitting(true)
    setError('')
    try {
      await callBackend('/rescue/rate', {
        body: { requestId, rating: stars, comment: comment.trim() },
      })
      onSubmitted?.()
    } catch (e) {
      setError(e.message || 'Could not submit rating.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border-2 border-amber-200">
      <div className="text-center mb-3">
        <div className="text-2xl mb-1">🌟</div>
        <div className="font-extrabold text-navy text-base">
          How was {driverName || 'your driver'}?
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Your feedback shapes who serves the next patient.
        </div>
      </div>

      <div className="flex justify-center gap-2 mb-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setStars(n)}
            className={`text-3xl transition-transform ${
              n <= stars ? 'scale-110' : 'opacity-30'
            }`}
            aria-label={`Rate ${n} stars`}
          >
            ⭐
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, 500))}
        placeholder="Optional: a short comment for the driver"
        rows={2}
        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-navy placeholder-gray-400 text-sm focus:outline-none focus:border-amber-400 resize-none mb-3"
      />

      <button
        onClick={submit}
        disabled={!stars || submitting}
        className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white font-bold py-3 rounded-2xl transition-colors"
      >
        {submitting ? 'Submitting…' : 'Submit rating'}
      </button>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs">
          {error}
        </div>
      )}
    </div>
  )
}
