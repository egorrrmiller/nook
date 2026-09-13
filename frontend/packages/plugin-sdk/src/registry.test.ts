import { describe, expect, it } from 'vitest';
import { definePlugin } from './definePlugin';
import { buildRegistry } from './registry';

describe('plugin registry', () => {
  it('namespaces commands by plugin id', () => {
    const p = definePlugin({
      id: 'test.one',
      name: 'One',
      commands: [{ id: 'hi', title: 'Say hi', run: () => {} }],
    });
    const r = buildRegistry([p]);
    expect(r.commands.map((c) => c.id)).toEqual(['test.one:hi']);
    expect(r.commands[0]?.pluginId).toBe('test.one');
  });

  it('rejects duplicate plugin ids and invalid ids', () => {
    const p = definePlugin({ id: 'dup', name: 'Dup' });
    expect(() => buildRegistry([p, p])).toThrow(/twice/);
    expect(() => definePlugin({ id: ' bad id', name: 'x' })).toThrow(/invalid plugin id/);
  });
});
