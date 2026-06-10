import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock socket.io-client so no real network connections are made.
const socketListeners = new Map<string, ((...args: unknown[]) => void)[]>();
const mockSocket = {
  on: (event: string, handler: (...args: unknown[]) => void) => {
    const handlers = socketListeners.get(event) ?? [];
    handlers.push(handler);
    socketListeners.set(event, handlers);
  },
  emit: vi.fn(),
  removeAllListeners: () => socketListeners.clear(),
  close: vi.fn()
};

vi.mock('socket.io-client', () => ({
  io: () => mockSocket
}));

// Must import App after the mock is set up.
const { default: App } = await import('../src/App');

async function emit(event: string, ...args: unknown[]) {
  await act(async () => {
    for (const handler of socketListeners.get(event) ?? []) {
      handler(...args);
    }
  });
}

describe('App – landing view', () => {
  beforeEach(() => {
    socketListeners.clear();
    mockSocket.emit.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the page heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Vändtia Online/i })).toBeTruthy();
  });

  it('renders the player setup, create room, and join room panels', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Player setup/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Create room/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Join room/i })).toBeTruthy();
  });

  it('wraps the landing panels in the mobile-first landing-grid container', () => {
    const { container } = render(<App />);
    const grid = container.querySelector('.landing-grid');
    expect(grid).toBeTruthy();
  });

  it('applies app-shell class to the root element', () => {
    const { container } = render(<App />);
    expect(container.querySelector('.app-shell')).toBeTruthy();
  });

  it('always renders the status panel', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Status/i })).toBeTruthy();
  });

  it('disables the create-room button when name is empty', () => {
    render(<App />);
    const createButton = screen.getByRole('button', { name: /Create a room/i });
    expect((createButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables the join-room button when name or room code is empty', () => {
    render(<App />);
    const joinButton = screen.getByRole('button', { name: /Join room/i });
    expect((joinButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables the create-room button when a name is typed', async () => {
    const user = userEvent.setup();
    render(<App />);
    await emit('connect');
    const nameInput = screen.getByPlaceholderText(/Enter your name/i);
    await user.type(nameInput, 'Ada');
    const createButton = screen.getByRole('button', { name: /Create a room/i });
    expect((createButton as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the offline status pill before the socket connects', () => {
    render(<App />);
    expect(screen.getByText('Offline')).toBeTruthy();
  });

  it('shows the online status pill after the socket connects', async () => {
    render(<App />);
    await emit('connect');
    expect(screen.getByText('Connected')).toBeTruthy();
  });
});

describe('App – lobby view', () => {
  beforeEach(() => {
    socketListeners.clear();
    mockSocket.emit.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders seat cards inside the seat-grid container when a room is received', async () => {
    const { container } = render(<App />);
    await emit('connect');
    await emit('room:update', {
      roomCode: 'TEST01',
      status: 'lobby',
      locked: false,
      maxPlayers: 4,
      mePlayerId: 'me',
      players: [
        {
          playerId: 'me',
          name: 'Ada',
          seat: 1,
          ready: false,
          connected: true,
          hand: [],
          handCount: 0,
          faceUp: [],
          faceDown: [],
          faceDownCount: 0,
          isMe: true
        }
      ],
      game: null
    });

    const grid = container.querySelector('.seat-grid');
    expect(grid).toBeTruthy();
    expect(screen.getByText(/Seat 1: Ada/i)).toBeTruthy();
  });

  it('renders ready and start-game buttons in the lobby', async () => {
    render(<App />);
    await emit('connect');
    await emit('room:update', {
      roomCode: 'TEST01',
      status: 'lobby',
      locked: false,
      maxPlayers: 4,
      mePlayerId: 'me',
      players: [
        {
          playerId: 'me',
          name: 'Ada',
          seat: 1,
          ready: false,
          connected: true,
          hand: [],
          handCount: 0,
          faceUp: [],
          faceDown: [],
          faceDownCount: 0,
          isMe: true
        }
      ],
      game: null
    });

    expect(screen.getByRole('button', { name: /Mark ready/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Start game/i })).toBeTruthy();
  });

  it('disables the start-game button when not all players are ready', async () => {
    render(<App />);
    await emit('connect');
    await emit('room:update', {
      roomCode: 'TEST01',
      status: 'lobby',
      locked: false,
      maxPlayers: 4,
      mePlayerId: 'me',
      players: [
        {
          playerId: 'me',
          name: 'Ada',
          seat: 1,
          ready: false,
          connected: true,
          hand: [],
          handCount: 0,
          faceUp: [],
          faceDown: [],
          faceDownCount: 0,
          isMe: true
        }
      ],
      game: null
    });

    const startButton = screen.getByRole('button', { name: /Start game/i });
    expect((startButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders room meta pills with phase and ready count', async () => {
    render(<App />);
    await emit('connect');
    await emit('room:update', {
      roomCode: 'TEST01',
      status: 'lobby',
      locked: false,
      maxPlayers: 4,
      mePlayerId: 'me',
      players: [
        {
          playerId: 'me',
          name: 'Ada',
          seat: 1,
          ready: true,
          connected: true,
          hand: [],
          handCount: 0,
          faceUp: [],
          faceDown: [],
          faceDownCount: 0,
          isMe: true
        }
      ],
      game: null
    });

    expect(screen.getByText(/Phase: Lobby/i)).toBeTruthy();
    expect(screen.getByText(/Ready: 1\/1/i)).toBeTruthy();
  });
});
