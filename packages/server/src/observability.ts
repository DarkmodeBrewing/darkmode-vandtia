import type { RoomState } from '@darkmode-vandtia/shared';

export type RoomLifecycleEvent =
  | 'room_created'
  | 'player_joined'
  | 'player_synced'
  | 'player_left'
  | 'player_disconnected'
  | 'game_started'
  | 'game_finished'
  | 'inactive_turn_skipped'
  | 'room_cleaned_up';

export interface RoomLifecycleLogEntry {
  event: RoomLifecycleEvent;
  roomCode: string;
  status: RoomState['status'];
  playerId?: string;
  hostPlayerId: string | null;
  playerCount: number;
  connectedPlayerCount: number;
  maxPlayers: number;
  currentTurnPlayerId?: string;
  winnerPlayerId?: string | null;
  reason?: string;
}

export interface LifecycleLogger {
  log(entry: RoomLifecycleLogEntry): void;
}

export const consoleLifecycleLogger: LifecycleLogger = {
  log(entry) {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...entry }));
  }
};

export function createRoomLifecycleEntry(
  event: RoomLifecycleEvent,
  room: RoomState,
  details: Pick<RoomLifecycleLogEntry, 'playerId' | 'reason'> = {}
): RoomLifecycleLogEntry {
  const entry: RoomLifecycleLogEntry = {
    event,
    roomCode: room.roomCode,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    playerCount: room.players.length,
    connectedPlayerCount: room.players.filter((player) => player.connected).length,
    maxPlayers: room.maxPlayers,
    ...details
  };

  if (room.game) {
    entry.currentTurnPlayerId = room.game.currentTurnPlayerId;
    entry.winnerPlayerId = room.game.winnerPlayerId;
  }

  return entry;
}
