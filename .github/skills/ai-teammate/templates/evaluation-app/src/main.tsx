import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { CODEAPPS_DOCUMENT_TITLE } from '@/config'

document.title = CODEAPPS_DOCUMENT_TITLE

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
