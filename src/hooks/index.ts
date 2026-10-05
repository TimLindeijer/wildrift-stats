import { useCallback, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from 'react'
import { useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router'
import { withParams } from '../lib/params.ts'

type ParamChanges = Record<string, string | null>

/**
 * The URL's query parameters plus an updater that applies a partial change and replaces the
 * history entry, so filters are shareable without flooding the back button.
 */
export function useQueryParams(): [
  URLSearchParams,
  (changes: ParamChanges, defaults?: Readonly<Record<string, string>>) => void,
] {
  const [params] = useSearchParams()
  const { search } = useLocation()
  const navigate = useNavigate()
  const update = useCallback(
    (changes: ParamChanges, defaults?: Readonly<Record<string, string>>) => {
      const next = withParams(new URLSearchParams(search), changes, defaults)
      // Commas are safe in a query string; keeping them makes lists like ?c=garen,ahri readable.
      void navigate(`?${next.toString().replaceAll('%2C', ',')}`, { replace: true, preventScrollReset: true })
    },
    [navigate, search],
  )
  return [params, update]
}

/**
 * Page changes (a new pathname) start at the top with focus on `main`, so keyboard and screen
 * reader users land on the new content. Back/forward restores the scroll position the page was
 * left at. Filter changes only touch the query string and keep both. main.tsx turns off the
 * browser's own restoration, which would race with React rendering the previous page.
 */
export function useRouteFocusAndScroll(mainRef: RefObject<HTMLElement | null>): void {
  const location = useLocation()
  const navigationType = useNavigationType()
  const positions = useRef<Map<string, number>>(null)
  const currentKey = useRef(location.key)
  const previousPath = useRef(location.pathname)

  // Layout effects run before the browser can fire a scroll event for the new page, so a
  // position is never recorded under the wrong history entry.
  useLayoutEffect(() => {
    const onScroll = () => {
      positions.current ??= new Map()
      positions.current.set(currentKey.current, window.scrollY)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    currentKey.current = location.key
    if (previousPath.current === location.pathname) return
    previousPath.current = location.pathname
    if (navigationType === 'POP') {
      window.scrollTo(0, positions.current?.get(location.key) ?? 0)
    } else {
      window.scrollTo(0, 0)
      mainRef.current?.focus({ preventScroll: true })
    }
  }, [location.key, location.pathname, navigationType, mainRef])
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  )
}
