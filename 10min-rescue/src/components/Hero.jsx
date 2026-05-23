export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-navy">
      {/* Background gradient + pattern */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-navy via-navy-light to-navy" />
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
        {/* Glowing orbs */}
        <div className="absolute top-20 right-10 w-72 h-72 bg-emergency/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-20 left-10 w-96 h-96 bg-accent-blue/15 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28 sm:py-32 w-full">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="text-center lg:text-left overflow-hidden">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 mb-6">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-white/90 text-sm font-medium">Live in Your City</span>
            </div>

            <h1 className="text-2xl min-[400px]:text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-5 sm:mb-6">
              Emergency Ambulance
              <span className="block text-brand-red mt-1 sm:mt-2">Support in Minutes</span>
            </h1>

            <p className="text-base sm:text-xl text-white/70 max-w-xl mx-auto lg:mx-0 mb-6 sm:mb-8 leading-relaxed px-2 sm:px-0">
              Get connected to a nearby verified ambulance with real-time coordination. Fast, reliable, and transparent emergency response.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-3 justify-center lg:justify-start mb-8 sm:mb-10 px-2 sm:px-0">
              {/* SOS Button — opens multi-step wizard */}
              <a
                href="/sos"
                className="group relative inline-flex items-center justify-center gap-2 whitespace-nowrap bg-brand-red hover:bg-brand-red-dark text-white font-bold text-sm sm:text-base px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl transition-all hover:shadow-2xl hover:shadow-brand-red/40 hover:-translate-y-1"
              >
                <span className="absolute inset-0 rounded-xl bg-brand-red/50 animate-pulse-ring" />
                <svg className="w-5 h-5 relative" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <span className="relative">🚨 Emergency SOS</span>
              </a>

              {/* Callback Button */}
              <a
                href="/callback"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap bg-white/10 hover:bg-white/15 backdrop-blur-sm border-2 border-white/20 text-white font-bold text-sm sm:text-base px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl transition-all hover:-translate-y-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.272.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
                Request Callback
              </a>

              {/* WhatsApp Button */}
              <a
                href="https://wa.me/917866067136?text=SOS"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap bg-green-500 hover:bg-green-600 text-white font-bold text-sm sm:text-base px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl transition-all hover:shadow-2xl hover:shadow-green-500/40 hover:-translate-y-1"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                </svg>
                WhatsApp SOS
              </a>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap justify-center lg:justify-start gap-3 sm:gap-6 px-2 sm:px-0">
              {[
                { icon: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z', label: 'Fast Dispatch', sub: 'Ambulance in minutes' },
                { icon: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z', label: 'Trusted Network', sub: 'Verified hospitals & partners' },
                { icon: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z', label: 'Human First', sub: 'Care, compassion, commitment' },
              ].map((badge) => (
                <div key={badge.label} className="flex items-start gap-2 text-white/70">
                  <svg className="w-5 h-5 text-brand-red mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={badge.icon} />
                  </svg>
                  <div>
                    <div className="text-sm font-bold text-white">{badge.label}</div>
                    <div className="text-[11px] text-white/50">{badge.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Side - Ambulance Visual */}
          <div className="hidden lg:flex justify-center items-center">
            <div className="relative">
              <div className="w-80 h-80 bg-white/5 backdrop-blur-lg border border-white/10 rounded-3xl p-8 flex flex-col items-center justify-center animate-float">
                <div className="w-24 h-24 bg-brand-red/20 rounded-full flex items-center justify-center mb-6">
                  <svg className="w-14 h-14 text-brand-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                  </svg>
                </div>
                <p className="text-white font-bold text-xl mb-2">Ambulance Nearby</p>
                <p className="text-white/50 text-sm">Verified & Ready to Dispatch</p>
                <div className="flex gap-3 mt-6">
                  <span className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }} />
                  <span className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
                </div>
              </div>
              <div className="absolute -top-4 -right-4 bg-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-2">
                <span className="w-3 h-3 bg-emerald-500 rounded-full" />
                <span className="text-navy text-sm font-bold">Live Tracking</span>
              </div>
              <div className="absolute -bottom-4 -left-4 bg-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-brand-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-navy text-sm font-bold">Fast Response</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom wave */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
          <path d="M0 80V40C240 0 480 0 720 20C960 40 1200 60 1440 40V80H0Z" fill="white" />
        </svg>
      </div>
    </section>
  )
}
