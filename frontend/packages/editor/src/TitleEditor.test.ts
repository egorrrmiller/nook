import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { applyTextDiff } from './TitleEditor';

describe('applyTextDiff', () => {
  it('updates only the changed span of a title Y.Text', () => {
    const doc = new Y.Doc();
    const text = doc.getText('title');
    text.insert(0, 'Project notes');

    applyTextDiff(text, 'Project plan notes');
    expect(text.toString()).toBe('Project plan notes');

    applyTextDiff(text, 'Project plan');
    expect(text.toString()).toBe('Project plan');
  });

  it('does not create a transaction for an unchanged value', () => {
    const doc = new Y.Doc();
    const text = doc.getText('title');
    text.insert(0, 'Untitled');
    let updates = 0;
    doc.on('update', () => updates++);

    applyTextDiff(text, 'Untitled');
    expect(updates).toBe(0);
  });
});
