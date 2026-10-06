import { lazy } from 'react'
import { Route, Routes } from 'react-router'
import { Layout } from './components/Layout.tsx'
import { TierListPage } from './pages/TierListPage.tsx'

// The tier list is the landing page and ships in the main bundle; the rest load on demand.
const ChampionPage = lazy(() => import('./pages/ChampionPage.tsx'))
const ChampionsPage = lazy(() => import('./pages/ChampionsPage.tsx'))
const ComparePage = lazy(() => import('./pages/ComparePage.tsx'))
const MoversPage = lazy(() => import('./pages/MoversPage.tsx'))
const InsightsPage = lazy(() => import('./pages/InsightsPage.tsx'))
const AboutPage = lazy(() => import('./pages/AboutPage.tsx'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.tsx'))

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TierListPage />} />
        <Route path="champion/:slug" element={<ChampionPage />} />
        <Route path="champions" element={<ChampionsPage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="movers" element={<MoversPage />} />
        <Route path="insights" element={<InsightsPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
