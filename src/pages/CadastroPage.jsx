import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Webcam from 'react-webcam'
import { useForm } from 'react-hook-form'
import { supabase } from '../lib/supabase'
import { buscarCep, formatCpf, formatPhone, formatCep } from '../lib/utils'
import styles from './CadastroPage.module.css'

const STEPS = ['Dados pessoais', 'Endereço', 'Foto']

export default function CadastroPage() {
  const [step, setStep] = useState(0)
  const [photo, setPhoto] = useState(null)
  const [cepLoading, setCepLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [error, setError] = useState(null)
  const webcamRef = useRef(null)
  const navigate = useNavigate()

  const { register, handleSubmit, setValue, watch, trigger, formState: { errors } } = useForm({
    mode: 'onBlur'
  })

  const handleCepBlur = async (e) => {
    const raw = e.target.value.replace(/\D/g, '')
    if (raw.length !== 8) return
    setCepLoading(true)
    const data = await buscarCep(raw)
    if (data) {
      setValue('logradouro', data.logradouro)
      setValue('bairro', data.bairro)
      setValue('cidade', data.cidade)
      setValue('uf', data.uf)
    }
    setCepLoading(false)
  }

  const capturePhoto = useCallback(() => {
    const img = webcamRef.current?.getScreenshot()
    if (img) {
      setPhoto(img)
      setCameraActive(false)
    }
  }, [webcamRef])

  const nextStep = async () => {
    const fields = step === 0
      ? ['nome', 'cpf', 'telefone', 'email']
      : ['cep', 'logradouro', 'bairro', 'cidade', 'uf']
    const ok = await trigger(fields)
    if (ok) setStep(s => s + 1)
  }

  const onSubmit = async (data) => {
    if (!photo) { setError('Tire uma foto para continuar.'); return }
    setSubmitting(true)
    setError(null)

    try {
      // Convert base64 to blob
      const base64 = photo.split(',')[1]
      const byteArr = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const blob = new Blob([byteArr], { type: 'image/jpeg' })
      const fileName = `${data.cpf.replace(/\D/g, '')}_${Date.now()}.jpg`

      // Upload foto
      const { error: uploadError } = await supabase.storage
        .from('fotos-freelancers')
        .upload(fileName, blob)
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('fotos-freelancers')
        .getPublicUrl(fileName)

      // Salva freelancer
      const { error: dbError } = await supabase.from('freelancers').insert({
        nome: data.nome,
        cpf: data.cpf.replace(/\D/g, ''),
        telefone: data.telefone.replace(/\D/g, ''),
        email: data.email,
        cep: data.cep.replace(/\D/g, ''),
        logradouro: data.logradouro,
        numero: data.numero,
        complemento: data.complemento,
        bairro: data.bairro,
        cidade: data.cidade,
        uf: data.uf,
        foto_url: urlData.publicUrl,
        status: 'ativo',
      })
      if (dbError) throw dbError

      navigate('/sucesso')
    } catch (err) {
      setError('Erro ao salvar. Tente novamente.')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.wrapper}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoDot} />
          <span>Grupo Alvim</span>
        </div>
        <p className={styles.subtitle}>Cadastro de Freelancer</p>
      </header>

      {/* Steps indicator */}
      <div className={styles.steps}>
        {STEPS.map((label, i) => (
          <div key={i} className={`${styles.step} ${i === step ? styles.stepActive : ''} ${i < step ? styles.stepDone : ''}`}>
            <div className={styles.stepDot}>
              {i < step ? <CheckIcon /> : <span>{i + 1}</span>}
            </div>
            <span className={styles.stepLabel}>{label}</span>
            {i < STEPS.length - 1 && <div className={styles.stepLine} />}
          </div>
        ))}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>

        {/* STEP 0: Dados pessoais */}
        {step === 0 && (
          <div className={styles.fields}>
            <h2 className={styles.stepTitle}>Seus dados</h2>
            <p className={styles.stepDesc}>Preencha com seus dados pessoais.</p>

            <Field label="Nome completo" error={errors.nome?.message}>
              <input
                className={`${styles.input} ${errors.nome ? styles.inputError : ''}`}
                placeholder="Ex: João da Silva"
                {...register('nome', { required: 'Nome é obrigatório' })}
              />
            </Field>

            <Field label="CPF" error={errors.cpf?.message}>
              <input
                className={`${styles.input} ${errors.cpf ? styles.inputError : ''}`}
                placeholder="000.000.000-00"
                maxLength={14}
                {...register('cpf', {
                  required: 'CPF é obrigatório',
                  pattern: { value: /^\d{3}\.\d{3}\.\d{3}-\d{2}$/, message: 'CPF inválido' }
                })}
                onChange={e => setValue('cpf', formatCpf(e.target.value))}
              />
            </Field>

            <Field label="Telefone / WhatsApp" error={errors.telefone?.message}>
              <input
                className={`${styles.input} ${errors.telefone ? styles.inputError : ''}`}
                placeholder="(11) 99999-9999"
                maxLength={15}
                {...register('telefone', { required: 'Telefone é obrigatório' })}
                onChange={e => setValue('telefone', formatPhone(e.target.value))}
              />
            </Field>

            <Field label="E-mail" error={errors.email?.message}>
              <input
                type="email"
                className={`${styles.input} ${errors.email ? styles.inputError : ''}`}
                placeholder="seu@email.com"
                {...register('email', {
                  required: 'E-mail é obrigatório',
                  pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'E-mail inválido' }
                })}
              />
            </Field>

            <button type="button" className={styles.btnPrimary} onClick={nextStep}>
              Continuar →
            </button>
          </div>
        )}

        {/* STEP 1: Endereço */}
        {step === 1 && (
          <div className={styles.fields}>
            <h2 className={styles.stepTitle}>Endereço</h2>
            <p className={styles.stepDesc}>Digite o CEP e os campos serão preenchidos automaticamente.</p>

            <Field label="CEP" error={errors.cep?.message}>
              <div className={styles.inputRow}>
                <input
                  className={`${styles.input} ${errors.cep ? styles.inputError : ''}`}
                  placeholder="00000-000"
                  maxLength={9}
                  {...register('cep', { required: 'CEP é obrigatório' })}
                  onChange={e => setValue('cep', formatCep(e.target.value))}
                  onBlur={handleCepBlur}
                />
                {cepLoading && <span className={styles.cepLoader} />}
              </div>
            </Field>

            <Field label="Logradouro" error={errors.logradouro?.message}>
              <input
                className={`${styles.input} ${errors.logradouro ? styles.inputError : ''}`}
                placeholder="Rua, Avenida..."
                {...register('logradouro', { required: 'Logradouro é obrigatório' })}
              />
            </Field>

            <div className={styles.row2}>
              <Field label="Número" error={errors.numero?.message}>
                <input
                  className={styles.input}
                  placeholder="123"
                  {...register('numero')}
                />
              </Field>
              <Field label="Complemento">
                <input
                  className={styles.input}
                  placeholder="Apto, Bloco..."
                  {...register('complemento')}
                />
              </Field>
            </div>

            <Field label="Bairro" error={errors.bairro?.message}>
              <input
                className={`${styles.input} ${errors.bairro ? styles.inputError : ''}`}
                placeholder="Bairro"
                {...register('bairro', { required: 'Bairro é obrigatório' })}
              />
            </Field>

            <div className={styles.row2}>
              <Field label="Cidade" error={errors.cidade?.message}>
                <input
                  className={`${styles.input} ${errors.cidade ? styles.inputError : ''}`}
                  placeholder="Cidade"
                  {...register('cidade', { required: 'Cidade é obrigatória' })}
                />
              </Field>
              <Field label="UF" error={errors.uf?.message}>
                <input
                  className={`${styles.input} ${errors.uf ? styles.inputError : ''}`}
                  placeholder="SP"
                  maxLength={2}
                  {...register('uf', { required: 'UF é obrigatória' })}
                  style={{ textTransform: 'uppercase' }}
                />
              </Field>
            </div>

            <div className={styles.rowBtns}>
              <button type="button" className={styles.btnSecondary} onClick={() => setStep(0)}>
                ← Voltar
              </button>
              <button type="button" className={styles.btnPrimary} onClick={nextStep}>
                Continuar →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Foto */}
        {step === 2 && (
          <div className={styles.fields}>
            <h2 className={styles.stepTitle}>Foto de identificação</h2>
            <p className={styles.stepDesc}>
              Tire uma foto clara do seu rosto. Ela será usada para confirmar sua presença nas unidades.
            </p>

            <div className={styles.photoArea}>
              {photo ? (
                <div className={styles.photoPreview}>
                  <img src={photo} alt="Sua foto" className={styles.photoImg} />
                  <button
                    type="button"
                    className={styles.btnRetake}
                    onClick={() => { setPhoto(null); setCameraActive(true) }}
                  >
                    Tirar novamente
                  </button>
                </div>
              ) : cameraActive ? (
                <div className={styles.cameraBox}>
                  <Webcam
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    videoConstraints={{ facingMode: 'user', width: 400, height: 400 }}
                    className={styles.webcam}
                  />
                  <div className={styles.faceguide} />
                  <button type="button" className={styles.btnCapture} onClick={capturePhoto}>
                    <CameraIcon /> Capturar
                  </button>
                </div>
              ) : (
                <div className={styles.photoPlaceholder}>
                  <div className={styles.photoIcon}><PersonIcon /></div>
                  <p>Posicione seu rosto na câmera com boa iluminação</p>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => setCameraActive(true)}
                  >
                    <CameraIcon /> Abrir câmera
                  </button>
                </div>
              )}
            </div>

            {error && <p className={styles.errorMsg}>{error}</p>}

            <div className={styles.rowBtns}>
              <button type="button" className={styles.btnSecondary} onClick={() => setStep(1)}>
                ← Voltar
              </button>
              <button
                type="submit"
                className={`${styles.btnPrimary} ${styles.btnSubmit}`}
                disabled={submitting || !photo}
              >
                {submitting ? <span className={styles.spinner} /> : 'Finalizar cadastro ✓'}
              </button>
            </div>
          </div>
        )}
      </form>

      <footer className={styles.footer}>
        <p>Grupo Alvim · Burger King · Dados protegidos pela LGPD</p>
      </footer>
    </div>
  )
}

function Field({ label, error, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-dim)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
      {error && <span style={{ fontSize: '12px', color: 'var(--error)' }}>{error}</span>}
    </div>
  )
}

function CheckIcon() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

function CameraIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
}

function PersonIcon() {
  return <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
}
