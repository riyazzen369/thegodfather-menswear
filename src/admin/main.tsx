import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../fonts.css'
import './admin.css'
import Admin from './Admin'
createRoot(document.getElementById('admin')!).render(<StrictMode><Admin /></StrictMode>)
