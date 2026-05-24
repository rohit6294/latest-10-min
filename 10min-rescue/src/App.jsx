import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import useScrollReveal from './useScrollReveal'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import HowItWorks from './components/HowItWorks'
import Features from './components/Features'
import Trust from './components/Trust'
import Comparison from './components/Comparison'
import Demo from './components/Demo'
import CTA from './components/CTA'
import Footer from './components/Footer'
import StickyBar from './components/StickyBar'
import ResumeBanner from './components/ResumeBanner'

// Heavy non-landing routes are code-split so the marketing page loads
// without pulling Firebase listeners, Leaflet, etc. into the initial bundle.
const HospitalLogin = lazy(() => import('./pages/HospitalLogin'))
const HospitalDashboard = lazy(() => import('./pages/HospitalDashboard'))
const AdminLogin = lazy(() => import('./pages/AdminLogin'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const SosPage = lazy(() => import('./pages/SosPage'))
const CallbackPage = lazy(() => import('./pages/CallbackPage'))
const TrackPage = lazy(() => import('./pages/TrackPage'))
const FleetLogin = lazy(() => import('./pages/FleetLogin'))
const FleetDashboard = lazy(() => import('./pages/FleetDashboard'))

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-light-bg">
      <div className="text-center">
        <div className="w-10 h-10 rounded-full border-4 border-red-200 border-t-red-600 animate-spin mx-auto" />
        <div className="text-xs text-gray-500 mt-3">Loading…</div>
      </div>
    </div>
  )
}

function LandingPage() {
  useScrollReveal()
  return (
    <div className="overflow-x-hidden">
      <Navbar />
      <ResumeBanner />
      <Hero />
      <HowItWorks />
      <Features />
      <Trust />
      <Comparison />
      <Demo />
      <CTA />
      <Footer />
      <StickyBar />
      <div className="h-20 md:hidden" />
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/hospital" element={<HospitalLogin />} />
          <Route path="/hospital/dashboard" element={<HospitalDashboard />} />
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/fleet" element={<FleetLogin />} />
          <Route path="/fleet/dashboard" element={<FleetDashboard />} />
          <Route path="/sos" element={<SosPage />} />
          <Route path="/callback" element={<CallbackPage />} />
          <Route path="/track/:requestId" element={<TrackPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
