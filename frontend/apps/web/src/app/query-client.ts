import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@nook/api-client';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return count < 2;
        },
        refetchOnWindowFocus: false,
      },
    },
  });
}
