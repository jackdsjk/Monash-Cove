import { useEffect, useState } from 'react'

export type Route =
  | '/'
  | '/deadlines'
  | '/grades'
  | '/materials'
  | '/ed'
  | '/pack'
  | '/ontrack'
  | '/attendance'
  | '/sources'
  | '/settings'
  | '/setup'

const ROUTES: Route[] = ['/', '/deadlines', '/grades', '/materials', '/ed', '/pack', '/ontrack', '/attendance', '/sources', '/settings', '/setup']

function read(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  return (ROUTES as string[]).includes(raw) ? (raw as Route) : '/'
}

export function navigate(to: Route) {
  window.location.hash = to
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(read)
  useEffect(() => {
    const onChange = () => setRoute(read())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
