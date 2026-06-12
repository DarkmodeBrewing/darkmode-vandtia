import { isPlayerOut, skipDisconnectedTurn, type RoomState } from '@darkmode-vandtia/shared';
import type { LifecycleLogger } from './observability.js';
import { createRoomLifecycleEntry } from './observability.js';

interface InactiveTurnMonitorOptions {
  timeoutMs?: number;
  getRoom(roomCode: string): RoomState | undefined;
  saveRoom(room: RoomState): RoomState;
  emitRoom(room: RoomState): void;
  logger: LifecycleLogger;
}

export class InactiveTurnMonitor {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly options: InactiveTurnMonitorOptions) {}

  schedule(room: RoomState): void {
    this.clear(room.roomCode);
    if (!this.options.timeoutMs || !this.shouldSchedule(room)) {
      return;
    }

    const skippedPlayerId = room.game!.currentTurnPlayerId;
    const timer = setTimeout(() => this.skipIfStillInactive(room.roomCode, skippedPlayerId), this.options.timeoutMs);
    this.timers.set(room.roomCode, timer);
  }

  clear(roomCode: string): void {
    const timer = this.timers.get(roomCode);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(roomCode);
    }
  }

  clearAll(): void {
    for (const roomCode of this.timers.keys()) {
      this.clear(roomCode);
    }
  }

  private shouldSchedule(room: RoomState): boolean {
    if (room.status !== 'in_progress' || !room.game) {
      return false;
    }

    const currentPlayer = room.players.find((player) => player.playerId === room.game!.currentTurnPlayerId);
    if (!currentPlayer || currentPlayer.connected || isPlayerOut(currentPlayer)) {
      return false;
    }

    return room.players.some((player) => player.playerId !== currentPlayer.playerId && player.connected && !isPlayerOut(player));
  }

  private skipIfStillInactive(roomCode: string, playerId: string): void {
    this.timers.delete(roomCode);
    const room = this.options.getRoom(roomCode);
    if (!room || room.game?.currentTurnPlayerId !== playerId || !this.shouldSchedule(room)) {
      return;
    }

    const nextRoom = this.options.saveRoom(skipDisconnectedTurn(room, playerId));
    this.options.logger.log(createRoomLifecycleEntry('inactive_turn_skipped', nextRoom, { playerId, reason: 'turn-timeout' }));
    this.options.emitRoom(nextRoom);
    this.schedule(nextRoom);
  }
}
