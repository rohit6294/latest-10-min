const rows = [
  {
    feature: 'Response Speed',
    traditional: 'Often 30+ min',
    rescue: 'Fast dispatch',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    feature: 'Ambulance Verification',
    traditional: 'No guarantee',
    rescue: 'All verified',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    feature: 'Live Tracking',
    traditional: 'Not available',
    rescue: 'Live location link',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    ),
  },
  {
    feature: 'Transparency',
    traditional: 'Low visibility',
    rescue: 'Clear updates',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    feature: 'Family Updates',
    traditional: 'Manual calls',
    rescue: 'Shared link',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  },
]

export default function Comparison() {
  return (
    <section id="comparison" className="py-20 sm:py-28 bg-light-bg">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16 fade-in">
          <span className="inline-block text-emergency font-semibold text-sm tracking-wider uppercase mb-3">
            The Difference
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-navy mb-4">
            Why Choose Us
          </h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            See how Suraksha Kavach compares to traditional ambulance services.
          </p>
        </div>

        {/* Comparison Table */}
        <div className="fade-in">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl overflow-hidden border border-gray-100">
          {/* Table Header */}
          <div className="grid grid-cols-3 bg-navy text-white">
            <div className="p-2.5 sm:p-6 font-bold text-xs sm:text-base">Feature</div>
            <div className="p-2.5 sm:p-6 font-bold text-xs sm:text-base text-center border-l border-white/10">Traditional</div>
            <div className="p-2.5 sm:p-6 font-bold text-xs sm:text-base text-center border-l border-white/10 bg-emergency">Suraksha Kavach</div>
          </div>

          {/* Rows */}
          {rows.map((row, i) => (
            <div
              key={row.feature}
              className={`grid grid-cols-3 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50/50 transition-colors`}
            >
              {/* Feature */}
              <div className="p-2.5 sm:p-6 flex items-center gap-2 sm:gap-3">
                <span className="text-navy/40 hidden sm:block">{row.icon}</span>
                <span className="font-semibold text-navy text-xs sm:text-base">{row.feature}</span>
              </div>

              {/* Traditional */}
              <div className="p-2.5 sm:p-6 flex items-center justify-center border-l border-gray-100">
                <div className="flex items-center gap-1 sm:gap-2">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="text-gray-500 text-[10px] sm:text-sm leading-tight">{row.traditional}</span>
                </div>
              </div>

              {/* Suraksha Kavach */}
              <div className="p-2.5 sm:p-6 flex items-center justify-center border-l border-gray-100 bg-emerald-50/50">
                <div className="flex items-center gap-1 sm:gap-2">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span className="text-navy font-medium text-[10px] sm:text-sm leading-tight">{row.rescue}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        </div>
      </div>
    </section>
  )
}
