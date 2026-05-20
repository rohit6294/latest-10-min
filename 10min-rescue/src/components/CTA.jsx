export default function CTA() {
  return (
    <section id="cta" className="relative py-16 sm:py-20 lg:py-28 overflow-hidden">
      <div className="absolute inset-0 bg-navy" />
      <div className="absolute inset-0 bg-gradient-to-br from-navy via-navy-light to-navy" />
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)',
        backgroundSize: '40px 40px'
      }} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-brand-red/15 rounded-full blur-[150px]" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="fade-in">
          <div className="w-16 h-16 sm:w-20 sm:h-20 brand-icon mx-auto mb-6 sm:mb-8 shadow-2xl shadow-brand-red/40">
            <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </div>

          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-4 sm:mb-6 leading-tight">
            In an Emergency,
            <span className="block text-brand-red">Every Second Matters</span>
          </h2>

          <p className="text-base sm:text-xl text-white/60 max-w-2xl mx-auto mb-8 sm:mb-10 px-2 sm:px-0">
            Don't wait. Get connected to a verified ambulance now. One tap sends your exact location.
          </p>

          {/* CTA Buttons — mobile responsive */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 max-w-3xl mx-auto px-2 sm:px-0">
            <a
              href="/sos"
              className="group relative inline-flex items-center justify-center gap-2 sm:gap-3 bg-brand-red hover:bg-brand-red-dark text-white font-bold text-base sm:text-lg px-4 sm:px-6 py-4 sm:py-5 rounded-2xl transition-all hover:shadow-2xl hover:shadow-brand-red/40 hover:-translate-y-1"
            >
              <span className="absolute inset-0 rounded-2xl bg-brand-red/50 animate-pulse-ring" />
              <svg className="w-5 h-5 sm:w-6 sm:h-6 relative" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span className="relative">🚨 Emergency SOS</span>
            </a>

            <a
              href="/callback"
              className="inline-flex items-center justify-center gap-2 sm:gap-3 bg-white hover:bg-white/90 text-navy font-bold text-base sm:text-lg px-4 sm:px-6 py-4 sm:py-5 rounded-2xl transition-all hover:shadow-2xl hover:-translate-y-1"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.272.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
              Request Callback
            </a>

            <a
              href="tel:+917866067136"
              className="inline-flex items-center justify-center gap-2 sm:gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white font-bold text-base sm:text-lg px-4 sm:px-6 py-4 sm:py-5 rounded-2xl transition-all hover:-translate-y-1"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
              Call Now
            </a>
          </div>

          <p className="text-white/40 text-sm mt-6 px-2 sm:px-0">
            <span className="text-brand-red font-bold">Suraksha Kavach</span> · Verified ambulances · 24/7 dispatch
          </p>
        </div>
      </div>
    </section>
  )
}
