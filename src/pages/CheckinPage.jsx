import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import Webcam from 'react-webcam'
import { supabase } from '../lib/supabase'
import { loadModels, getDescriptorFromUrl, getDescriptorFromVideo, compareFaces, CONFIDENCE_THRESHOLD } from '../lib/faceRecognition'
import styles from './CheckinPage.module.css'

const STATUS = {
  LOADING: 'loading',
  READY: 'ready',
  SCANNING: 'scanning',
  SUCCESS: 'success',
  FAIL: 'fail',
  SAVING: 'saving',
}

export default function CheckinPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const tipo = searchParams.get('tipo') || 'entrada'
  const unidade = searchParams.get('unidade') || ''
  const navigate = useNavigate()

  const [freelancer, setFreelancer] = useState(null)
  const [status, setStatus] = useState(STATUS.LOADING)
  const [confidence, setConfidence] = useState(0)
  const [error, setError] = useState(null)
  const [capturedPhoto, setCapturedPhoto] = useState(null)
  const webcamRef = useRef(null)
  const scanInterval = useRef(null)
  const referenceDescriptor = useRef(null)

  useEffect(() => {
    init()
    return () => clearInterval(scanInterval.current)
  }, [id])

  const init = async () => {
    setStatus(STATUS.LOADING)
    try {
      // Fetch freelancer
      const { data, error } = await supabase.from('freelancers').select('*').eq('id', id).single()
      if (error || !data) throw new Error('Freelancer não encontrado')
      setFreelancer(data)

      // Load face-api models
      await loadModels()

      // Get reference descriptor from cadastro photo
      if (data.foto_url) {
        const desc = await getDescriptorFromUrl(data.foto_url)
        if (!desc) throw new Error('Não foi possível processar a foto do cadastro')
        referenceDescriptor.current = desc
      }

      setStatus(STATUS.READY)
    } catch (err) {
      setError(err.message)
      setStatus(STATUS.FAIL)
    }
  }

  const startScan = useCallback(() => {
    setStatus(STATUS.SCANNING)
    setConfidence(0)

    scanInterval.current = setInterval(async () => {
      const video = webcamRef.current?.video
      if (!video || video.readyState !== 4) return

      const liveDescriptor = await getDescriptorFromVideo(video)
      if (!liveDescriptor) return

      const score = compareFaces(referenceDescriptor.current, liveDescriptor)
      setConfidence(score)

      if (score >= CONFIDENCE_THRESHOLD) {
        clearInterval(scanInterval.current)
        const photo = webcamRef.current?.getScreenshot()
        setCapturedPhoto(photo)
        setStatus(STATUS.SUCCESS)
      }
    }, 800)
  }, [])

  const handleConfirm = async () => {
    setStatus(STATUS.SAVING)
    try {
      // Get geolocation
      let latitude = null, longitude = null
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
        )
        latitude = pos.coords.latitude
        longitude = pos.coords.longitude
      } catch { /* geolocation optional */ }

      // Save photo
      let fotoUrl = null
      if (capturedPhoto) {
        const base64 = capturedPhoto.split(',')[1]
        const byteArr = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
        const blob = new Blob([byteArr], { type: 'image/jpeg' })
        const fileName = `checkin_${id}_${Date.now()}.jpg`
        const { error: uploadErr } = await supabase.storage
          .from('fotos-freelancers')
          .upload(fileName, blob)
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('fotos-freelancers').getPublicUrl(fileName)
          fotoUrl = urlData.publicUrl
        }
      }

      // Save registro
      const { error: dbErr } = await supabase.from('registros').insert({
        freelancer_id: id,
        unidade,
        tipo,
        foto_momento: fotoUrl,
        latitude,
        longitude,
        confianca_facial: confidence,
      })
      if (dbErr) throw dbErr

      navigate('/gestor', { state: { success: true, tipo, nome: freelancer.nome } })
    } catch (err) {
      setError('Erro ao salvar registro. Tente novamente.')
      setStatus(STATUS.SUCCESS)
    }
  }

  const tipoLabel = tipo === 'entrada' ? 'Check-in' : 'Check-out'
  const tipoColor = tipo === 'entrada' ? 'var(--accent)' : '#a78bfa'

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/gestor')}>← Voltar</button>
        <span className={styles.tipoTag} style={{ background: tipo === 'entrada' ? 'rgba(232,255,71,0.1)' : 'rgba(167,139,250,0.1)', color: tipoColor, borderColor: tipoColor }}>
          {tipoLabel}
        </span>
      </header>

      <div className={styles.content}>
        {/* Freelancer info */}
        {freelancer && (
          <div className={styles.freelancerInfo}>
            <div className={styles.avatarWrap}>
              {freelancer.foto_url
                ? <img src={freelancer.foto_url} alt={freelancer.nome} className={styles.refPhoto} />
                : <div className={styles.avatarFallback}>{freelancer.nome[0]}</div>
              }
              <span className={styles.refLabel}>Foto do cadastro</span>
            </div>
            <div>
              <h2 className={styles.nome}>{freelancer.nome}</h2>
              <p className={styles.cpf}>CPF: {freelancer.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</p>
            </div>
          </div>
        )}

        {/* Camera area */}
        <div className={styles.cameraArea}>
          {(status === STATUS.READY || status === STATUS.SCANNING) && (
            <>
              <Webcam
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={{ facingMode: 'user', width: 480, height: 480 }}
                className={styles.webcam}
              />
              <div className={`${styles.faceGuide} ${status === STATUS.SCANNING ? styles.scanning : ''}`} />

              {status === STATUS.SCANNING && (
                <div className={styles.confidenceBar}>
                  <div className={styles.confidenceFill} style={{ width: `${confidence * 100}%` }} />
                </div>
              )}
            </>
          )}

          {status === STATUS.SUCCESS && capturedPhoto && (
            <div className={styles.successOverlay}>
              <img src={capturedPhoto} alt="Captura" className={styles.webcam} />
              <div className={styles.successBadge}>
                <CheckIcon />
                <span>Rosto confirmado — {Math.round(confidence * 100)}%</span>
              </div>
            </div>
          )}

          {status === STATUS.LOADING && (
            <div className={styles.loadingBox}>
              <span className={styles.spinner} />
              <p>Carregando reconhecimento facial...</p>
            </div>
          )}

          {status === STATUS.FAIL && (
            <div className={styles.loadingBox}>
              <p className={styles.errorText}>{error}</p>
              <button className={styles.retryBtn} onClick={init}>Tentar novamente</button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          {status === STATUS.READY && (
            <button className={styles.btnPrimary} onClick={startScan}>
              <ScanIcon /> Iniciar reconhecimento
            </button>
          )}

          {status === STATUS.SCANNING && (
            <div className={styles.scanningMsg}>
              <span className={styles.pulse} />
              Aponte o celular para o rosto do freelancer...
            </div>
          )}

          {status === STATUS.SUCCESS && (
            <>
              <button
                className={styles.btnPrimary}
                style={{ background: tipo === 'entrada' ? 'var(--accent)' : '#a78bfa' }}
                onClick={handleConfirm}
              >
                ✓ Confirmar {tipoLabel}
              </button>
              <button className={styles.btnSecondary} onClick={() => { setStatus(STATUS.READY); setCapturedPhoto(null); setConfidence(0) }}>
                Escanear novamente
              </button>
            </>
          )}

          {status === STATUS.SAVING && (
            <div className={styles.scanningMsg}>
              <span className={styles.spinnerSm} />
              Salvando registro...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CheckIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

function ScanIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/></svg>
}
