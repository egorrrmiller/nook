import type { NookPlugin } from '@nook/plugin-sdk';

/**
 * External plugin injection point.
 *
 * The default web host intentionally bundles no plugin implementation. A distribution that installs a plugin adds its
 * package here during its own build, keeping the base application independent from optional features.
 */
export const plugins: readonly NookPlugin[] = [];
