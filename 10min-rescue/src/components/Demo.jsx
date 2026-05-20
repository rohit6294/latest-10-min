import { useState, useEffect, useRef } from 'react'

const STEPS = [
  {
    id: 1,
    label: 'Open SOS',
    sublabel: 'Tap one button',
    title: 'Tap Emergency SOS',
    desc: 'Open min-rescue.web.app/sos and start the wizard',
  },
  {
    id: 2,
    label: 'Share Details',
    sublabel: 'Type & urgency',
    title: 'Describe Emergency',
    desc: 'Quick description, urgency level, ambulance type',
  },
  {
    id: 3,
    label: 'Pick Hospital',
    sublabel: 'Live availability',
    title: 'Choose Hospital',
    desc: 'See nearby hospitals with available beds, ratings, distance',
  },
  {
    id: 4,
    label: 'Driver Coming',
    sublabel: 'Live tracking',
    title: 'Help is on the way',
    desc: 'Nearest verified driver dispatched. Hospital pre-alerted.',
  },
]

export default function Demo() {
  const [activeStep, setActiveStep] = useState(1)
  const [playing, setPlaying] = useState(false)
  const intervalRef = useRef(null)

  // Auto-advance when playing
  useEffect(() => {
    if (!playing) return
    intervalRef.current = setInterval(() => {
      setActiveStep((s) => (s >= 4 ? 1 : s + 1))
    }, 3000)
    return () => clearInterval(intervalRef.current)
  }, [playing])

  const togglePlay = () => {
    if (playing) {
      setPlaying(false)
    } else {
      setActiveStep(1)
      setPlaying(true)
    }
  }

  const goToStep = (id) => {
    setActiveStep(id)
    setPlaying(false)
  }

  return (
    <section id="demo" className="py-20 sm:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12 sm:mb-16 fade-in">
          <span className="inline-block text-brand-red font-semibold text-sm tracking-wider uppercase mb-3">
            See It In Action
          </span>
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-navy mb-4">
            How Suraksha Kavach Works
          </h2>
          <p className="text-base sm:text-lg text-gray-500 max-w-2xl mx-auto">
            Watch the actual flow — or try it yourself.
          </p>
        </div>

        {/* Interactive walkthrough */}
        <div className="fade-in max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">

            {/* Left: Phone mockup with animated content */}
            <div className="flex justify-center">
              <PhoneMockup activeStep={activeStep} />
            </div>

            {/* Right: Step controls + descriptions */}
            <div>
              <div className="bg-light-bg rounded-3xl p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <button
                    onClick={togglePlay}
                    className="w-12 h-12 bg-brand-red text-white rounded-full flex items-center justify-center shadow-lg shadow-brand-red/30 hover:scale-105 transition-transform"
                    aria-label={playing ? 'Pause' : 'Play'}
                  >
                    {playing ? (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                  <div>
                    <p className="text-navy font-bold text-base">
                      {playing ? 'Auto-playing demo' : 'Tap a step or play'}
                    </p>
                    <p className="text-gray-400 text-xs">
                      Step {activeStep} of 4
                    </p>
                  </div>
                </div>

                {/* Active step details */}
                <div key={activeStep} className="bg-white rounded-2xl p-5 mb-6 border border-gray-100 animate-fadeStep">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-8 h-8 bg-brand-red text-white rounded-full flex items-center justify-center text-sm font-bold">
                      {activeStep}
                    </span>
                    <h3 className="text-navy font-bold text-lg">
                      {STEPS[activeStep - 1].title}
                    </h3>
                  </div>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    {STEPS[activeStep - 1].desc}
                  </p>
                </div>

                {/* Step buttons */}
                <div className="grid grid-cols-2 gap-2 mb-6">
                  {STEPS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => goToStep(s.id)}
                      className={`text-left p-3 rounded-xl border-2 transition-all ${
                        activeStep === s.id
                          ? 'bg-brand-red/5 border-brand-red'
                          : 'bg-white border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          activeStep === s.id ? 'bg-brand-red text-white' : 'bg-gray-200 text-gray-500'
                        }`}>
                          {s.id}
                        </span>
                        <span className={`text-xs font-bold ${activeStep === s.id ? 'text-brand-red' : 'text-navy'}`}>
                          {s.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 leading-tight">{s.sublabel}</p>
                    </button>
                  ))}
                </div>

                {/* CTA */}
                <a
                  href="/sos"
                  className="block w-full bg-brand-red hover:bg-brand-red-dark text-white text-center font-bold py-3.5 rounded-2xl transition-colors shadow-lg shadow-brand-red/30"
                >
                  🚨 Try It Now — Start SOS
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeStep {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeStep { animation: fadeStep 0.4s ease-out; }
      `}</style>
    </section>
  )
}

// ─── Phone Mockup with animated content per step ──────────────────────────

function PhoneMockup({ activeStep }) {
  return (
    <div className="relative">
      {/* Phone frame */}
      <div className="w-[260px] sm:w-[280px] bg-navy rounded-[40px] p-3 shadow-2xl shadow-navy/30 border-[3px] border-navy">
        {/* Notch */}
        <div className="flex justify-center mb-1">
          <div className="w-20 h-5 bg-black rounded-b-2xl" />
        </div>
        {/* Screen */}
        <div className="bg-navy rounded-[28px] aspect-[9/19] overflow-hidden relative">
          {/* Background glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-navy via-navy-light to-navy" />
          <div className="absolute top-10 right-0 w-40 h-40 bg-brand-red/20 rounded-full blur-[60px]" />

          {/* Step screens */}
          {activeStep === 1 && <Step1Screen />}
          {activeStep === 2 && <Step2Screen />}
          {activeStep === 3 && <Step3Screen />}
          {activeStep === 4 && <Step4Screen />}
        </div>
      </div>

      {/* Floating progress dots */}
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className={`h-1.5 rounded-full transition-all ${
              n === activeStep ? 'w-6 bg-brand-red' : 'w-1.5 bg-white/30'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

// Step 1: Big SOS button (simulating /sos landing)
function Step1Screen() {
  return (
    <div className="relative z-10 h-full flex flex-col px-4 py-5 animate-fadeStep">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 bg-brand-red rounded-lg flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <span className="text-white text-xs font-bold">Suraksha Kavach</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-brand-red rounded-full flex items-center justify-center mb-3 shadow-lg shadow-brand-red/40 relative">
          <span className="absolute inset-0 rounded-full bg-brand-red/40 animate-ping" />
          <svg className="w-8 h-8 text-white relative" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h3 className="text-white font-bold text-base mb-1">Emergency SOS</h3>
        <p className="text-white/60 text-[10px] mb-4 leading-snug">Tap to share location and get help</p>
        <div className="w-full bg-brand-red rounded-xl py-2.5 text-white text-xs font-bold mb-2">
          🚨 Send SOS
        </div>
        <div className="w-full bg-white/10 border border-white/15 rounded-xl py-2 text-white text-xs font-medium">
          Request Callback
        </div>
      </div>
    </div>
  )
}

// Step 2: Description + urgency
function Step2Screen() {
  return (
    <div className="relative z-10 h-full flex flex-col px-4 py-5 animate-fadeStep">
      <div className="flex gap-1 mb-4">
        <div className="flex-1 h-1 bg-brand-red rounded-full" />
        <div className="flex-1 h-1 bg-white/15 rounded-full" />
        <div className="flex-1 h-1 bg-white/15 rounded-full" />
        <div className="flex-1 h-1 bg-white/15 rounded-full" />
      </div>
      <h3 className="text-white font-bold text-base mb-1">What happened?</h3>
      <p className="text-white/50 text-[10px] mb-3">Tell us briefly</p>
      <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-[10px] mb-3">
        Father has chest pain, struggling to breathe...
      </div>
      <p className="text-white text-[10px] font-bold mb-2">How urgent?</p>
      <div className="space-y-1.5">
        <div className="bg-red-500/15 border-2 border-red-500 rounded-xl px-3 py-2 flex items-center gap-2">
          <span className="w-2 h-2 bg-red-500 rounded-full" />
          <span className="text-red-400 text-[10px] font-bold">Critical</span>
          <svg className="w-3 h-3 text-red-400 ml-auto" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="bg-white/5 rounded-xl px-3 py-2 flex items-center gap-2">
          <span className="w-2 h-2 bg-amber-500 rounded-full" />
          <span className="text-white/60 text-[10px]">Serious</span>
        </div>
        <div className="bg-white/5 rounded-xl px-3 py-2 flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full" />
          <span className="text-white/60 text-[10px]">Stable</span>
        </div>
      </div>
    </div>
  )
}

// Step 3: Hospital list
function Step3Screen() {
  return (
    <div className="relative z-10 h-full flex flex-col px-4 py-5 animate-fadeStep">
      <div className="flex gap-1 mb-4">
        <div className="flex-1 h-1 bg-brand-red rounded-full" />
        <div className="flex-1 h-1 bg-brand-red rounded-full" />
        <div className="flex-1 h-1 bg-brand-red rounded-full" />
        <div className="flex-1 h-1 bg-white/15 rounded-full" />
      </div>
      <h3 className="text-white font-bold text-base mb-1">Choose Hospital</h3>
      <p className="text-white/50 text-[10px] mb-3">Hospitals with ICU beds</p>
      <div className="space-y-1.5 overflow-hidden">
        <div className="bg-brand-red/10 border-2 border-brand-red rounded-xl p-2.5">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-6 h-6 bg-blue-500/20 rounded-md flex items-center justify-center text-[10px]">🏥</span>
            <span className="text-white text-[10px] font-bold flex-1">Apollo Hospital</span>
            <svg className="w-3 h-3 text-brand-red" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex gap-1 flex-wrap">
            <span className="text-[8px] bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded">⭐ 4.8</span>
            <span className="text-[8px] bg-green-500/15 text-green-300 px-1.5 py-0.5 rounded">3 beds</span>
            <span className="text-[8px] bg-blue-500/15 text-blue-300 px-1.5 py-0.5 rounded">2.1 km</span>
          </div>
        </div>
        <div className="bg-white/5 rounded-xl p-2.5">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-6 h-6 bg-blue-500/20 rounded-md flex items-center justify-center text-[10px]">🏥</span>
            <span className="text-white/70 text-[10px] font-bold">AMRI Hospital</span>
          </div>
          <div className="flex gap-1">
            <span className="text-[8px] bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded">⭐ 4.5</span>
            <span className="text-[8px] bg-green-500/15 text-green-300 px-1.5 py-0.5 rounded">1 bed</span>
            <span className="text-[8px] bg-blue-500/15 text-blue-300 px-1.5 py-0.5 rounded">3.4 km</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Step 4: Help coming + driver dispatched
function Step4Screen() {
  return (
    <div className="relative z-10 h-full flex flex-col px-4 py-5 animate-fadeStep items-center justify-center text-center">
      <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-3 relative">
        <span className="absolute inset-0 rounded-full bg-green-500/30 animate-ping" />
        <svg className="w-9 h-9 text-green-400 relative" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-green-400 font-bold text-base mb-1">Help is Coming!</h3>
      <p className="text-white/60 text-[10px] mb-4 leading-snug px-2">
        Nearest verified driver dispatched. Hospital pre-alerted.
      </p>
      <div className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 mb-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px]">🚑</span>
          <span className="text-white text-[10px] font-bold">Driver: Rohit</span>
          <span className="ml-auto text-[10px] bg-green-500/15 text-green-300 px-1.5 py-0.5 rounded">5 min</span>
        </div>
        <div className="text-[9px] text-white/50">Type A · ICU Ambulance</div>
      </div>
      <div className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5">
        <div className="text-[9px] text-white/40 mb-0.5">Hospital ready</div>
        <div className="text-[10px] text-white font-bold">Apollo Multispeciality</div>
      </div>
    </div>
  )
}
