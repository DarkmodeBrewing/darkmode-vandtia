import { describe, expect, it } from 'vitest';
import {
  addPlayerToRoom,
  canPlayRank,
  createCard,
  createEmptyPlayerState,
  createRoomState,
  drawChanceCard,
  getPlayerActionState,
  getTopConstraintRank,
  pickupPile,
  playCard,
  removePlayerFromRoom,
  resetFinishedGameToLobby,
  startGame,
  toRoomView,
  type Card,
  type CardRank,
  type Suit
} from '../src';

const suits: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

function deckFromSpecs(specs: Array<[CardRank, Suit]>): Card[] {
  return specs.map(([rank, suit], index) => ({
    ...createCard(rank, suit),
    id: `${index}-${rank}-${suit}`
  }));
}

function createLobby(names: string[]): ReturnType<typeof createRoomState> {
  return names.reduce((room, name, index) => {
    const player = createEmptyPlayerState(`player-${index + 1}`, `session-${index + 1}`, name, index + 1);
    player.ready = true;
    return addPlayerToRoom(room, player);
  }, createRoomState('ROOM01'));
}

describe('shared game engine', () => {

  it('creates two-player and three-player rooms but rejects other capacities', () => {
    expect(createRoomState('DUO001', { maxPlayers: 2 }).maxPlayers).toBe(2);
    expect(createRoomState('TRIO01', { maxPlayers: 3 }).maxPlayers).toBe(3);
    expect(() => createRoomState('SOLO01', { maxPlayers: 1 })).toThrow(/capacity/i);
    expect(() => createRoomState('FOUR01', { maxPlayers: 4 })).toThrow(/capacity/i);
  });

  it('enforces the configured room capacity when joining', () => {
    let room = createRoomState('DUO001', { maxPlayers: 2 });
    room = addPlayerToRoom(room, createEmptyPlayerState('player-1', 'session-1', 'Ada', 1));
    room = addPlayerToRoom(room, createEmptyPlayerState('player-2', 'session-2', 'Bea', 2));

    expect(() => addPlayerToRoom(room, createEmptyPlayerState('player-3', 'session-3', 'Cal', 3))).toThrow(/full/i);
  });

  it('removes a lobby player and keeps their seat available for the next joiner', () => {
    let room = createLobby(['Ada', 'Bea', 'Cal']);

    room = removePlayerFromRoom(room, 'player-2');

    expect(room.players.map((player) => player.name)).toEqual(['Ada', 'Cal']);
    expect(room.players.map((player) => player.seat)).toEqual([1, 3]);
    expect(room.hostPlayerId).toBe('player-1');

    room = addPlayerToRoom(room, createEmptyPlayerState('player-4', 'session-4', 'Dee', 2));

    expect(room.players.map((player) => `${player.seat}:${player.name}`)).toEqual(['1:Ada', '2:Dee', '3:Cal']);
  });

  it('passes lobby host status to the next seated player when the host leaves', () => {
    const room = removePlayerFromRoom(createLobby(['Ada', 'Bea']), 'player-1');
    const beaView = toRoomView(room, 'player-2').players[0];

    expect(room.hostPlayerId).toBe('player-2');
    expect(beaView?.isHost).toBe(true);
  });

  it('resets a finished game to the lobby for another round', () => {
    let room = createLobby(['Ada', 'Bea']);
    room = startGame(room, {
      deck: deckFromSpecs([
        [9, suits[0]], [9, suits[1]], [8, suits[0]], [8, suits[1]], [7, suits[0]], [7, suits[1]],
        [11, suits[0]], [11, suits[1]], [12, suits[0]], [12, suits[1]], [13, suits[0]], [13, suits[1]],
        [3, suits[0]], [4, suits[0]], [14, suits[0]], [5, suits[0]], [6, suits[0]], [10, suits[0]]
      ])
    });
    room.status = 'finished';
    room.game!.winnerPlayerId = 'player-1';

    const lobby = resetFinishedGameToLobby(room);

    expect(lobby.status).toBe('lobby');
    expect(lobby.locked).toBe(false);
    expect(lobby.game).toBeNull();
    expect(lobby.players.every((player) => !player.ready)).toBe(true);
    expect(lobby.players.every((player) => player.hand.length === 0 && player.table.faceUp.length === 0 && player.table.faceDown.length === 0)).toBe(true);
  });

  it('selects the starting player by the lowest hand card', () => {
    const room = createLobby(['Ada', 'Bea']);
    const deck = deckFromSpecs([
      [9, suits[0]], [8, suits[1]], [9, suits[2]], [8, suits[3]], [9, suits[1]], [8, suits[2]],
      [11, suits[0]], [7, suits[1]], [12, suits[2]], [6, suits[3]], [13, suits[1]], [5, suits[2]],
      [4, suits[0]], [3, suits[1]], [14, suits[2]], [13, suits[3]], [10, suits[0]], [12, suits[0]]
    ]);

    const started = startGame(room, { deck });

    expect(started.game?.currentTurnPlayerId).toBe('player-2');
  });

  it('allows reset chains with twos', () => {
    let room = createLobby(['Ada', 'Bea']);
    room = startGame(room, {
      deck: deckFromSpecs([
        [9, suits[0]], [9, suits[1]], [8, suits[0]], [8, suits[1]], [7, suits[0]], [7, suits[1]],
        [10, suits[0]], [10, suits[1]], [11, suits[0]], [11, suits[1]], [12, suits[0]], [12, suits[1]],
        [2, suits[0]], [3, suits[0]], [13, suits[0]], [4, suits[0]], [14, suits[0]], [5, suits[0]]
      ])
    });

    room = playCard(room, 'player-1', room.players[0]!.hand[0]!.id);

    expect(getTopConstraintRank(room.game?.activePile ?? [])).toBeNull();
    expect(canPlayRank(3, getTopConstraintRank(room.game?.activePile ?? []))).toBe(true);
    expect(getPlayerActionState(room, 'player-2')?.legalCardIds).toContain(room.players[1]!.hand[0]!.id);
  });

  it('burns the pile when a ten is played', () => {
    let room = createLobby(['Ada', 'Bea']);
    room = startGame(room, {
      deck: deckFromSpecs([
        [9, suits[0]], [9, suits[1]], [8, suits[0]], [8, suits[1]], [7, suits[0]], [7, suits[1]],
        [11, suits[0]], [11, suits[1]], [12, suits[0]], [12, suits[1]], [13, suits[0]], [13, suits[1]],
        [10, suits[0]], [3, suits[0]], [11, suits[2]], [4, suits[0]], [12, suits[2]], [5, suits[0]]
      ])
    });

    room = playCard(room, 'player-2', room.players[1]!.hand[0]!.id);
    room = playCard(room, 'player-1', room.players[0]!.hand[0]!.id);

    expect(room.game?.activePile).toHaveLength(0);
    expect(room.game?.discardedPile).toHaveLength(2);
    expect(room.game?.replay?.map((entry) => entry.type)).toEqual(['play', 'burn']);
    expect(room.game?.replay?.[1]).toMatchObject({
      playerId: 'player-1',
      playerName: 'Ada',
      source: 'hand',
      activePileCount: 0
    });
    expect(room.game?.replay?.[1]?.cards.map((card) => card.rank)).toEqual([10]);
    expect(room.game?.replay?.[1]?.pileCards).toHaveLength(2);
  });

  it('draws back up to three cards after a hand play', () => {
    let room = createLobby(['Ada', 'Bea']);
    room = startGame(room, {
      deck: deckFromSpecs([
        [9, suits[0]], [9, suits[1]], [8, suits[0]], [8, suits[1]], [7, suits[0]], [7, suits[1]],
        [11, suits[0]], [11, suits[1]], [12, suits[0]], [12, suits[1]], [13, suits[0]], [13, suits[1]],
        [3, suits[0]], [4, suits[0]], [14, suits[0]], [5, suits[0]], [6, suits[0]], [10, suits[0]], [2, suits[0]]
      ])
    });

    const current = room.game!.currentTurnPlayerId;
    const player = room.players.find((entry) => entry.playerId === current)!;
    const beforeDraw = room.game!.drawPile.length;
    room = playCard(room, current, player.hand[0]!.id);
    const updatedPlayer = room.players.find((entry) => entry.playerId === current)!;

    expect(updatedPlayer.hand).toHaveLength(3);
    expect(room.game!.drawPile.length).toBe(beforeDraw - 1);
  });

  it('supports chance draw then pile pickup when still blocked', () => {
    const room = createRoomState('ROOM02');
    const first = createEmptyPlayerState('player-1', 'session-1', 'Ada', 1);
    const second = createEmptyPlayerState('player-2', 'session-2', 'Bea', 2);
    first.ready = true;
    second.ready = true;

    const started = {
      ...addPlayerToRoom(addPlayerToRoom(room, first), second),
      status: 'in_progress' as const,
      locked: true,
      game: {
        drawPile: deckFromSpecs([[4, suits[0]]]),
        activePile: deckFromSpecs([[13, suits[1]]]),
        discardedPile: [],
        currentTurnPlayerId: 'player-1',
        winnerPlayerId: null,
        turn: {
          playerId: 'player-1',
          drewChanceCard: false,
          availableSource: 'hand' as const
        },
        startedAt: new Date().toISOString()
      },
      players: [
        {
          ...first,
          hand: deckFromSpecs([[3, suits[0]]]),
          table: { faceDown: [], faceUp: [] }
        },
        {
          ...second,
          hand: deckFromSpecs([[14, suits[0]]]),
          table: { faceDown: [], faceUp: [] }
        }
      ]
    };

    const withChance = drawChanceCard(started, 'player-1');
    expect(withChance.players[0]!.hand).toHaveLength(2);
    expect(getPlayerActionState(withChance, 'player-1')?.canPickupPile).toBe(true);
    expect(withChance.game?.replay?.[0]).toMatchObject({
      type: 'chance_draw',
      playerName: 'Ada',
      drawPileCount: 0
    });

    const afterPickup = pickupPile(withChance, 'player-1');
    expect(afterPickup.players[0]!.hand.map((card) => card.rank)).toEqual([3, 4, 13]);
    expect(afterPickup.game?.activePile).toHaveLength(0);
    expect(afterPickup.game?.currentTurnPlayerId).toBe('player-2');
    expect(afterPickup.game?.replay?.map((entry) => entry.type)).toEqual(['chance_draw', 'pickup']);
    expect(afterPickup.game?.replay?.[1]?.pileCards.map((card) => card.rank)).toEqual([13]);
  });

  it('moves from hand to face-up then face-down cards when the draw pile is depleted', () => {
    const room = createRoomState('ROOM03');
    const player = {
      ...createEmptyPlayerState('player-1', 'session-1', 'Ada', 1),
      hand: [],
      table: {
        faceUp: deckFromSpecs([[6, suits[0]]]),
        faceDown: deckFromSpecs([[7, suits[0]]])
      }
    };

    const started = {
      ...room,
      status: 'in_progress' as const,
      locked: true,
      players: [player],
      game: {
        drawPile: [],
        activePile: [],
        discardedPile: [],
        currentTurnPlayerId: 'player-1',
        winnerPlayerId: null,
        turn: {
          playerId: 'player-1',
          drewChanceCard: false,
          availableSource: 'faceUp' as const
        },
        startedAt: new Date().toISOString()
      }
    };

    const actionState = getPlayerActionState(started, 'player-1');
    expect(actionState?.availableSource).toBe('faceUp');

    const afterFaceUp = playCard(started, 'player-1', player.table.faceUp[0]!.id);
    expect(afterFaceUp.status).toBe('in_progress');
    expect(getPlayerActionState(afterFaceUp, 'player-1')?.availableSource).toBe('faceDown');
  });

  it('lets players choose any face-down card without seeing its rank', () => {
    const room = createRoomState('ROOM05');
    const first = {
      ...createEmptyPlayerState('player-1', 'session-1', 'Ada', 1),
      hand: [],
      table: {
        faceUp: [],
        faceDown: deckFromSpecs([[8, suits[0]], [3, suits[1]]])
      }
    };
    const second = {
      ...createEmptyPlayerState('player-2', 'session-2', 'Bea', 2),
      hand: deckFromSpecs([[14, suits[0]]]),
      table: { faceDown: [], faceUp: [] }
    };
    const started = {
      ...room,
      status: 'in_progress' as const,
      locked: true,
      players: [first, second],
      game: {
        drawPile: [],
        activePile: deckFromSpecs([[9, suits[2]]]),
        discardedPile: [],
        currentTurnPlayerId: 'player-1',
        winnerPlayerId: null,
        turn: {
          playerId: 'player-1',
          drewChanceCard: false,
          availableSource: 'faceDown' as const
        },
        startedAt: new Date().toISOString()
      }
    };

    const actionState = getPlayerActionState(started, 'player-1');
    expect(actionState?.availableSource).toBe('faceDown');
    expect(actionState?.legalCardIds).toEqual(first.table.faceDown.map((card) => card.id));

    const playerView = toRoomView(started, 'player-1').players[0]!;
    expect(playerView.faceDown.map((card) => card.id)).toEqual(first.table.faceDown.map((card) => card.id));
    expect(playerView.faceDown.map((card) => card.label)).toEqual(['Hidden', 'Hidden']);
  });

  it('plays a legal face-down reveal normally', () => {
    const room = createRoomState('ROOM06');
    const first = {
      ...createEmptyPlayerState('player-1', 'session-1', 'Ada', 1),
      hand: [],
      table: {
        faceUp: [],
        faceDown: deckFromSpecs([[8, suits[0]], [11, suits[1]]])
      }
    };
    const second = {
      ...createEmptyPlayerState('player-2', 'session-2', 'Bea', 2),
      hand: deckFromSpecs([[14, suits[0]]]),
      table: { faceDown: [], faceUp: [] }
    };
    const started = {
      ...room,
      status: 'in_progress' as const,
      locked: true,
      players: [first, second],
      game: {
        drawPile: [],
        activePile: deckFromSpecs([[7, suits[2]]]),
        discardedPile: [],
        currentTurnPlayerId: 'player-1',
        winnerPlayerId: null,
        turn: {
          playerId: 'player-1',
          drewChanceCard: false,
          availableSource: 'faceDown' as const
        },
        startedAt: new Date().toISOString()
      }
    };

    const afterReveal = playCard(started, 'player-1', first.table.faceDown[0]!.id);

    expect(afterReveal.players[0]!.table.faceDown.map((card) => card.rank)).toEqual([11]);
    expect(afterReveal.game?.activePile.map((card) => card.rank)).toEqual([7, 8]);
    expect(afterReveal.game?.currentTurnPlayerId).toBe('player-2');
    expect(afterReveal.status).toBe('in_progress');
  });

  it('reveals an illegal face-down card, picks up the pile, and ends the turn', () => {
    const room = createRoomState('ROOM07');
    const first = {
      ...createEmptyPlayerState('player-1', 'session-1', 'Ada', 1),
      hand: [],
      table: {
        faceUp: [],
        faceDown: deckFromSpecs([[8, suits[0]]])
      }
    };
    const second = {
      ...createEmptyPlayerState('player-2', 'session-2', 'Bea', 2),
      hand: deckFromSpecs([[14, suits[0]]]),
      table: { faceDown: [], faceUp: [] }
    };
    const started = {
      ...room,
      status: 'in_progress' as const,
      locked: true,
      players: [first, second],
      game: {
        drawPile: [],
        activePile: deckFromSpecs([[9, suits[2]]]),
        discardedPile: [],
        currentTurnPlayerId: 'player-1',
        winnerPlayerId: null,
        turn: {
          playerId: 'player-1',
          drewChanceCard: false,
          availableSource: 'faceDown' as const
        },
        startedAt: new Date().toISOString()
      }
    };

    const afterPenalty = playCard(started, 'player-1', first.table.faceDown[0]!.id);

    expect(afterPenalty.players[0]!.hand.map((card) => card.rank)).toEqual([8, 9]);
    expect(afterPenalty.players[0]!.table.faceDown).toHaveLength(0);
    expect(afterPenalty.game?.activePile).toHaveLength(0);
    expect(afterPenalty.game?.currentTurnPlayerId).toBe('player-2');
    expect(afterPenalty.status).toBe('in_progress');
    expect(afterPenalty.game?.replay?.[0]).toMatchObject({
      type: 'illegal_reveal',
      playerName: 'Ada',
      source: 'faceDown',
      activePileCount: 0
    });
    expect(afterPenalty.game?.replay?.[0]?.cards.map((card) => card.rank)).toEqual([8]);
    expect(afterPenalty.game?.replay?.[0]?.pileCards.map((card) => card.rank)).toEqual([9, 8]);
  });

  it('detects a winner when a player clears all cards', () => {
    const room = createRoomState('ROOM04');
    const player = {
      ...createEmptyPlayerState('player-1', 'session-1', 'Ada', 1),
      hand: deckFromSpecs([[5, suits[0]]]),
      table: { faceDown: [], faceUp: [] }
    };

    const started = {
      ...room,
      status: 'in_progress' as const,
      locked: true,
      players: [player],
      game: {
        drawPile: [],
        activePile: [],
        discardedPile: [],
        currentTurnPlayerId: 'player-1',
        winnerPlayerId: null,
        turn: {
          playerId: 'player-1',
          drewChanceCard: false,
          availableSource: 'hand' as const
        },
        startedAt: new Date().toISOString()
      }
    };

    const finished = playCard(started, 'player-1', player.hand[0]!.id);
    expect(finished.status).toBe('finished');
    expect(finished.game?.winnerPlayerId).toBe('player-1');
  });
});
