import { useState } from 'react'
import { supabase } from './supabase'

export default function Auth() {
    const [loading, setLoading] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isSignUp, setIsSignUp] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    const [successMsg, setSuccessMsg] = useState('')

    const handleAuth = async (e) => {
        e.preventDefault()
        setLoading(true)
        setErrorMsg('')
        setSuccessMsg('')

        if (isSignUp) {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
            })
            if (error) {
                setErrorMsg(error.message)
            } else if (data.session) {
                setSuccessMsg('Account created successfully!')
            } else {
                setSuccessMsg('Success! Please check your email for the confirmation link.')
            }
        } else {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password })
            if (error) setErrorMsg(error.message)
        }
        setLoading(false)
    }

    // Styles reused from App
    const T = { bg: "#080c14", surface: "#0e1420", card: "#131b2e", border: "#1e2d4a", text: "#e8edf5", muted: "#5a7090", accent: "#3b82f6", red: "#ef4444", green: "#22c55e" }
    const inputStyle = { width: "100%", boxSizing: "border-box", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 14, padding: "12px", fontFamily: "inherit", outline: "none", marginBottom: 12 }

    return (
        <div style={{ background: T.bg, minHeight: "100vh", color: T.text, fontFamily: "'Inter', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 32, width: "100%", maxWidth: 400 }}>
                <h2 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 700 }}>{isSignUp ? 'Create Account' : 'Welcome Back'}</h2>
                <p style={{ margin: "0 0 24px", fontSize: 14, color: T.muted }}>Enter your details to access your portfolio.</p>

                {errorMsg && <div style={{ background: "#ef444420", color: T.red, border: `1px solid ${T.red}44`, padding: "12px 16px", borderRadius: 8, marginBottom: 20, fontSize: 13, lineHeight: 1.4 }}>{errorMsg}</div>}
                {successMsg && <div style={{ background: "#22c55e20", color: T.green, border: `1px solid ${T.green}44`, padding: "12px 16px", borderRadius: 8, marginBottom: 20, fontSize: 13, lineHeight: 1.4 }}>{successMsg}</div>}

                <form onSubmit={handleAuth}>
                    <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} required />
                    <input type="password" placeholder="Password (min. 6 chars)" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} required minLength={6} />
                    <button type="submit" disabled={loading} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", cursor: loading ? "default" : "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit", marginTop: 8, opacity: loading ? 0.7 : 1, transition: "opacity 0.2s" }}>
                        {loading ? 'Processing...' : (isSignUp ? 'Sign Up securely' : 'Log In')}
                    </button>
                </form>

                <p style={{ margin: "24px 0 0", textAlign: "center", fontSize: 13, color: T.muted }}>
                    {isSignUp ? "Already have an account?" : "Don't have an account?"}
                    <button onClick={() => { setIsSignUp(!isSignUp); setErrorMsg(''); setSuccessMsg(''); }} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", padding: "0 0 0 6px", fontFamily: "inherit", fontSize: 13, fontWeight: 600 }}>
                        {isSignUp ? 'Log In' : 'Sign Up'}
                    </button>
                </p>
            </div>
        </div>
    )
}
