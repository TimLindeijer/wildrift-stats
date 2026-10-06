import { Suspense, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useCoreData } from '../data/hooks.ts'
import { useRouteFocusAndScroll } from '../hooks/index.ts'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { ErrorState, PageLoading } from './States.tsx'

const REPO_URL = 'https://github.com/TimLindeijer/wildrift-stats'

const NAV_ITEMS = [
  { to: '/', label: 'Tier list', end: true },
  { to: '/champions', label: 'Champions', end: false },
  { to: '/movers', label: 'Movers', end: false },
  { to: '/insights', label: 'Insights', end: false },
  { to: '/compare', label: 'Compare', end: false },
  { to: '/about', label: 'About', end: false },
] as const

function BrandMark() {
  return (
    <svg className="brand__mark" viewBox="0 0 64 64" width="30" height="30" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="brand-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3d58b" />
          <stop offset="1" stopColor="#b8893c" />
        </linearGradient>
      </defs>
      <path
        d="M32 3 57 17.5v29L32 61 7 46.5v-29z"
        fill="#0b111b"
        stroke="url(#brand-gold)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M17 23l7.5 19L32 28l7.5 14L47 23"
        fill="none"
        stroke="url(#brand-gold)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const DATA_LINE_SUFFIX = 'China server ranked'

function DataLine() {
  const { latest } = useCoreData()
  return (
    <p className="data-line">
      Stats for <time dateTime={latest.date}>{latest.date}</time> · {DATA_LINE_SUFFIX}
    </p>
  )
}

export function Layout() {
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  useRouteFocusAndScroll(mainRef)

  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          // A real jump would change the hash, which is the router's URL.
          event.preventDefault()
          mainRef.current?.focus()
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <div className="wrap site-header__inner">
          <div className="brand-block">
            <Link to="/" className="brand">
              <BrandMark />
              <span className="brand__name">Wild Rift Stats</span>
            </Link>
            <ErrorBoundary fallback={() => <p className="data-line">{DATA_LINE_SUFFIX}</p>}>
              <Suspense fallback={<p className="data-line">{DATA_LINE_SUFFIX}</p>}>
                <DataLine />
              </Suspense>
            </ErrorBoundary>
          </div>
          <nav className="site-nav" aria-label="Main">
            <ul>
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.end}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" ref={mainRef} tabIndex={-1} className="wrap site-main">
        <ErrorBoundary key={pathname} fallback={(error, retry) => <ErrorState error={error} retry={retry} />}>
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      <footer className="site-footer">
        <div className="wrap site-footer__inner">
          <p>
            Wild Rift Stats is an unofficial fan project. It isn’t endorsed by Riot Games and doesn’t reflect the views or
            opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games,
            League of Legends: Wild Rift and all associated properties are trademarks or registered trademarks of Riot
            Games, Inc.
          </p>
          <p>
            Not affiliated with or endorsed by Tencent. Data comes from Tencent’s public China-server ranked stats and is
            collected once a day. Ability descriptions, icons and previews come from the official Wild Rift site.
          </p>
          <p className="site-footer__links">
            <Link to="/about">About the data</Link>
            <a href={REPO_URL}>Source on GitHub</a>
          </p>
        </div>
      </footer>
    </>
  )
}
