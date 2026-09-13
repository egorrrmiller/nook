import type { NookPlugin } from '@nook/plugin-sdk';
import { samplePlugin } from '@nook/plugin-sample';

/** Plugins compiled into this build (static registration, see PLAN §4). */
export const plugins: readonly NookPlugin[] = [samplePlugin];
