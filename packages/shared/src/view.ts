import { getPlayerActionState } from './engine';
import type { Card, PlayerState, PlayerView, RoomState, RoomView } from './types';

function maskCards(cards: Card[], options: { preserveIds?: boolean } = {}): Card[] {
  return cards.map((card, index) => ({
    id: options.preserveIds ? card.id : `hidden-${index}-${card.id}`,
    rank: 2,
    suit: 'clubs',
    label: 'Hidden'
  }));
}

function toPlayerView(player: PlayerState, viewerPlayerId: string, hostPlayerId: string | null): PlayerView {
  const isMe = player.playerId === viewerPlayerId;

  return {
    playerId: player.playerId,
    name: player.name,
    seat: player.seat,
    ready: player.ready,
    connected: player.connected,
    isHost: player.playerId === hostPlayerId,
    hand: isMe ? player.hand : maskCards(player.hand),
    handCount: player.hand.length,
    faceUp: player.table.faceUp,
    faceDown: maskCards(player.table.faceDown, { preserveIds: isMe }),
    faceDownCount: player.table.faceDown.length,
    isMe
  };
}

export function toRoomView(room: RoomState, viewerPlayerId: string): RoomView {
  return {
    roomCode: room.roomCode,
    status: room.status,
    locked: room.locked,
    maxPlayers: room.maxPlayers,
    hostPlayerId: room.hostPlayerId,
    mePlayerId: viewerPlayerId,
    players: room.players
      .slice()
      .sort((left, right) => left.seat - right.seat)
      .map((player) => toPlayerView(player, viewerPlayerId, room.hostPlayerId)),
    game: room.game
      ? {
          ...room.game,
          drawPileCount: room.game.drawPile.length,
          discardedPileCount: room.game.discardedPile.length,
          actionState: getPlayerActionState(room, viewerPlayerId)
        }
      : null
  };
}
