import { describe, expect, it } from 'vitest';
import type { ButtonBlockContract, PluginManifest } from './types';

describe('automation/plugin wire contracts', () => {
  it('keeps button actions namespaced by their stable action id', () => {
    const button: ButtonBlockContract = {
      label: 'Add note',
      actions: [{ actionId: 'core.add_page', parameters: { title: 'Note' } }],
    };
    expect(button.actions[0]?.actionId).toBe('core.add_page');
  });

  it('represents settings as a schema-backed plugin manifest', () => {
    const plugin: PluginManifest = {
      id: 'sample',
      name: 'Sample',
      settings: { schema: { type: 'object', properties: { greeting: { type: 'string' } } } },
    };
    expect(plugin.settings?.schema.properties?.greeting?.type).toBe('string');
  });
});
