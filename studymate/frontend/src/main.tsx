import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { SessionBootstrap } from '@/components/SessionBootstrap'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionBootstrap />
  </StrictMode>,
)
