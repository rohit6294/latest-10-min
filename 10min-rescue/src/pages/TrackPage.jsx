import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

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

export default function TrackPage() {
  const { requestId } = useParams()
  const [req, setReq] = useState(null)
  const [driverLocation, setDriverLocation] = useState(null) // {lat, lng}
  const [route, setRoute] = useState([]) // array of [lat, lng]
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef({})
  const polylineRef = useRef(null)

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
