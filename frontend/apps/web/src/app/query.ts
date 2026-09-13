import { ApiError } from '@nook/api-client';
import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
        refetchOnWindowFocus: false,
      },
    },
  });
}
