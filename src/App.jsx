import { BrowserRouter, Routes, Route } from 'react-router-dom'
import CadastroPage from './pages/CadastroPage'
import SuccessPage from './pages/SuccessPage'
import './index.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CadastroPage />} />
        <Route path="/cadastro" element={<CadastroPage />} />
        <Route path="/sucesso" element={<SuccessPage />} />
      </Routes>
    </BrowserRouter>
  )
}
