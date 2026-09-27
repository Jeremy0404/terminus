import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { AppDto } from '@terminus/contracts';
import { AppMenu } from './AppMenu';
import { APP } from '../test/fixtures';

const OTHER: AppDto = { id: 'app-2', name: 'atelier', repoPath: '/home/me/dev/atelier' };

function setup(overrides: Partial<Parameters<typeof AppMenu>[0]> = {}) {
  const props = {
    apps: [APP, OTHER],
    current: APP,
    onSelect: vi.fn(),
    onAdopt: vi.fn(),
    onFound: vi.fn(),
    memoryProposals: 0,
    staleSkills: 0,
    canNotify: true,
    onMemory: vi.fn(),
    onSettings: vi.fn(),
    onNotify: vi.fn(),
    ...overrides,
  };
  render(<AppMenu {...props} />);
  return props;
}

const trigger = (): HTMLElement => screen.getByRole('button', { expanded: false });
const open = (): HTMLElement => {
  fireEvent.click(trigger());
  return screen.getByRole('menu');
};

describe('AppMenu', () => {
  it('shows the current app on a closed menu trigger, or that there is none', () => {
    setup();
    expect(trigger()).toHaveTextContent('terminus');
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('says there is no app when none is current', () => {
    setup({ apps: [], current: null });
    expect(trigger()).toHaveTextContent('Aucune app');
  });

  it('opens on a menu listing every app with its repo, the current one marked', () => {
    setup();
    const menu = open();

    expect(screen.getByRole('button', { expanded: true })).toHaveAttribute('aria-haspopup', 'menu');
    const current = within(menu).getByRole('menuitem', { name: /terminus/ });
    expect(current).toHaveTextContent('/home/me/dev/terminus');
    expect(current).toHaveAttribute('aria-current', 'true');
    const other = within(menu).getByRole('menuitem', { name: /atelier/ });
    expect(other).toHaveTextContent('/home/me/dev/atelier');
    expect(other).toHaveAttribute('aria-current', 'false');
  });

  it('switches to the app chosen and closes', () => {
    const props = setup();
    fireEvent.click(within(open()).getByRole('menuitem', { name: /atelier/ }));

    expect(props.onSelect).toHaveBeenCalledWith('app-2');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('founds or adopts an app from the menu, and closes', () => {
    const props = setup();
    fireEvent.click(within(open()).getByRole('menuitem', { name: 'Nouvelle app' }));
    expect(props.onFound).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(within(open()).getByRole('menuitem', { name: 'Adopter un repo' }));
    expect(props.onAdopt).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes when its trigger is clicked again', () => {
    setup();
    open();
    fireEvent.click(screen.getByRole('button', { expanded: true }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape without choosing anything', () => {
    const props = setup();
    open();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onFound).not.toHaveBeenCalled();
    expect(props.onAdopt).not.toHaveBeenCalled();
  });

  it('closes on a click outside, but a press on an entry still chooses it', () => {
    const props = setup();
    open();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    const entry = within(open()).getByRole('menuitem', { name: /atelier/ });
    fireEvent.pointerDown(entry);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(entry);
    expect(props.onSelect).toHaveBeenCalledWith('app-2');
  });

  it('lets Escape through while it is closed', () => {
    setup();
    const listener = vi.fn();
    window.addEventListener('keydown', listener);
    fireEvent.keyDown(window, { key: 'Escape' });
    window.removeEventListener('keydown', listener);

    expect(listener).toHaveBeenCalledOnce();
  });

  it('lists the fixed entries first, then a separator, then the apps and how to add one', () => {
    setup();
    const menu = open();

    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Carnet produit',
      'Réglages',
      'Activer les notifications',
      'terminus/home/me/dev/terminus',
      'atelier/home/me/dev/atelier',
      'Nouvelle app',
      'Adopter un repo',
    ]);
    const separator = within(menu).getByRole('separator');
    const notify = within(menu).getByRole('menuitem', { name: 'Activer les notifications' });
    const firstApp = within(menu).getByRole('menuitem', { name: /terminus/ });
    expect(notify.compareDocumentPosition(separator) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(separator.compareDocumentPosition(firstApp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const group = within(menu).getByRole('group', { name: 'Apps' });
    expect(within(group).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'terminus/home/me/dev/terminus',
      'atelier/home/me/dev/atelier',
    ]);
    expect(within(group).queryByRole('menuitem', { name: 'Réglages' })).not.toBeInTheDocument();
  });

  it('offers no product notebook without a current app, but still the settings', () => {
    setup({ apps: [], current: null });
    const menu = open();

    expect(within(menu).queryByRole('menuitem', { name: /Carnet produit/ })).not.toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Réglages' })).toBeInTheDocument();
  });

  it('offers notifications only while they can be asked for', () => {
    setup({ canNotify: false });
    expect(within(open()).queryByRole('menuitem', { name: 'Activer les notifications' })).not.toBeInTheDocument();
  });

  it('opens the product notebook, the settings or the notifications prompt, and closes', () => {
    const props = setup();
    fireEvent.click(within(open()).getByRole('menuitem', { name: 'Carnet produit' }));
    expect(props.onMemory).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(within(open()).getByRole('menuitem', { name: 'Réglages' }));
    expect(props.onSettings).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(within(open()).getByRole('menuitem', { name: 'Activer les notifications' }));
    expect(props.onNotify).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows one dot on the trigger when something waits, and each count on its entry', () => {
    setup({ memoryProposals: 2, staleSkills: 3 });
    expect(within(trigger()).getAllByRole('img', { name: 'Quelque chose t’attend' })).toHaveLength(1);
    expect(trigger()).not.toHaveTextContent(/\d/);

    const menu = open();
    const memory = within(within(menu).getByRole('menuitem', { name: /Carnet produit/ })).getByLabelText('2 propositions à relire');
    expect(memory).toHaveTextContent('2');
    expect(memory).toHaveClass('badge');
    const settings = within(within(menu).getByRole('menuitem', { name: /Réglages/ })).getByLabelText('3 skills à revoir');
    expect(settings).toHaveTextContent('3');
    expect(settings).toHaveClass('badge');
  });

  it('shows the dot for either count alone, and nothing when nothing waits', () => {
    for (const [memoryProposals, staleSkills, badged] of [[1, 0, /Carnet produit/], [0, 1, /Réglages/]] as const) {
      const view = render(<AppMenu apps={[APP]} current={APP} onSelect={vi.fn()} onAdopt={vi.fn()} onFound={vi.fn()} memoryProposals={memoryProposals} staleSkills={staleSkills} canNotify={false} onMemory={vi.fn()} onSettings={vi.fn()} onNotify={vi.fn()} />);
      expect(within(trigger()).getByRole('img', { name: 'Quelque chose t’attend' })).toBeInTheDocument();
      const menu = open();
      expect(menu.querySelectorAll('.badge')).toHaveLength(1);
      expect(within(menu).getByRole('menuitem', { name: badged }).querySelector('.badge')).toBeInTheDocument();
      view.unmount();
    }

    setup();
    expect(within(trigger()).queryByRole('img')).not.toBeInTheDocument();
    expect(open().querySelectorAll('.badge')).toHaveLength(0);
  });
});
