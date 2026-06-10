import { describe, expect, it } from 'vitest';
import { addPlayerToRoom, canPlayRank, createCard, createEmptyPlayerState, createRoomState, drawChanceCard, getPlayerActionState, getTopConstraintRank, pickupPile, playCard, startGame } from '../src';
const suits = ['clubs', 'diamonds', 'hearts', 'spades'];
function deckFromSpecs(specs) {
    return specs.map(([rank, suit], index) => ({
        ...createCard(rank, suit),
        id: `${index}-${rank}-${suit}`
    }));
}
function createLobby(names) {
    return names.reduce((room, name, index) => {
        const player = createEmptyPlayerState(`player-${index + 1}`, `session-${index + 1}`, name, index + 1);
        player.ready = true;
        return addPlayerToRoom(room, player);
    }, createRoomState('ROOM01'));
}
describe('shared game engine', () => {
    it('selects the starting player by the lowest hand card', () => {
        const room = createLobby(['Ada', 'Bea']);
        const deck = deckFromSpecs([
            [9, suits[0]], [8, suits[1]], [9, suits[2]], [8, suits[3]], [9, suits[1]], [8, suits[2]],
            [11, suits[0]], [7, suits[1]], [12, suits[2]], [6, suits[3]], [13, suits[1]], [5, suits[2]],
            [4, suits[0]], [3, suits[1]], [14, suits[2]], [13, suits[3]]
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
                [13, suits[0]], [3, suits[0]], [14, suits[0]], [4, suits[0]], [5, suits[0]], [6, suits[0]]
            ])
        });
        room = playCard(room, 'player-2', room.players[1].hand[0].id);
        room = playCard(room, 'player-1', room.players[0].hand[0].id);
        expect(getTopConstraintRank(room.game?.activePile ?? [])).toBeNull();
        expect(canPlayRank(3, getTopConstraintRank(room.game?.activePile ?? []))).toBe(true);
    });
    it('burns the pile when a ten is played', () => {
        let room = createLobby(['Ada', 'Bea']);
        room = startGame(room, {
            deck: deckFromSpecs([
                [9, suits[0]], [9, suits[1]], [8, suits[0]], [8, suits[1]], [7, suits[0]], [7, suits[1]],
                [11, suits[0]], [11, suits[1]], [12, suits[0]], [12, suits[1]], [13, suits[0]], [13, suits[1]],
                [10, suits[0]], [3, suits[0]], [14, suits[0]], [4, suits[0]], [5, suits[0]], [6, suits[0]]
            ])
        });
        room = playCard(room, 'player-2', room.players[1].hand[0].id);
        room = playCard(room, 'player-1', room.players[0].hand[0].id);
        expect(room.game?.activePile).toHaveLength(0);
        expect(room.game?.discardedPile).toHaveLength(2);
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
        const current = room.game.currentTurnPlayerId;
        const player = room.players.find((entry) => entry.playerId === current);
        const beforeDraw = room.game.drawPile.length;
        room = playCard(room, current, player.hand[0].id);
        const updatedPlayer = room.players.find((entry) => entry.playerId === current);
        expect(updatedPlayer.hand).toHaveLength(3);
        expect(room.game.drawPile.length).toBe(beforeDraw - 1);
    });
    it('supports chance draw then pile pickup when still blocked', () => {
        const room = createRoomState('ROOM02');
        const first = createEmptyPlayerState('player-1', 'session-1', 'Ada', 1);
        const second = createEmptyPlayerState('player-2', 'session-2', 'Bea', 2);
        first.ready = true;
        second.ready = true;
        const started = {
            ...addPlayerToRoom(addPlayerToRoom(room, first), second),
            status: 'in_progress',
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
                    availableSource: 'hand'
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
        expect(withChance.players[0].hand).toHaveLength(2);
        expect(getPlayerActionState(withChance, 'player-1')?.canPickupPile).toBe(true);
        const afterPickup = pickupPile(withChance, 'player-1');
        expect(afterPickup.players[0].hand.map((card) => card.rank)).toEqual([3, 4, 13]);
        expect(afterPickup.game?.activePile).toHaveLength(0);
        expect(afterPickup.game?.currentTurnPlayerId).toBe('player-2');
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
            status: 'in_progress',
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
                    availableSource: 'faceUp'
                },
                startedAt: new Date().toISOString()
            }
        };
        const actionState = getPlayerActionState(started, 'player-1');
        expect(actionState?.availableSource).toBe('faceUp');
        const afterFaceUp = playCard(started, 'player-1', player.table.faceUp[0].id);
        expect(afterFaceUp.status).toBe('in_progress');
        expect(getPlayerActionState(afterFaceUp, 'player-1')?.availableSource).toBe('faceDown');
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
            status: 'in_progress',
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
                    availableSource: 'hand'
                },
                startedAt: new Date().toISOString()
            }
        };
        const finished = playCard(started, 'player-1', player.hand[0].id);
        expect(finished.status).toBe('finished');
        expect(finished.game?.winnerPlayerId).toBe('player-1');
    });
});
//# sourceMappingURL=engine.test.js.map