import type { RoomState } from '@darkmode-vandtia/shared';
import type { RoomStore } from './storage.js';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;

export interface SocketPlayerDetails {
  roomCode: string;
  playerId: string;
}

export class RoomRegistry {
  readonly rooms: Map<string, RoomState>;
  private readonly playerSockets = new Map<string, string>();
  private readonly socketPlayers = new Map<string, SocketPlayerDetails>();

  constructor(private readonly roomStore: RoomStore) {
    this.rooms = roomStore.loadRooms();
  }

  getRoom(roomCode: string): RoomState {
    const room = this.rooms.get(roomCode.toUpperCase());

    if (!room) {
      throw new Error('Room not found.');
    }

    return room;
  }

  generateRoomCode(): string {
    while (true) {
      const roomCode = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]).join('');
      if (!this.rooms.has(roomCode)) {
        return roomCode;
      }
    }
  }

  getNextSeat(room: RoomState): number {
    for (let seat = 1; seat <= room.maxPlayers; seat += 1) {
      if (!room.players.some((player) => player.seat === seat)) {
        return seat;
      }
    }

    throw new Error('No seats are available in this room.');
  }

  private replaceRooms(rooms: Map<string, RoomState>): void {
    this.rooms.clear();
    for (const [roomCode, room] of rooms.entries()) {
      this.rooms.set(roomCode, room);
    }
  }

  saveRoom(room: RoomState): RoomState {
    this.rooms.set(room.roomCode, room);
    this.replaceRooms(this.roomStore.saveRooms(this.rooms));
    return this.rooms.get(room.roomCode) ?? room;
  }

  deleteRoom(roomCode: string): void {
    this.rooms.delete(roomCode.toUpperCase());
    this.replaceRooms(this.roomStore.saveRooms(this.rooms));
  }

  setPlayerSocket(roomCode: string, playerId: string, socketId: string): void {
    const previousSocketId = this.playerSockets.get(playerId);
    if (previousSocketId && previousSocketId !== socketId) {
      this.socketPlayers.delete(previousSocketId);
    }

    this.playerSockets.set(playerId, socketId);
    this.socketPlayers.set(socketId, { roomCode, playerId });
  }

  getSocketIdForPlayer(playerId: string): string | undefined {
    return this.playerSockets.get(playerId);
  }

  getSocketDetails(socketId: string): SocketPlayerDetails | undefined {
    return this.socketPlayers.get(socketId);
  }

  clearSocket(socketId: string): void {
    this.socketPlayers.delete(socketId);
  }

  clearPlayerSocket(playerId: string): void {
    this.playerSockets.delete(playerId);
  }

  isCurrentPlayerSocket(playerId: string, socketId: string): boolean {
    return this.playerSockets.get(playerId) === socketId;
  }

  markPlayerConnection(room: RoomState, playerId: string, connected: boolean): RoomState {
    const nextRoom = structuredClone(room);
    const player = nextRoom.players.find((entry) => entry.playerId === playerId);

    if (player) {
      player.connected = connected;
    }

    return this.saveRoom(nextRoom);
  }

  syncExistingPlayer(room: RoomState, sessionId: string): RoomState | null {
    const player = room.players.find((entry) => entry.sessionId === sessionId);
    if (!player) {
      return null;
    }

    return this.markPlayerConnection(room, player.playerId, true);
  }
}
