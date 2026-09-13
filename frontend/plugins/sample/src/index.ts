import { definePlugin } from '@nook/plugin-sdk';

/** Proves the plugin wiring end to end: shows up in ⌘K as "Sample: say hi". */
export const samplePlugin = definePlugin({
  id: 'nook.sample',
  name: 'Sample',
  version: '0.1.0',
  commands: [
    {
      id: 'say-hi',
      title: 'Sample: say hi',
      keywords: ['hello', 'demo', 'plugin'],
      run: ({ toast }) => toast('Hi from the sample plugin 👋'),
    },
  ],
});
