import { QueryClient } from '@tanstack/react-query'

// Stale-while-revalidate: show the last-seen data instantly (and as an offline fallback),
// then refresh in the background on every tab change and whenever the app regains focus, so
// stats stay live. The short cache still dedupes bursts and keeps us under the MCSR rate
// limit (500 req / 10 min).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      gcTime: 30 * 60_000,
      retry: 1,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true
    }
  }
})
