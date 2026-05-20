export default function Footer() {
  return (
    <footer id="footer" className="bg-navy text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Footer */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 py-16">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 brand-icon shadow-lg shadow-brand-red/30">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="text-xl font-bold">
                Suraksha <span className="text-brand-red">Kavach</span>
              </span>
            </div>
            <p className="text-white/50 text-sm leading-relaxed mb-6">
              Fast, verified emergency ambulance coordination. Building a trusted healthcare emergency network for your city.
            </p>
            <div className="flex gap-3">
              {['facebook', 'twitter', 'instagram', 'linkedin'].map((social) => (
                <a
                  key={social}
                  href="#"
                  className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-center transition-colors"
                >
                  <span className="text-white/60 text-xs uppercase font-bold">{social[0]}</span>
                </a>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider text-white/80 mb-4">Quick Links</h4>
            <ul className="space-y-3">
              {[
                { label: 'How It Works', href: '#how-it-works' },
                { label: 'Features', href: '#features' },
                { label: 'Why Choose Us', href: '#comparison' },
                { label: 'Watch Demo', href: '#demo' },
              ].map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="text-white/50 hover:text-white text-sm transition-colors">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider text-white/80 mb-4">Contact</h4>
            <ul className="space-y-3">
              <li>
                <a href="tel:+917866067136" className="text-white/50 hover:text-white text-sm transition-colors flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                  +91 78660 67136
                </a>
              </li>
              <li>
                <a href="mailto:help@10minrescue.com" className="text-white/50 hover:text-white text-sm transition-colors flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                  help@10minrescue.com
                </a>
              </li>
              <li>
                <a href="https://wa.me/917866067136" target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-white text-sm transition-colors flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  WhatsApp Us
                </a>
              </li>
            </ul>
          </div>

          {/* Operating */}
          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider text-white/80 mb-4">Service Area</h4>
            <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse" />
                <span className="text-emerald-400 text-sm font-semibold">Currently Live</span>
              </div>
              <p className="text-white font-bold text-lg mb-1">Kolkata, India</p>
              <p className="text-white/40 text-sm">Expanding to more cities soon</p>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/10 py-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-white/40 text-sm">
            &copy; {new Date().getFullYear()} Suraksha Kavach. All rights reserved.
          </p>
          <p className="text-white/30 text-xs">
            Emergency ambulance coordination service
          </p>
        </div>
      </div>
    </footer>
  )
}
