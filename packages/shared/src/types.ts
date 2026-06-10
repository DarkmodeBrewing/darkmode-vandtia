export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

export type CardRank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export type RoomStatus = 'lobby' | 'in_progress' | 'finished';

export type CardSource = 'hand' | 'faceUp' | 'faceDown';

export interface Card {
  id: string;
  rank: CardRank;
  suit: Suit;
  label: string;
}

export interface PlayerTableCards {
  faceDown: Card[];
  faceUp: Card[];
}

export interface PlayerState {
  playerId: string;
  sessionId: string;
  name: string;
  seat: number;
  ready: boolean;
  connected: boolean;
  hand: Card[];
  table: PlayerTableCards;
}

export interface TurnState {
  playerId: string;
  drewChanceCard: boolean;
  availableSource: CardSource;
}

export interface GameState {
  drawPile: Card[];
  activePile: Card[];
  discardedPile: Card[];
  currentTurnPlayerId: string;
  winnerPlayerId: string | null;
  turn: TurnState;
  startedAt: string;
}

export interface RoomState {
  roomCode: string;
  maxPlayers: number;
  status: RoomStatus;
  locked: boolean;
  players: PlayerState[];
  game: GameState | null;
  createdAt: string;
}

export interface PlayerActionState {
  availableSource: CardSource;
  legalCardIds: string[];
  canDrawChance: boolean;
  canPickupPile: boolean;
  topConstraintRank: CardRank | null;
}

export interface PlayerView {
  playerId: string;
  name: string;
  seat: number;
  ready: boolean;
  connected: boolean;
  hand: Card[];
  handCount: number;
  faceUp: Card[];
  faceDown: Card[];
  faceDownCount: number;
  isMe: boolean;
}

export interface RoomView {
  roomCode: string;
  status: RoomStatus;
  locked: boolean;
  maxPlayers: number;
  mePlayerId: string;
  players: PlayerView[];
  game: (GameState & {
    drawPileCount: number;
    discardedPileCount: number;
    actionState: PlayerActionState | null;
  }) | null;
}
