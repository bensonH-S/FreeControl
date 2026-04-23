import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ReconhecimentoModal from '../components/ReconhecimentoModal'
import styles from './RelogioPage.module.css'

export default function RelogioPage() {
  const [now, setNow] = useState(new Date())
  const [filial, setFilial] = useState(null)
  const [erroVinculo, setErroVinculo] = useState(false)
  const [showReconhecimento, setShowReconhecimento] = useState(false)
  const [ultimoRegistro, setUltimoRegistro] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    carregarFilial()
  }, [])

  const carregarFilial = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/gestor/login'); return }

    const { data, error } = await supabase
      .from('gestor_unidades')
      .select('unidade')
      .eq('gestor_id', user.id)
      .eq('ativo', true)
      .single()

    if (error || !data) {
      setErroVinculo(true)
      return
    }

    setFilial(data.unidade)
  }

  const handleRegistroSucesso = (registro) => {
    setUltimoRegistro(registro)
    setShowReconhecimento(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/gestor/login')
  }

  const diaSemana = now.toLocaleDateString('pt-BR', { weekday: 'long' })
  const diaSemanaCapital = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1)
  const dataFormatada = now.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
  const horaFormatada = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  if (erroVinculo) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.filialPicker}>
          <div className={styles.brand}><span className={styles.dot} />Grupo Alvim</div>
          <h2 className={styles.filialTitulo}>Sem unidade vinculada</h2>
          <p style={{ color: 'var(--text-muted, #888)', textAlign: 'center', fontSize: 14, marginBottom: 20 }}>
            Seu usuário não está vinculado a nenhuma unidade. Entre em contato com o administrador.
          </p>
          <button className={styles.filialBtn} onClick={handleLogout}>Sair</button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.filialBadge}>
          <span className={styles.gpsDot} />
          <span>{filial ?? '...'}</span>
        </div>
        <button className={styles.logoutBtn} onClick={handleLogout}>Sair</button>
      </div>

      {/* Clock */}
      <div className={styles.clockArea}>
        <div className={styles.brand}>
          <span className={styles.dot} />
          <span>Alvim Participações</span>
        </div>

        <div className={styles.diaSemana}>{diaSemanaCapital}</div>
        <div className={styles.hora}>{horaFormatada}</div>
        <div className={styles.data}>{dataFormatada}</div>

        {ultimoRegistro && (
          <div className={styles.ultimoRegistro}>
            Último: <strong>{ultimoRegistro.nome}</strong> — {ultimoRegistro.hora}
          </div>
        )}
      </div>

      {/* Register button */}
      <div className={styles.footer}>
        <button
          className={styles.btnRegistrar}
          onClick={() => setShowReconhecimento(true)}
        >
          <FaceIcon />
          Registrar Presença
        </button>
      </div>

      {/* Reconhecimento modal */}
      {showReconhecimento && (
        <ReconhecimentoModal
          filial={filial}
          onSuccess={handleRegistroSucesso}
          onClose={() => setShowReconhecimento(false)}
        />
      )}
    </div>
  )
}

function FaceIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="5"/>
      <path d="M9 10.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5"/>
      <circle cx="9.5" cy="8.5" r=".5" fill="currentColor"/>
      <circle cx="14.5" cy="8.5" r=".5" fill="currentColor"/>
      <path d="M20 21a8 8 0 1 0-16 0"/>
    </svg>
  )
}
