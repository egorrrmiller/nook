import { useState, type FormEvent } from 'react';
import { useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@nook/api-client';
import { Button, Field } from '@nook/ui';
import { api, IS_MOCK } from '../../lib/api';
import { queryKeys } from '../../lib/queries';
import { pickWorkspace } from '../../app/auth';
import { AuthAlert } from './AuthAlert';
import { AuthLayout } from './AuthLayout';

export function LoginScreen() {
  const search = useSearch({ from: '/login' });
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState(IS_MOCK ? 'owner@localhost' : '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      const me = await api.auth.login({ email: email.trim(), password });
      qc.setQueryData(queryKeys.me, me);
      await router.invalidate();
      if (search.redirect) {
        await navigate({ href: search.redirect });
        return;
      }
      const workspaceId = pickWorkspace(me);
      if (workspaceId) await navigate({ to: '/w/$workspaceId', params: { workspaceId } });
      else await navigate({ to: '/' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError('Invalid email or password.');
      else if (err instanceof ApiError) setError(err.message);
      else setError('Could not reach the server. Is the API running?');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in to Nook"
      subtitle={IS_MOCK ? 'Mock mode — owner@localhost / change-me' : undefined}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Email" id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)} />
        <Field label="Password" id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)} />
        {error ? <AuthAlert>{error}</AuthAlert> : null}
        <Button type="submit" variant="default" size="lg" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="text-center text-xs text-fg-muted">
          Registration is by invite only. Open your invite link to create an account.
        </p>
      </form>
    </AuthLayout>
  );
}
