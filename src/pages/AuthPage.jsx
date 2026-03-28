import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signUp, signIn } from '../firebase/auth'
import { useApp } from '../context/AppContext'
import { DEPARTMENTS } from '../data/mockData'
import { RiHexagonFill, RiEyeLine, RiEyeOffLine } from 'react-icons/ri'
import './AuthPage.css'

export default function AuthPage() {
  const [tab,      setTab]      = useState('login')    // 'login' | 'signup'
  const [loading,  setLoading]  = useState(false)
  const [showPass, setShowPass] = useState(false)
  const { addToast } = useApp()
  const navigate = useNavigate()

  // Login form
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })

  // Sign up form
  const [signupForm, setSignupForm] = useState({
    displayName: '',
    email: '',
    password: '',
    department: '',
  })

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await signIn(loginForm)
      navigate('/messaging')
    } catch (err) {
      addToast(err.message || 'Login failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    if (!signupForm.department) {
      addToast('Please select a department', 'error')
      return
    }
    setLoading(true)
    try {
      await signUp(signupForm)
      addToast('Account created! Welcome to Borg.', 'success')
      navigate('/messaging')
    } catch (err) {
      addToast(err.message || 'Sign up failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  // In mock mode, skip auth entirely
  const handleMockEnter = () => navigate('/messaging')

  return (
    <div className="auth-page">
      <div className="auth-bg-glow" aria-hidden="true" />

      <div className="auth-card glass">
        {/* Brand */}
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <RiHexagonFill />
          </div>
          <div>
            <div className="auth-brand-name">BORG</div>
            <div className="auth-brand-tagline">AI Agent Network</div>
          </div>
        </div>

        <h2 className="auth-title">
          {tab === 'login' ? 'Welcome back' : 'Create your account'}
        </h2>
        <p className="auth-subtitle">
          {tab === 'login'
            ? 'Sign in to access your AI agent and org network'
            : 'Set up your profile to initialize your personal AI proxy'}
        </p>

        {/* Tab switch */}
        <div className="tab-bar auth-tabs">
          <button
            id="auth-tab-login"
            className={`tab-item ${tab === 'login' ? 'active' : ''}`}
            onClick={() => setTab('login')}
          >Sign In</button>
          <button
            id="auth-tab-signup"
            className={`tab-item ${tab === 'signup' ? 'active' : ''}`}
            onClick={() => setTab('signup')}
          >Create Account</button>
        </div>

        {/* ── Login Form ── */}
        {tab === 'login' && (
          <form className="auth-form" onSubmit={handleLogin} id="login-form">
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                className="form-input"
                placeholder="you@company.com"
                value={loginForm.email}
                onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
                required
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="login-password">Password</label>
              <div className="password-wrap">
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  className="form-input"
                  placeholder="••••••••"
                  value={loginForm.password}
                  onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPass(v => !v)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? <RiEyeOffLine /> : <RiEyeLine />}
                </button>
              </div>
            </div>
            <button
              id="btn-login"
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={loading}
            >
              {loading ? <><span className="spinner" style={{ width: 18, height: 18 }} />Signing in...</> : 'Sign In'}
            </button>
          </form>
        )}

        {/* ── Signup Form ── */}
        {tab === 'signup' && (
          <form className="auth-form" onSubmit={handleSignUp} id="signup-form">
            <div className="form-group">
              <label className="form-label" htmlFor="signup-name">Full Name</label>
              <input
                id="signup-name"
                type="text"
                className="form-input"
                placeholder="Alex Rivera"
                value={signupForm.displayName}
                onChange={e => setSignupForm(f => ({ ...f, displayName: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="signup-email">Work Email</label>
              <input
                id="signup-email"
                type="email"
                className="form-input"
                placeholder="alex@company.com"
                value={signupForm.email}
                onChange={e => setSignupForm(f => ({ ...f, email: e.target.value }))}
                required
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="signup-dept">Department</label>
              <select
                id="signup-dept"
                className="form-select"
                value={signupForm.department}
                onChange={e => setSignupForm(f => ({ ...f, department: e.target.value }))}
                required
              >
                <option value="">Select your department...</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="signup-password">Password</label>
              <div className="password-wrap">
                <input
                  id="signup-password"
                  type={showPass ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Min 6 characters"
                  value={signupForm.password}
                  onChange={e => setSignupForm(f => ({ ...f, password: e.target.value }))}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPass(v => !v)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? <RiEyeOffLine /> : <RiEyeLine />}
                </button>
              </div>
            </div>

            <div className="signup-agent-notice">
              🤖 Creating your account will initialize a dedicated AI proxy agent with default system instructions.
            </div>

            <button
              id="btn-signup"
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={loading}
            >
              {loading ? <><span className="spinner" style={{ width: 18, height: 18 }} />Creating account...</> : 'Create Account & Initialize Agent'}
            </button>
          </form>
        )}

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button
          id="btn-demo-mode"
          className="btn btn-ghost btn-full"
          onClick={handleMockEnter}
        >
          Enter Demo Mode (no account needed)
        </button>

        <p className="auth-footnote">
          Project Borg · YCONIC Hackathon · All data is org-scoped and private.
        </p>
      </div>
    </div>
  )
}
