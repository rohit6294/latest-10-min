import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase'

export default function HospitalLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      // Verify the user has a hospital document in Firestore
      const hospDoc = await getDoc(doc(db, 'hospitals', cred.user.uid))
      if (!hospDoc.exists()) {
        await auth.signOut()
        setError('This account is not registered as a hospital. Please contact support.')
        return
      }
      navigate('/hospital/dashboard')
    } catch (err) {
      const code = err.code
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Invalid email or password.')
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.')
      } else {
        setError('Login failed. Please check your connection and try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-navy to-navy-light flex items-center justify-center p-4">
      {/* Back to website link */}
      <a
        href="/"
        className="absolute top-6 left-6 flex items-center gap-2 text-white/70 hover:text-white transition-colors text-sm"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to website
      </a>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-emergency rounded-2xl flex items-center justify-center shadow-lg shadow-emergency/40">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-white">
              Suraksha <span className="text-emergency">Kavach</span>
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white">Hospital Portal</h1>
          <p className="text-white/60 mt-1 text-sm">Sign in to manage ambulance requests</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                {error}
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="hospital@example.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emergency/30 focus:border-emergency text-navy placeholder-gray-400 transition-all"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emergency/30 focus:border-emergency text-navy placeholder-gray-400 transition-all"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emergency hover:bg-emergency-dark text-white font-semibold py-3.5 rounded-xl transition-all hover:shadow-lg hover:shadow-emergency/30 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </>
              ) : 'Sign In to Dashboard'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            Hospital login only · Contact admin for access
          </p>
        </div>
      </div>
    </div>
  )
}
