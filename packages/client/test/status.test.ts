import { describe, expect, it } from 'vitest';
import type { RoomView } from '@darkmode-vandtia/shared';
import { getStatusSummary } from '../src/status';

function createRoom(overrides?: Partial<RoomView>): RoomView {
  return {
    roomCode: 'ROOM42',
    status: 'lobby',
    locked: false,
    maxPlayers: 3,
    hostPlayerId: 'me',
    mePlayerId: 'me',
    players: [
      {
        playerId: 'me',
        name: 'Ada',
        seat: 1,
        ready: false,
        connected: true,
        isHost: true,
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
        ready: false,
        connected: true,
        isHost: false,
        hand: [],
        handCount: 0,
        faceUp: [],
        faceDown: [],
        faceDownCount: 0,
        isMe: false
      }
    ],
    game: null,
    ...overrides
  };
}

describe('getStatusSummary', () => {
  it('explains offline recovery when a saved session exists', () => {
    const summary = getStatusSummary({
      connected: false,
      room: null,
      sessionRestoreState: 'restoring',
      sessionRoomCode: 'ROOM42'
    });

    expect(summary.title).toBe('Offline.');
    expect(summary.detail).toContain('ROOM42');
  });

  it('explains lobby readiness blockers', () => {
    const summary = getStatusSummary({
      connected: true,
      room: createRoom(),
      sessionRestoreState: 'restored',
      sessionRoomCode: 'ROOM42'
    });

    expect(summary.title).toBe('You still need to ready up.');
    expect(summary.detail).toContain('Ada, Bea');
  });

  it('describes automatic restore while reconnecting to a saved room', () => {
    const summary = getStatusSummary({
      connected: true,
      room: null,
      sessionRestoreState: 'restoring',
      sessionRoomCode: 'ROOM42'
    });

    expect(summary.title).toBe('Restoring saved session.');
    expect(summary.detail).toContain('ROOM42');
  });

  it('explains chance draws when no legal hand play exists', () => {
    const summary = getStatusSummary({
      connected: true,
      sessionRestoreState: 'restored',
      sessionRoomCode: 'ROOM42',
      room: createRoom({
        status: 'in_progress',
        game: {
          drawPile: [],
          activePile: [{ id: 'pile-card', rank: 9, suit: 'hearts', label: '9♥' }],
          discardedPile: [],
          currentTurnPlayerId: 'me',
          winnerPlayerId: null,
          turn: {
            playerId: 'me',
            drewChanceCard: false,
            availableSource: 'hand'
          },
          startedAt: new Date().toISOString(),
          drawPileCount: 12,
          discardedPileCount: 4,
          actionState: {
            availableSource: 'hand',
            legalCardIds: [],
            canDrawChance: true,
            canPickupPile: false,
            topConstraintRank: 9
          }
        }
      })
    });

    expect(summary.title).toBe('No legal hand card.');
    expect(summary.detail).toContain('Draw one chance card');
  });

  it('shows wait messaging when another player has the turn', () => {
    const summary = getStatusSummary({
      connected: true,
      sessionRestoreState: 'restored',
      sessionRoomCode: 'ROOM42',
      room: createRoom({
        status: 'in_progress',
        game: {
          drawPile: [],
          activePile: [{ id: 'pile-card', rank: 5, suit: 'hearts', label: '5♥' }],
          discardedPile: [],
          currentTurnPlayerId: 'other',
          winnerPlayerId: null,
          turn: {
            playerId: 'other',
            drewChanceCard: false,
            availableSource: 'hand'
          },
          startedAt: new Date().toISOString(),
          drawPileCount: 10,
          discardedPileCount: 7,
          actionState: {
            availableSource: 'hand',
            legalCardIds: [],
            canDrawChance: false,
            canPickupPile: false,
            topConstraintRank: 5
          }
        }
      })
    });

    expect(summary.title).toBe('Waiting for Bea.');
    expect(summary.bullets[0]).toContain('unlock automatically');
  });

  it('describes face-up source when that turn source is active', () => {
    const summary = getStatusSummary({
      connected: true,
      sessionRestoreState: 'restored',
      sessionRoomCode: 'ROOM42',
      room: createRoom({
        status: 'in_progress',
        game: {
          drawPile: [],
          activePile: [],
          discardedPile: [],
          currentTurnPlayerId: 'me',
          winnerPlayerId: null,
          turn: {
            playerId: 'me',
            drewChanceCard: false,
            availableSource: 'faceUp'
          },
          startedAt: new Date().toISOString(),
          drawPileCount: 6,
          discardedPileCount: 5,
          actionState: {
            availableSource: 'faceUp',
            legalCardIds: ['card-a'],
            canDrawChance: false,
            canPickupPile: false,
            topConstraintRank: null
          }
        }
      })
    });

    expect(summary.title).toBe('Your turn.');
    expect(summary.detail).toContain('face-up table');
  });

  it('celebrates the winner once the game is finished', () => {
    const summary = getStatusSummary({
      connected: true,
      sessionRestoreState: 'restored',
      sessionRoomCode: 'ROOM42',
      room: createRoom({
        status: 'finished',
        players: [
          {
            playerId: 'me',
            name: 'Ada',
            seat: 1,
            ready: true,
            connected: true,
            isHost: true,
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
            isHost: false,
            hand: [],
            handCount: 0,
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
          currentTurnPlayerId: 'other',
          winnerPlayerId: 'other',
          turn: {
            playerId: 'other',
            drewChanceCard: false,
            availableSource: 'hand'
          },
          startedAt: new Date().toISOString(),
          drawPileCount: 0,
          discardedPileCount: 52,
          actionState: null
        }
      })
    });

    expect(summary.title).toBe('Game finished.');
    expect(summary.detail).toContain('Bea');
  });
});
