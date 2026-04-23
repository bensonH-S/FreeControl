import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import styles from './GestorHome.module.css'

export default function GestorHome() {
  const [freelancers, setFreelancers] = useState([])
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [unidade, setUnidade] = useState(() => localStorage.getItem('unidade') || '')
  const [showUnidade, setShowUnidade] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!unidade) { setShowUnidade(true); setLoading(false); return }
    fetchData()
  }, [unidade])

  const fetchData = async () => {
    setLoading(true)
    const [{ data: fList }, { data: rList }] = await Promise.all([
      supabase.from('freelancers').select('*').eq('status', 'ativo').order('nome'),
      supabase.from('registros').select('*').eq('unidade', unidade).gte('created_at', new Date().toISOString().split('T')[0])
    ])
    setFreelancers(fList || [])
    setRegistros(rList || [])
    setLoading(false)
  }

  const getStatus = (freelancerId) => {
    const regs = registros
      .filter(r => r.freelancer_id === freelancerId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    if (!regs.length) return 'ausente'
    return regs[0].tipo === 'entrada' ? 'presente' : 'saiu'
  }

  const getEntrada = (freelancerId) => {
    const entrada = registros.find(r => r.freelancer_id === freelancerId && r.tipo === 'entrada')
    if (!entrada) return null
    return new Date(entrada.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  const handleSalvarUnidade = (e) => {
    e.preventDefault()
    const val = e.target.unidade.value.trim()
    if (!val) return
    localStorage.setItem('unidade', val)
    setUnidade(val)
    setShowUnidade(false)
    fetchData()
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/gestor/login')
  }

  const filtered = freelancers.filter(f =>
    f.nome.toLowerCase().includes(search.toLowerCase()) ||
    f.cpf.includes(search.replace(/\D/g, ''))
  )

  if (showUnidade) return (
    <div className={styles.wrapper}>
      <div className={styles.unidadeCard}>
        <div className={styles.brand}><span className={styles.dot} />Grupo Alvim</div>
        <h2 className={styles.unidadeTitulo}>Qual é a sua unidade?</h2>
        <form onSubmit={handleSalvarUnidade} className={styles.unidadeForm}>
          <input name="unidade" className={styles.input} placeholder="Ex: Imperador, King, Centro..." autoFocus />
          <button type="submit" className={styles.btn}>Confirmar →</button>
        </form>
      </div>
    </div>
  )

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.brand}><span className={styles.dot} />Grupo Alvim</div>
          <div className={styles.unidadeBadge} onClick={() => setShowUnidade(true)}>
            {unidade} <span className={styles.editIcon}>✎</span>
          </div>
        </div>
        <button className={styles.logoutBtn} onClick={handleLogout}>Sair</button>
      </header>

      <div className={styles.content}>
        <div className={styles.topRow}>
          <h1 className={styles.title}>Freelancers</h1>
          <button className={styles.refreshBtn} onClick={fetchData}>↻</button>
        </div>

        <input
          className={styles.search}
          placeholder="Buscar por nome ou CPF..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Stats */}
        <div className={styles.stats}>
          <Stat label="Presentes hoje" value={registros.filter(r => r.tipo === 'entrada').length} color="success" />
          <Stat label="Cadastrados" value={freelancers.length} color="default" />
        </div>

        {loading ? (
          <div className={styles.loading}>Carregando...</div>
        ) : (
          <div className={styles.list}>
            {filtered.length === 0 && (
              <div className={styles.empty}>Nenhum freelancer encontrado.</div>
            )}
            {filtered.map(f => {
              const status = getStatus(f.id)
              const entrada = getEntrada(f.id)
              return (
                <div key={f.id} className={styles.card}>
                  <div className={styles.cardLeft}>
                    <div className={styles.avatar}>
                      {f.foto_url
                        ? <img src={f.foto_url} alt={f.nome} className={styles.avatarImg} />
                        : <span>{f.nome[0]}</span>
                      }
                      <span className={`${styles.statusDot} ${styles[status]}`} />
                    </div>
                    <div className={styles.info}>
                      <span className={styles.nome}>{f.nome}</span>
                      <span className={styles.meta}>
                        {status === 'presente' && entrada ? `Entrou às ${entrada}` : status === 'saiu' ? 'Finalizado hoje' : 'Não registrado hoje'}
                      </span>
                    </div>
                  </div>
                  <div className={styles.cardActions}>
                    {status === 'ausente' && (
                      <button
                        className={`${styles.actionBtn} ${styles.entradaBtn}`}
                        onClick={() => navigate(`/gestor/checkin/${f.id}?tipo=entrada&unidade=${unidade}`)}
                      >
                        Check-in
                      </button>
                    )}
                    {status === 'presente' && (
                      <button
                        className={`${styles.actionBtn} ${styles.saidaBtn}`}
                        onClick={() => navigate(`/gestor/checkin/${f.id}?tipo=saida&unidade=${unidade}`)}
                      >
                        Check-out
                      </button>
                    )}
                    {status === 'saiu' && (
                      <span className={styles.concluidoTag}>✓ Concluído</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div className={styles.stat}>
      <span className={`${styles.statValue} ${color === 'success' ? styles.statGreen : ''}`}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  )
}
