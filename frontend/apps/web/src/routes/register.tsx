import { createFileRoute } from '@tanstack/react-router';
import { RegisterScreen } from '../components/auth/RegisterScreen';

export interface RegisterSearch {
  invite?: string;
}

export const Route = createFileRoute('/register')({
  validateSearch: (search: Record<string, unknown>): RegisterSearch => ({
    invite: typeof search.invite === 'string' ? search.invite : undefined,
  }),
  component: RegisterScreen,
});
