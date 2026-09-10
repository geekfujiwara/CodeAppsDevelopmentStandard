import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { CODEAPPS_DOCUMENT_TITLE } from '@/config'
import { initializeTelemetry } from '@/lib/telemetry'

document.title = CODEAPPS_DOCUMENT_TITLE
if (import.meta.env.VITE_FEATURE_LIVE === "true") void initializeTelemetry().catch(() => undefined)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
