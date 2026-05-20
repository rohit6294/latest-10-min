import { useState, useEffect } from 'react'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const links = [
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'Features', href: '#features' },
    { label: 'Why Us', href: '#comparison' },
    { label: 'Contact', href: '#footer' },
  ]

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/95 backdrop-blur-md shadow-lg'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 sm:w-10 sm:h-10 brand-icon shadow-lg shadow-brand-red/30 group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className={`text-lg sm:text-xl font-extrabold transition-colors ${scrolled ? 'text-navy' : 'text-white'}`}>
              Suraksha <span className="text-brand-red">Kavach</span>
            </span>
          </a>

          {/* Desktop Links */}
          <div className="hidden lg:flex items-center gap-6">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-emergency ${
                  scrolled ? 'text-navy/70' : 'text-white/80'
                }`}
              >
                {link.label}
              </a>
            ))}

            {/* Hospital Portal */}
            <a
              href="/hospital"
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors border rounded-full px-4 py-2 ${
                scrolled
                  ? 'border-navy/20 text-navy hover:border-navy hover:bg-navy hover:text-white'
                  : 'border-white/30 text-white/90 hover:border-white hover:bg-white/10'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
              </svg>
              Hospital Portal
            </a>

            {/* Fleet / NGO link — subtle */}
            <a
              href="/fleet"
              className={`text-xs font-medium transition-colors opacity-60 hover:opacity-100 ${
                scrolled ? 'text-navy' : 'text-white'
              }`}
            >
              Fleet
            </a>

            {/* Admin link — subtle */}
            <a
              href="/admin"
              className={`text-xs font-medium transition-colors opacity-50 hover:opacity-100 ${
                scrolled ? 'text-navy' : 'text-white'
              }`}
            >
              Admin
            </a>

            <a
              href="/sos"
              className="bg-brand-red hover:bg-brand-red-dark text-white text-sm font-bold px-5 py-2.5 rounded-full transition-all hover:shadow-lg hover:shadow-brand-red/40 hover:-translate-y-0.5"
            >
              🚨 SOS
            </a>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={`lg:hidden p-2 rounded-lg transition-colors ${
              scrolled ? 'text-navy' : 'text-white'
            }`}
          >
            {menuOpen ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="lg:hidden bg-white border-t shadow-xl">
          <div className="px-4 py-4 space-y-3">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="block text-navy/80 font-medium py-2 hover:text-emergency transition-colors"
              >
                {link.label}
              </a>
            ))}

            {/* Hospital Portal mobile */}
            <a
              href="/hospital"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 text-navy font-medium py-2 hover:text-emergency transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
              </svg>
              Hospital Portal
            </a>

            {/* Fleet / NGO portal — mobile */}
            <a
              href="/fleet"
              onClick={() => setMenuOpen(false)}
              className="block text-xs text-gray-400 hover:text-navy transition-colors py-1"
            >
              Fleet / NGO Portal
            </a>

            {/* Admin link — subtle, mobile */}
            <a
              href="/admin"
              onClick={() => setMenuOpen(false)}
              className="block text-xs text-gray-400 hover:text-navy transition-colors py-1"
            >
              Admin Portal
            </a>

            <a
              href="/sos"
              onClick={() => setMenuOpen(false)}
              className="block text-center bg-brand-red text-white font-bold py-3 rounded-xl mt-2"
            >
              🚨 Emergency SOS
            </a>
            <a
              href="/callback"
              onClick={() => setMenuOpen(false)}
              className="block text-center bg-white border-2 border-brand-red text-brand-red font-bold py-3 rounded-xl"
            >
              Request Callback
            </a>
          </div>
        </div>
      )}
    </nav>
  )
}
