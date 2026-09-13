import type { HttpResponse, JsonBodyType } from 'msw';
import type { WorkspaceSummary } from '@nook/api-client';
import type { MockState, MockUser } from '../db';

/**
 * Shared plumbing handed to every `createXHandlers(ctx)`. `state` is a live getter — it is
 * swapped on `reset()`, so always read `ctx.state.…` inside a handler, never cache it.
 */
export interface MockContext {
  readonly state: MockState;
  /** RFC 7807 ProblemDetails response. */
  problem(status: number, title: string): HttpResponse<JsonBodyType>;
  /** Signed-in user (cookie emulation) or null. */
  requireUser(): MockUser | null;
  /** Workspace from `X-Workspace-Id`, or null when missing/unknown. */
  requireWorkspace(request: Request): WorkspaceSummary | null;
}
