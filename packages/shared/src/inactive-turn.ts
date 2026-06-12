import { getAvailableSource, isPlayerOut } from './player-cards';
import type { PlayerState, RoomState } from './types';

function getPlayer(room: RoomState, playerId: string): PlayerState {
  const player = room.players.find((entry) => entry.playerId === playerId);
  if (!player) {
    throw new Error('Player not found.');
  }

  return player;
}

function getConnectedActivePlayerAfter(room: RoomState, currentPlayerId: string): PlayerState | null {
  const activePlayers = room.players.filter((player) => !isPlayerOut(player)).sort((left, right) => left.seat - right.seat);
  const currentIndex = activePlayers.findIndex((player) => player.playerId === currentPlayerId);

  if (currentIndex < 0) {
    throw new Error('Current player is not active.');
  }

  for (let offset = 1; offset < activePlayers.length; offset += 1) {
    const candidate = activePlayers[(currentIndex + offset) % activePlayers.length]!;
    if (candidate.connected) {
      return candidate;
    }
  }

  return null;
}

export function skipDisconnectedTurn(room: RoomState, playerId: string): RoomState {
  if (!room.game || room.status !== 'in_progress') {
    throw new Error('The game is not active.');
  }

  if (room.game.currentTurnPlayerId !== playerId) {
    throw new Error('Only the current turn can be skipped.');
  }

  const currentPlayer = getPlayer(room, playerId);
  if (currentPlayer.connected) {
    throw new Error('Connected players cannot be skipped.');
  }

  const nextPlayer = getConnectedActivePlayerAfter(room, playerId);
  if (!nextPlayer) {
    throw new Error('No connected player is available to receive the turn.');
  }

  const nextRoom = structuredClone(room);
  const nextRoomPlayer = getPlayer(nextRoom, nextPlayer.playerId);
  nextRoom.game!.currentTurnPlayerId = nextRoomPlayer.playerId;
  nextRoom.game!.turn = {
    playerId: nextRoomPlayer.playerId,
    drewChanceCard: false,
    availableSource: getAvailableSource(nextRoomPlayer)
  };

  return nextRoom;
}
