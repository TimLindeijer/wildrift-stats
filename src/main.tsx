import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import App from './App.tsx'
import './index.css'

// Layout restores scroll positions itself (useRouteFocusAndScroll); the browser's own
// restoration would jump before the previous page has rendered.
history.scrollRestoration = 'manual'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* No transitions: they would drop keystrokes in the URL-backed search fields. */}
    <HashRouter useTransitions={false}>
      <App />
    </HashRouter>
  </StrictMode>,
)
