import { useNavigate } from 'react-router-dom'
import styles from './SuccessPage.module.css'

export default function SuccessPage() {
  const navigate = useNavigate()

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.iconWrap}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="20" fill="rgba(71,255,138,0.1)" />
            <path d="M12 20l6 6 10-10" stroke="#47ff8a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <h1 className={styles.title}>Cadastro realizado!</h1>
        <p className={styles.desc}>
          Seus dados foram registrados com sucesso.<br />
          Quando for trabalhar, o gestor fará sua identificação pelo aplicativo da unidade.
        </p>

        <div className={styles.info}>
          <InfoRow icon="📋" text="Guarde este número de confirmação" />
          <InfoRow icon="📸" text="Sua foto foi salva para reconhecimento" />
          <InfoRow icon="💰" text="O pagamento é liberado automaticamente após a saída" />
        </div>

        <p className={styles.footer}>Grupo Alvim · Burger King</p>
      </div>
    </div>
  )
}

function InfoRow({ icon, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: 'var(--text-dim)' }}>
      <span style={{ fontSize: '16px' }}>{icon}</span>
      <span>{text}</span>
    </div>
  )
}
