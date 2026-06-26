import { QueryClient } from '@tanstack/react-query'

// Caching keeps us well under the MCSR rate limit (500 req / 10 min) and gives
// an instant offline fallback to the last-seen data.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
})
