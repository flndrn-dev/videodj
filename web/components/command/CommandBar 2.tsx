'use client'
import { useState, KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Terminal, Send } from 'lucide-react'

const CHIPS = [
  { label:'play dutch music', e:'🇧🇪' },
  { label:'build auto mix', e:'🎵' },
  { label:'clear filter', e:'✖' },
  { label:'scan library', e:'📁' },
]

export function CommandBar({ onCommand }: { onCommand: (t: string) => void }) {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const [lastCmd, setLastCmd] = useState('')

  const submit = () => {
    if (!input.trim()) return
    onCommand(input.trim()); setLastCmd(input.trim())
    setHistory(h => [input.trim(),...h].slice(0,30)); setInput(''); setHistIdx(-1)
  }
  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key==='Enter') submit()
    if (e.key==='ArrowUp') { const i=Math.min(histIdx+1,history.length-1); setHistIdx(i); setInput(history[i]||'') }
    if (e.key==='ArrowDown') { const i=Math.max(histIdx-1,-1); setHistIdx(i); setInput(i===-1?'':history[i]) }
  }

  return (
    <motion.div initial={{ y:50, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ delay:0.4, type:'spring', stiffness:200, damping:25 }}
      style={{ borderTop:'1px solid #2a2a3a', background:'#0d0d16', padding:'10px 20px', flexShrink:0 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <Terminal size={14} color="#6666aa" style={{ flexShrink:0 }}/>
        <input type="text" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
          placeholder="Type a command... e.g. 'play dutch music' or 'build auto mix'"
          style={{ flex:1, background:'#1a1a2a', border:'1px solid #2a2a3a', borderRadius:10, padding:'8px 14px', color:'white', fontFamily:'monospace', fontSize:13, outline:'none' }}/>
        <motion.button onClick={submit} whileHover={{ scale:1.05 }} whileTap={{ scale:0.95 }}
          style={{ padding:'8px 12px', borderRadius:10, background:'rgba(69,177,232,0.12)', border:'1px solid rgba(69,177,232,0.35)', color:'#45b1e8', cursor:'pointer' }}>
          <Send size={15}/>
        </motion.button>
      </div>
      <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap', alignItems:'center' }}>
        {CHIPS.map(c => (
          <motion.button key={c.label} onClick={() => { setInput(c.label); onCommand(c.label) }}
            whileHover={{ scale:1.05 }} whileTap={{ scale:0.95 }}
            style={{ fontSize:11, padding:'3px 10px', borderRadius:999, background:'#1a1a2a', border:'1px solid #2a2a3a', color:'#6666aa', cursor:'pointer', fontFamily:'monospace', whiteSpace:'nowrap' }}>
            {c.e} {c.label}
          </motion.button>
        ))}
        <AnimatePresence>
          {lastCmd && (
            <motion.span key={lastCmd} initial={{ opacity:0,x:10 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0 }}
              style={{ marginLeft:'auto', fontSize:11, color:'#00ff88', fontFamily:'monospace' }}>✓ {lastCmd}</motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
