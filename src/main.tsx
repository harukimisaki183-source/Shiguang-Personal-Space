import { createRoot } from 'react-dom/client'
import App from './App'
import { loadSettings } from './storage'
import './styles.css'

document.documentElement.dataset.theme = loadSettings().theme

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 挂载节点')

createRoot(container).render(<App />)
