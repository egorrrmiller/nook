import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, type InviteInfo } from '@nook/api-client';
import { Button, Field, Skeleton } from '@nook/ui';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queries';
import { pickWorkspace } from '../../app/auth';
import { AuthLayout } from './AuthLayout';

export function RegisterScreen() {
  const { invite } = useSearch({ from: '/register' });
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const [info, setInfo] = useState<InviteInfo | null | 'loading'>(invite ? 'loading' : null);
  const [code, setCode] = useState(invite ?? '');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!invite) return;
    let cancelled = false;
    setInfo('loading');
    api.auth
      .invite(invite)
      .then((i) => {
        if (cancelled) return;
        setInfo(i);
        if (i.email) setEmail(i.email);
      })
      .catch(() => !cancelled && setInfo({ valid: false }));
    return () => {
      cancelled = true;
    };
  }, [invite]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!code.trim()) return setError('An invite code is required.');
    if (!email.trim()) return setError('Enter your email.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      const me = await api.auth.register({
        inviteCode: code.trim(),
        email: email.trim(),
        password,
        displayName: displayName.trim() || email.split('@')[0] || 'User',
      });
      qc.setQueryData(queryKeys.me, me);
      await router.invalidate();
      const workspaceId = pickWorkspace(me);
      if (workspaceId) await navigate({ to: '/w/$workspaceId', params: { workspaceId } });
      else await navigate({ to: '/' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) setError('This invite has expired.');
      else if (err instanceof ApiError && err.status === 400)
        setError(err.message || 'Invalid invite.');
      else if (err instanceof ApiError) setError(err.message);
      else setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  if (info === 'loading') {
    return (
      <AuthLayout title="Create your account">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      </AuthLayout>
    );
  }

  if (info && !info.valid) {
    return (
      <AuthLayout title="Invite not valid" subtitle="This invite link is invalid or has expired.">
        <p className="text-center text-sm text-fg-secondary">
          Ask the instance owner for a new invite, or{' '}
          <Link to="/login" className="text-brand hover:underline">
            sign in
          </Link>
          .
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create your account" subtitle="You have been invited to this Nook.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {!invite ? (
          <Field label="Invite code" id="code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
        ) : null}
        <Field label="Email" id="email"
            type="email"
            autoComplete="email"
            value={email}
            readOnly={!!info?.email}
            onChange={(e) => setEmail(e.target.value)} />
        <Field label="Display name" id="displayName"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)} />
        <Field label="Password" id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)} />
        <Field label="Confirm password" id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)} />
        {error ? (
          <p
            role="alert"
            className="rounded-[var(--radius-sm)] bg-danger-bg px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="default" size="lg" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
        <p className="text-center text-xs text-fg-muted">
          Already have an account?{' '}
          <Link to="/login" className="text-brand hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
