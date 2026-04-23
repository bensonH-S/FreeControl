import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { loadModels, getDescriptorFromUrl, getDescriptorFromVideo, compareFaces, CONFIDENCE_THRESHOLD } from '../lib/faceRecognition'
import styles from './ReconhecimentoModal.module.css'

const FASE = {
  CARREGANDO: 'carregando',
  ESCANEANDO: 'escaneando',
  IDENTIFICADO: 'identificado',
  NAO_ENCONTRADO: 'nao_encontrado',
  SALVANDO: 'salvando',
  ERRO: 'erro',
}

export default function ReconhecimentoModal({ filial, onSuccess, onClose }) {
  const [fase, setFase] = useState(FASE.CARREGANDO)
  const [freelancerIdentificado, setFreelancerIdentificado] = useState(null)
  const [confidence, setConfidence] = useState(0)
  const [capturedPhoto, setCapturedPhoto] = useState(null)
  const [msgErro, setMsgErro] = useState('')
  const [countDown, setCountDown] = useState(null)

  const webcamRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const scanInterval = useRef(null)
  const descriptorsRef = useRef([]) // [{id, nome, cpf, foto_url, descriptor}]

  useEffect(() => {
    init()
    return () => cleanup()
  }, [])

  const cleanup = () => {
    clearInterval(scanInterval.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
  }

  const init = async () => {
    setFase(FASE.CARREGANDO)
    try {
      // 1. Carrega modelos
      await loadModels()

      // 2. Busca todos freelancers ativos com foto
      const { data: freelancers, error } = await supabase
        .from('freelancers')
        .select('id, nome, cpf, telefone, foto_url')
        .eq('status', 'ativo')
        .not('foto_url', 'is', null)

      if (error) throw error
      if (!freelancers?.length) throw new Error('Nenhum freelancer cadastrado com foto.')

      // 3. Gera descritores de todos os freelancers em paralelo
      const withDescriptors = await Promise.all(
        freelancers.map(async (f) => {
          try {
            const descriptor = await getDescriptorFromUrl(f.foto_url)
            return descriptor ? { ...f, descriptor } : null
          } catch { return null }
        })
      )

      descriptorsRef.current = withDescriptors.filter(Boolean)

      if (!descriptorsRef.current.length) {
        throw new Error('Não foi possível processar as fotos cadastradas.')
      }

      // 4. Abre câmera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setFase(FASE.ESCANEANDO)
      startScan()

    } catch (err) {
      setMsgErro(err.message || 'Erro ao inicializar.')
      setFase(FASE.ERRO)
    }
  }

  const startScan = useCallback(() => {
    scanInterval.current = setInterval(async () => {
      const video = videoRef.current
      if (!video || video.readyState < 2) return

      const liveDescriptor = await getDescriptorFromVideo(video)
      if (!liveDescriptor) return

      // Compara com todos os freelancers
      let melhorMatch = null
      let melhorScore = 0

      for (const f of descriptorsRef.current) {
        const score = compareFaces(f.descriptor, liveDescriptor)
        if (score > melhorScore) {
          melhorScore = score
          melhorMatch = f
        }
      }

      setConfidence(melhorScore)

      if (melhorScore >= CONFIDENCE_THRESHOLD && melhorMatch) {
        clearInterval(scanInterval.current)

        // Captura foto do momento
        const canvas = document.createElement('canvas')
        canvas.width = videoRef.current.videoWidth
        canvas.height = videoRef.current.videoHeight
        canvas.getContext('2d').drawImage(videoRef.current, 0, 0)
        const photo = canvas.toDataURL('image/jpeg', 0.85)
        setCapturedPhoto(photo)

        setFreelancerIdentificado({ ...melhorMatch, score: melhorScore })
        setFase(FASE.IDENTIFICADO)

        // Auto-confirma em 3 segundos
        let t = 3
        setCountDown(t)
        const cd = setInterval(() => {
          t--
          setCountDown(t)
          if (t <= 0) {
            clearInterval(cd)
            confirmarRegistro({ ...melhorMatch, score: melhorScore }, photo)
          }
        }, 1000)
      }
    }, 600)
  }, [])

  const confirmarRegistro = async (freelancer, photo) => {
    setFase(FASE.SALVANDO)
    try {
      let latitude = null, longitude = null
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000 })
        )
        latitude = pos.coords.latitude
        longitude = pos.coords.longitude
      } catch {}

      // Upload foto do momento
      let fotoUrl = null
      if (photo) {
        const base64 = photo.split(',')[1]
        const byteArr = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
        const blob = new Blob([byteArr], { type: 'image/jpeg' })
        const fileName = `presenca_${freelancer.id}_${Date.now()}.jpg`
        const { error: upErr } = await supabase.storage
          .from('fotos-freelancers').upload(fileName, blob)
        if (!upErr) {
          const { data: urlData } = supabase.storage
            .from('fotos-freelancers').getPublicUrl(fileName)
          fotoUrl = urlData.publicUrl
        }
      }

      // Verifica se já tem entrada hoje sem saída (para decidir tipo)
      const hoje = new Date().toISOString().split('T')[0]
      const { data: registrosHoje } = await supabase
        .from('registros')
        .select('*')
        .eq('freelancer_id', freelancer.id)
        .eq('unidade', filial)
        .gte('created_at', hoje)
        .order('created_at', { ascending: false })
        .limit(1)

      const ultimoTipo = registrosHoje?.[0]?.tipo
      const tipo = (!ultimoTipo || ultimoTipo === 'saida') ? 'entrada' : 'saida'

      const { error: dbErr } = await supabase.from('registros').insert({
        freelancer_id: freelancer.id,
        unidade: filial,
        tipo,
        foto_momento: fotoUrl,
        latitude,
        longitude,
        confianca_facial: freelancer.score,
      })

      if (dbErr) throw dbErr

      cleanup()
      const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      onSuccess({ nome: freelancer.nome, hora, tipo })

    } catch (err) {
      setMsgErro('Erro ao salvar. Tente novamente.')
      setFase(FASE.ERRO)
    }
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>

        {/* Câmera sempre visível ao escanear */}
        {(fase === FASE.ESCANEANDO || fase === FASE.CARREGANDO) && (
          <div className={styles.cameraWrap}>
            <video
              ref={videoRef}
              className={styles.video}
              autoPlay
              playsInline
              muted
            />
            <div className={`${styles.guia} ${fase === FASE.ESCANEANDO ? styles.guiaAtivo : ''}`} />
            {fase === FASE.ESCANEANDO && (
              <div className={styles.barraConfianca}>
                <div className={styles.barraFill} style={{ width: `${confidence * 100}%` }} />
              </div>
            )}
            {fase === FASE.CARREGANDO && (
              <div className={styles.loadingOverlay}>
                <span className={styles.spinner} />
                <p>Carregando reconhecimento facial...</p>
              </div>
            )}
            <button className={styles.fecharCamera} onClick={onClose}>✕</button>
          </div>
        )}

        {/* Identificado */}
        {fase === FASE.IDENTIFICADO && freelancerIdentificado && (
          <div className={styles.identificadoCard}>
            <div className={styles.fotoWrap}>
              <img
                src={freelancerIdentificado.foto_url}
                alt={freelancerIdentificado.nome}
                className={styles.fotoFreelancer}
              />
              <div className={styles.checkBadge}><CheckIcon /></div>
            </div>
            <p className={styles.registradoLabel}>PRESENÇA REGISTRADA</p>
            <h2 className={styles.nomeIdentificado}>{freelancerIdentificado.nome}</h2>
            <p className={styles.filialIdentificada}>{filial}</p>
            <p className={styles.horaIdentificada}>
              {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
            <p className={styles.dataIdentificada}>
              {new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            {countDown !== null && countDown > 0 && (
              <p className={styles.autoFechar}>Fechando em {countDown}s...</p>
            )}
          </div>
        )}

        {/* Salvando */}
        {fase === FASE.SALVANDO && (
          <div className={styles.centerBox}>
            <span className={styles.spinner} />
            <p>Salvando registro...</p>
          </div>
        )}

        {/* Não encontrado */}
        {fase === FASE.NAO_ENCONTRADO && (
          <div className={styles.centerBox}>
            <div className={styles.erroBadge}>?</div>
            <p className={styles.erroTitulo}>Freelancer não identificado</p>
            <p className={styles.erroDesc}>Rosto não encontrado na base de dados.</p>
            <button className={styles.btnTentar} onClick={init}>Tentar novamente</button>
            <button className={styles.btnFechar} onClick={onClose}>Fechar</button>
          </div>
        )}

        {/* Erro */}
        {fase === FASE.ERRO && (
          <div className={styles.centerBox}>
            <div className={styles.erroBadge}>!</div>
            <p className={styles.erroTitulo}>Erro</p>
            <p className={styles.erroDesc}>{msgErro}</p>
            <button className={styles.btnTentar} onClick={init}>Tentar novamente</button>
            <button className={styles.btnFechar} onClick={onClose}>Fechar</button>
          </div>
        )}

      </div>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 10l5 5 7-7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
