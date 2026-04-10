'use client'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Save, User, Shield, Crown } from 'lucide-react'
import { toast, Toaster } from 'sonner'

interface UserProfile {
  userId: string
  email: string
  name: string
  role: string
  roles: string[]
  tier: string
  trialStartedAt: string | null
  createdAt: string
  profileData: {
    phone?: string
    dob?: string
    country?: string
    city?: string
    address1?: string
    address2?: string
    postalCode?: string
  }
}

const EU_COUNTRIES = [
  '', 'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czech Republic',
  'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary',
  'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta',
  'Netherlands', 'Poland', 'Portugal', 'Romania', 'Slovakia', 'Slovenia',
  'Spain', 'Sweden', 'Turkey', 'United Kingdom', 'United States', 'Other',
]

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  fun_user: 'Fun User',
  dj_user: 'DJ User',
}

const TIER_COLORS: Record<string, string> = {
  free: '#555570',
  fun_user: '#45b1e8',
  dj_user: '#ffff00',
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#ef4444',
  support_agent: '#f97316',
  beta_tester: '#a855f7',
  subscriber: '#4ade80',
  bookkeeper: '#45b1e8',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', fontSize: 13,
  background: '#12121f', border: '1px solid #2a2a4e', borderRadius: 8,
  color: '#e0e0f0', outline: 'none', fontFamily: 'inherit',
  transition: 'border-color 0.15s',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700, color: '#555570',
  letterSpacing: 0.8, textTransform: 'uppercase' as const, marginBottom: 6,
}

export default function ProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Editable fields
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [address1, setAddress1] = useState('')
  const [address2, setAddress2] = useState('')
  const [postalCode, setPostalCode] = useState('')

  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.userId) {
          window.location.href = '/login'
          return
        }
        setUser(data)
        setDisplayName(data.name || '')
        const pd = data.profileData || {}
        setPhone(pd.phone || '')
        setDob(pd.dob || '')
        setCountry(pd.country || '')
        setCity(pd.city || '')
        setAddress1(pd.address1 || '')
        setAddress2(pd.address2 || '')
        setPostalCode(pd.postalCode || '')
      })
      .catch(() => { window.location.href = '/login' })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: displayName,
          profile_data: { phone, dob, country, city, address1, address2, postalCode },
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast.success('Profile saved')
    } catch {
      toast.error('Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0b0b14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#555570', fontSize: 13 }}>Loading...</div>
      </div>
    )
  }

  if (!user) return null

  const memberSince = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Unknown'

  return (
    <div style={{ minHeight: '100vh', background: '#0b0b14', color: '#e0e0f0' }}>
      <Toaster position="top-right" theme="dark" />
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px 80px' }}>
        {/* Back link */}
        <motion.a
          href="/"
          whileHover={{ x: -3 }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: '#555570', fontSize: 12, textDecoration: 'none', marginBottom: 32,
          }}
        >
          <ArrowLeft size={14} /> Back to Studio
        </motion.a>

        {/* Profile header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 40 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'rgba(255,255,0,0.1)', border: '2px solid rgba(255,255,0,0.2)',
            color: '#ffff00', fontSize: 24, fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {user.name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.3px' }}>{user.name}</div>
            <div style={{ fontSize: 12, color: '#555570', marginTop: 2 }}>{user.email}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {(user.roles?.length > 0 ? user.roles : [user.role]).map(r => (
                <span key={r} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                  letterSpacing: 0.5, textTransform: 'uppercase',
                  background: `${ROLE_COLORS[r] || '#555570'}18`,
                  color: ROLE_COLORS[r] || '#555570',
                  border: `1px solid ${ROLE_COLORS[r] || '#555570'}30`,
                }}>
                  <Shield size={9} /> {r.replace('_', ' ')}
                </span>
              ))}
              <span style={{ fontSize: 10, color: '#444460' }}>Member since {memberSince}</span>
            </div>
          </div>
        </div>

        {/* Personal Information */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.3px', marginBottom: 20, paddingBottom: 10, borderBottom: '1px solid #1a1a2e' }}>
            <User size={14} style={{ marginRight: 8, verticalAlign: -2 }} />
            Personal Information
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Display Name</label>
              <input
                type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = '#ffff0040' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#2a2a4e' }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Email</label>
              <input
                type="email" value={user.email} readOnly
                style={{ ...inputStyle, opacity: 0.5, cursor: 'not-allowed' }}
              />
            </div>

            <div>
              <label style={labelStyle}>Phone Number</label>
              <input
                type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+31 6 12345678"
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = '#ffff0040' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#2a2a4e' }}
              />
            </div>

            <div>
              <label style={labelStyle}>Date of Birth</label>
              <input
                type="date" value={dob} onChange={e => setDob(e.target.value)}
                style={{ ...inputStyle, colorScheme: 'dark' }}
                onFocus={e => { e.currentTarget.style.borderColor = '#ffff0040' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#2a2a4e' }}
              />
            </div>

            <div>
              <label style={labelStyle}>Country</label>
              <select
                value={country} onChange={e => setCountry(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer', colorScheme: 'dark' }}
                onFocus={e => { e.currentTarget.style.borderColor = '#ffff0040' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#2a2a4e' }}
              >
                {EU_COUNTRIES.map(c => (
                  <option key={c} value={c}>{c || 'Select country...'}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>City</label>
              <input
                type="text" value={city} onChange={e => setCity(e.target.value)}
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = '#ffff0040' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#2a2a4e' }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Address Line 1</label>
              <input
                type="text" value={address1} onChange={e => setAddress1(e.target.value)}
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = '#ffff0040' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#2a2a4e' }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Address Line 2</label>
              <input
                type="text" value={address2} onChange={e => setAddress2(e.target.value)}
                placeholder="Apartment, suite, etc. (optional)"
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = '#ffff0040' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#2a2a4e' }}
              />
            </div>

            <div>
              <label style={labelStyle}>Postal Code</label>
              <input
                type="text" value={postalCode} onChange={e => setPostalCode(e.target.value)}
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = '#ffff0040' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#2a2a4e' }}
              />
            </div>
          </div>
        </section>

        {/* Subscription */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.3px', marginBottom: 20, paddingBottom: 10, borderBottom: '1px solid #1a1a2e' }}>
            <Crown size={14} style={{ marginRight: 8, verticalAlign: -2 }} />
            Subscription
          </h2>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px', borderRadius: 12,
            background: '#12121f', border: '1px solid #2a2a4e',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontSize: 14, fontWeight: 800,
                  color: TIER_COLORS[user.tier] || '#555570',
                }}>
                  {TIER_LABELS[user.tier] || user.tier}
                </span>
                {user.trialStartedAt && (
                  <span style={{
                    fontSize: 9, padding: '2px 8px', borderRadius: 4,
                    background: 'rgba(255,255,0,0.08)', color: '#ffff00',
                    fontWeight: 700, letterSpacing: 0.5,
                  }}>
                    TRIAL
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, color: '#555570', marginTop: 4 }}>
                {user.tier === 'free' ? 'Upgrade to unlock more features' : 'Your subscription is active'}
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                background: 'rgba(255,255,0,0.08)', border: '1px solid rgba(255,255,0,0.2)',
                color: '#ffff00', cursor: 'pointer',
              }}
            >
              Manage Subscription
            </motion.button>
          </div>
        </section>

        {/* Spacer for sticky save bar */}
        <div style={{ height: 70 }} />
      </div>

      {/* Sticky save bar — always visible at bottom */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        padding: '12px 20px',
        background: 'linear-gradient(to top, #0b0b14 60%, transparent)',
        display: 'flex', justifyContent: 'center',
      }}>
        <motion.button
          onClick={handleSave}
          disabled={saving}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          style={{
            width: '100%', maxWidth: 600, padding: '14px 0', borderRadius: 10,
            background: saving ? '#333340' : '#ffff00', border: 'none',
            color: saving ? '#555570' : '#0b0b14',
            fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 -4px 20px rgba(0,0,0,0.5)',
          }}
        >
          <Save size={14} />
          {saving ? 'Saving...' : 'Save Changes'}
        </motion.button>
      </div>
    </div>
  )
}
