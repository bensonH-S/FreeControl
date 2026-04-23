import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import CadastroPage from './pages/CadastroPage'
import SuccessPage from './pages/SuccessPage'
import LoginPage from './pages/LoginPage'
import RelogioPage from './pages/RelogioPage'
import { useAuth } from './hooks/useAuth'
import './index.css'

function PrivateRoute({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--text-muted)',fontFamily:'var(--font-body)'}}>Carregando...</div>
  return session ? children : <Navigate to="/gestor/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/cadastro" element={<CadastroPage />} />
        <Route path="/sucesso" element={<SuccessPage />} />
        <Route path="/gestor/login" element={<LoginPage />} />
        <Route path="/gestor" element={<PrivateRoute><RelogioPage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/cadastro" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
