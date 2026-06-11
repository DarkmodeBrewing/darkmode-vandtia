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

describe('App – face-down gameplay', () => {
  beforeEach(() => {
    socketListeners.clear();
    mockSocket.emit.mockReset();
    localStorage.clear();
    localStorage.setItem('darkmode-vandtia-session', JSON.stringify({ roomCode: 'TEST01', playerId: 'me', sessionId: 'session-me' }));
  });

  afterEach(() => {
    cleanup();
  });

  it('renders own face-down cards as hidden choices and sends the selected card id', async () => {
    const user = userEvent.setup();
    render(<App />);
    await emit('connect');
    await emit('room:update', {
      roomCode: 'TEST01',
      status: 'in_progress',
      locked: true,
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
          faceDown: [
            { id: 'face-down-a', rank: 2, suit: 'clubs', label: 'Hidden' },
            { id: 'face-down-b', rank: 2, suit: 'clubs', label: 'Hidden' }
          ],
          faceDownCount: 2,
          isMe: true
        },
        {
          playerId: 'other',
          name: 'Bea',
          seat: 2,
          ready: true,
          connected: true,
          hand: [],
          handCount: 1,
          faceUp: [],
          faceDown: [],
          faceDownCount: 0,
          isMe: false
        }
      ],
      game: {
        drawPile: [],
        activePile: [{ id: 'pile-9', rank: 9, suit: 'hearts', label: '9♥' }],
        discardedPile: [],
        currentTurnPlayerId: 'me',
        winnerPlayerId: null,
        turn: {
          playerId: 'me',
          drewChanceCard: false,
          availableSource: 'faceDown'
        },
        startedAt: new Date().toISOString(),
        drawPileCount: 0,
        discardedPileCount: 0,
        actionState: {
          availableSource: 'faceDown',
          legalCardIds: ['face-down-a', 'face-down-b'],
          canDrawChance: false,
          canPickupPile: false,
          topConstraintRank: 9
        }
      }
    });

    expect(screen.getByText('Choose one face-down table card to reveal.')).toBeTruthy();
    const hiddenCards = screen.getAllByRole('button', { name: 'Hidden' });
    expect(hiddenCards).toHaveLength(2);
    expect((hiddenCards[0] as HTMLButtonElement).disabled).toBe(false);

    await user.click(hiddenCards[0]!);

    expect(mockSocket.emit).toHaveBeenLastCalledWith(
      'game:play-card',
      { roomCode: 'TEST01', playerId: 'me', cardId: 'face-down-a' },
      expect.any(Function)
    );
  });
});

describe('App – replay summary', () => {
  beforeEach(() => {
    socketListeners.clear();
    mockSocket.emit.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the completed round replay after the game finishes', async () => {
    render(<App />);
    await emit('connect');
    await emit('room:update', {
      roomCode: 'TEST02',
      status: 'finished',
      locked: true,
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
        },
        {
          playerId: 'other',
          name: 'Bea',
          seat: 2,
          ready: true,
          connected: true,
          hand: [],
          handCount: 1,
          faceUp: [],
          faceDown: [],
          faceDownCount: 0,
          isMe: false
        }
      ],
      game: {
        drawPile: [],
        activePile: [],
        discardedPile: [],
        currentTurnPlayerId: 'me',
        winnerPlayerId: 'me',
        turn: {
          playerId: 'me',
          drewChanceCard: false,
          availableSource: 'hand'
        },
        startedAt: new Date().toISOString(),
        replay: [
          {
            id: 'TEST02-1',
            sequence: 1,
            type: 'play',
            playerId: 'me',
            playerName: 'Ada',
            source: 'hand',
            cards: [{ id: 'card-5', rank: 5, suit: 'clubs', label: '5♣' }],
            pileCards: [],
            activePileCount: 1,
            drawPileCount: 0,
            createdAt: new Date().toISOString()
          },
          {
            id: 'TEST02-2',
            sequence: 2,
            type: 'pickup',
            playerId: 'other',
            playerName: 'Bea',
            source: 'hand',
            cards: [],
            pileCards: [{ id: 'card-5', rank: 5, suit: 'clubs', label: '5♣' }],
            activePileCount: 0,
            drawPileCount: 0,
            createdAt: new Date().toISOString()
          }
        ],
        drawPileCount: 0,
        discardedPileCount: 0,
        actionState: null
      }
    });

    expect(screen.getByRole('heading', { name: /Round replay/i })).toBeTruthy();
    expect(screen.getByText(/2 actions/i)).toBeTruthy();
    expect(screen.getByText(/Ada played 5♣ from hand/i)).toBeTruthy();
    expect(screen.getByText(/Bea picked up 1 pile card/i)).toBeTruthy();
  });
});
