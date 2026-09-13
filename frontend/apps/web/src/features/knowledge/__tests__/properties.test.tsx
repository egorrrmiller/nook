import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../mocks/handlers';
import { PageProperties } from '../properties/PageProperties';
import { nodeByTitle, renderWidget, signIn } from './helpers';

describe('PageProperties', () => {
  it('renders the seeded properties with tags and aliases rows', async () => {
    const { workspaceId } = signIn();
    const node = nodeByTitle('Nook plan');
    renderWidget(<PageProperties workspaceId={workspaceId} nodeId={node.id} />);

    expect(await screen.findByTestId('page-properties')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId('property-row').length).toBeGreaterThan(3));
    expect(screen.getAllByTestId('property-row')[0]).toHaveAttribute('data-property', 'Status');
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('product')).toBeInTheDocument();
    // Tags (manual "nook" + inline "#roadmap") and aliases.
    await waitFor(() => expect(screen.getByText('#roadmap')).toBeInTheDocument());
    expect(screen.getByText('Plan')).toBeInTheDocument();
  });

  it('edits a text property and PATCHes it', async () => {
    const { workspaceId } = signIn();
    const node = nodeByTitle('Nook plan');
    const user = userEvent.setup();
    renderWidget(<PageProperties workspaceId={workspaceId} nodeId={node.id} />);

    const input = await screen.findByRole('textbox', { name: 'Website' });
    await user.clear(input);
    await user.type(input, 'https://nook.local{Enter}');
    await waitFor(() => expect(mockApi.state.nodes.find((n) => n.id === node.id)?.properties?.Website?.value).toBe('https://nook.local'));
  });

  it('rejects an invalid email without sending it', async () => {
    const { workspaceId } = signIn();
    const node = nodeByTitle('Nook plan');
    const user = userEvent.setup();
    renderWidget(<PageProperties workspaceId={workspaceId} nodeId={node.id} />);
    await screen.findByTestId('page-properties');

    await user.click(await screen.findByTestId('add-property'));
    await user.type(await screen.findByLabelText('Property name'), 'Contact');
    await user.click(screen.getByRole('option', { name: /Email/ }));
    const input = await screen.findByRole('textbox', { name: 'Contact' });
    await user.type(input, 'not-an-email');
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email');
    await waitFor(() => expect(mockApi.state.nodes.find((n) => n.id === node.id)?.properties?.Contact?.value).toBeNull());
  });

  it('adds a property and removes it through the row menu', async () => {
    const { workspaceId } = signIn();
    const node = nodeByTitle('Reading list');
    const user = userEvent.setup();
    renderWidget(<PageProperties workspaceId={workspaceId} nodeId={node.id} />);
    await screen.findByTestId('page-properties');

    await user.click(await screen.findByTestId('add-property'));
    await user.type(await screen.findByLabelText('Property name'), 'Read');
    await user.click(screen.getByRole('option', { name: /Checkbox/ }));
    await waitFor(() => expect(mockApi.state.nodes.find((n) => n.id === node.id)?.properties?.Read).toEqual({ type: 'checkbox', value: false }));

    await user.click(await screen.findByRole('checkbox', { name: 'Read' }));
    await waitFor(() => expect(mockApi.state.nodes.find((n) => n.id === node.id)?.properties?.Read?.value).toBe(true));

    await user.click(screen.getByRole('button', { name: /^Read \(Checkbox\)/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Delete property/ }));
    await waitFor(() => expect(mockApi.state.nodes.find((n) => n.id === node.id)?.properties?.Read).toBeUndefined());
  });

  it('is read-only when asked (no add button, no inputs)', async () => {
    const { workspaceId } = signIn();
    const node = nodeByTitle('Nook plan');
    renderWidget(<PageProperties workspaceId={workspaceId} nodeId={node.id} readOnly />);
    await screen.findByTestId('page-properties');
    await waitFor(() => expect(screen.getAllByTestId('property-row').length).toBeGreaterThan(1));
    expect(screen.queryByTestId('add-property')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Website' })).not.toBeInTheDocument();
  });

  it('collapses and remembers the state in localStorage', async () => {
    const { workspaceId } = signIn();
    const node = nodeByTitle('Nook plan');
    const user = userEvent.setup();
    const { unmount } = renderWidget(<PageProperties workspaceId={workspaceId} nodeId={node.id} />);
    await user.click(await screen.findByRole('button', { name: /Properties/ }));
    expect(localStorage.getItem('nook.knowledge.properties.collapsed')).toBe('true');
    unmount();

    renderWidget(<PageProperties workspaceId={workspaceId} nodeId={node.id} />);
    const toggle = await screen.findByRole('button', { name: /Properties/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const section = screen.getByTestId('page-properties');
    expect(section).toHaveAttribute('data-collapsed');
    expect(within(section).queryByTestId('property-row')).not.toBeInTheDocument();
  });
});
