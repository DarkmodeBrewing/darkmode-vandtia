import { createStandardDeck, shuffleDeck, sortCardsAscending } from './cards';
import type { Card, CardRank, CardSource, PlayerActionState, PlayerState, RoomState, RoundReplayEntry } from './types';

const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;
const CARDS_PER_ZONE = 3;
const CARDS_PER_PLAYER = CARDS_PER_ZONE * 3;

function cloneRoom(room: RoomState): RoomState {
  return structuredClone(room);
}

function takeFromTop(deck: Card[], amount: number): Card[] {
  return deck.splice(0, amount);
}

function getPlayer(room: RoomState, playerId: string): PlayerState {
  const player = room.players.find((entry) => entry.playerId === playerId);

  if (!player) {
    throw new Error('Player not found.');
  }

  return player;
}

function getSourceCards(player: PlayerState, source: CardSource): Card[] {
  if (source === 'hand') {
    return player.hand;
  }

  return source === 'faceUp' ? player.table.faceUp : player.table.faceDown;
}

function removeCard(cards: Card[], cardId: string): Card {
  const cardIndex = cards.findIndex((card) => card.id === cardId);

  if (cardIndex < 0) {
    throw new Error('Card not found in the active source.');
  }

  return cards.splice(cardIndex, 1)[0]!;
}

function sortPlayerCards(player: PlayerState): void {
  player.hand = sortCardsAscending(player.hand);
  player.table.faceUp = sortCardsAscending(player.table.faceUp);
  player.table.faceDown = sortCardsAscending(player.table.faceDown);
}

export function createRoomState(roomCode: string): RoomState {
  return {
    roomCode,
    maxPlayers: MAX_PLAYERS,
    status: 'lobby',
    locked: false,
    players: [],
    game: null,
    createdAt: new Date().toISOString()
  };
}

export function createEmptyPlayerState(playerId: string, sessionId: string, name: string, seat: number): PlayerState {
  return {
    playerId,
    sessionId,
    name,
    seat,
    ready: false,
    connected: true,
    hand: [],
    table: {
      faceDown: [],
      faceUp: []
    }
  };
}

export function getAvailableSource(player: PlayerState): CardSource {
  if (player.hand.length > 0) {
    return 'hand';
  }

  if (player.table.faceUp.length > 0) {
    return 'faceUp';
  }

  return 'faceDown';
}

export function getTopConstraintRank(activePile: Card[]): CardRank | null {
  if (activePile.length === 0) {
    return null;
  }

  const topCard = activePile[activePile.length - 1]!;
  return topCard.rank === 2 ? null : topCard.rank;
}

export function canPlayRank(rank: CardRank, topConstraintRank: CardRank | null): boolean {
  if (rank === 2 || rank === 10) {
    return true;
  }

  return topConstraintRank === null || rank >= topConstraintRank;
}

function getAlivePlayers(room: RoomState): PlayerState[] {
  return room.players.filter((player) => !isPlayerOut(player));
}

export function isPlayerOut(player: PlayerState): boolean {
  return player.hand.length === 0 && player.table.faceUp.length === 0 && player.table.faceDown.length === 0;
}

function getNextActivePlayerId(room: RoomState, currentPlayerId: string): string {
  const alivePlayers = getAlivePlayers(room).sort((left, right) => left.seat - right.seat);
  const currentIndex = alivePlayers.findIndex((player) => player.playerId === currentPlayerId);

  if (currentIndex < 0) {
    throw new Error('Current player is not active.');
  }

  return alivePlayers[(currentIndex + 1) % alivePlayers.length]!.playerId;
}

function getReplay(room: RoomState): RoundReplayEntry[] {
  if (!room.game) {
    return [];
  }

  room.game.replay ??= [];
  return room.game.replay;
}

function appendReplayEntry(
  room: RoomState,
  player: PlayerState,
  entry: Pick<RoundReplayEntry, 'type' | 'source' | 'cards' | 'pileCards' | 'activePileCount' | 'drawPileCount'>
): void {
  const replay = getReplay(room);
  const sequence = replay.length + 1;
  replay.push({
    id: `${room.roomCode}-${sequence}`,
    sequence,
    playerId: player.playerId,
    playerName: player.name,
    createdAt: new Date().toISOString(),
    ...entry
  });
}

function drawUpToThree(player: PlayerState, drawPile: Card[]): void {
  while (player.hand.length < CARDS_PER_ZONE && drawPile.length > 0) {
    player.hand.push(...takeFromTop(drawPile, 1));
  }

  sortPlayerCards(player);
}

export function addPlayerToRoom(room: RoomState, player: PlayerState): RoomState {
  if (room.locked || room.status !== 'lobby') {
    throw new Error('The game has already started.');
  }

  if (room.players.length >= room.maxPlayers) {
    throw new Error('The room is already full.');
  }

  const nextRoom = cloneRoom(room);
  nextRoom.players.push(player);
  nextRoom.players.sort((left, right) => left.seat - right.seat);
  return nextRoom;
}

export function canStartGame(room: RoomState): boolean {
  return room.status === 'lobby' && room.players.length >= MIN_PLAYERS && room.players.every((player) => player.ready);
}

export function startGame(room: RoomState, options?: { deck?: Card[] }): RoomState {
  if (!canStartGame(room)) {
    throw new Error('At least two ready players are required to start the game.');
  }

  const nextRoom = cloneRoom(room);
  const deck = options?.deck ? [...options.deck] : shuffleDeck(createStandardDeck());

  if (deck.length < nextRoom.players.length * CARDS_PER_PLAYER) {
    throw new Error('Not enough cards in the deck to start the game.');
  }

  for (const player of nextRoom.players) {
    player.hand = [];
    player.table.faceUp = [];
    player.table.faceDown = [];
  }

  for (let round = 0; round < CARDS_PER_ZONE; round += 1) {
    for (const player of nextRoom.players) {
      player.table.faceDown.push(...takeFromTop(deck, 1));
    }
  }

  for (let round = 0; round < CARDS_PER_ZONE; round += 1) {
    for (const player of nextRoom.players) {
      player.table.faceUp.push(...takeFromTop(deck, 1));
    }
  }

  for (let round = 0; round < CARDS_PER_ZONE; round += 1) {
    for (const player of nextRoom.players) {
      player.hand.push(...takeFromTop(deck, 1));
      sortPlayerCards(player);
    }
  }

  const sortedPlayers = [...nextRoom.players].sort((left, right) => left.seat - right.seat);
  const startingPlayer = sortedPlayers.reduce((best, candidate) => {
    const bestLowestRank = best.hand[0]!.rank;
    const candidateLowestRank = candidate.hand[0]!.rank;
    if (candidateLowestRank < bestLowestRank) {
      return candidate;
    }

    if (candidateLowestRank === bestLowestRank && candidate.seat < best.seat) {
      return candidate;
    }

    return best;
  });

  nextRoom.status = 'in_progress';
  nextRoom.locked = true;
  nextRoom.game = {
    drawPile: deck,
    activePile: [],
    discardedPile: [],
    currentTurnPlayerId: startingPlayer.playerId,
    winnerPlayerId: null,
    turn: {
      playerId: startingPlayer.playerId,
      drewChanceCard: false,
      availableSource: getAvailableSource(startingPlayer)
    },
    startedAt: new Date().toISOString(),
    replay: []
  };

  return nextRoom;
}

function assertCurrentTurn(room: RoomState, playerId: string): { player: PlayerState; game: NonNullable<RoomState['game']> } {
  if (!room.game) {
    throw new Error('The game has not started yet.');
  }

  if (room.status !== 'in_progress') {
    throw new Error('The game is not active.');
  }

  if (room.game.currentTurnPlayerId !== playerId) {
    throw new Error('It is not your turn.');
  }

  return {
    player: getPlayer(room, playerId),
    game: room.game
  };
}

function completeTurn(room: RoomState, playerId: string): RoomState {
  if (!room.game) {
    return room;
  }

  const currentPlayer = getPlayer(room, playerId);

  if (isPlayerOut(currentPlayer)) {
    room.status = 'finished';
    room.game.winnerPlayerId = playerId;
    return room;
  }

  const nextPlayerId = getNextActivePlayerId(room, playerId);
  const nextPlayer = getPlayer(room, nextPlayerId);
  room.game.currentTurnPlayerId = nextPlayerId;
  room.game.turn = {
    playerId: nextPlayerId,
    drewChanceCard: false,
    availableSource: getAvailableSource(nextPlayer)
  };

  return room;
}

export function getPlayerActionState(room: RoomState, playerId: string): PlayerActionState | null {
  if (!room.game || room.status !== 'in_progress' || room.game.currentTurnPlayerId !== playerId) {
    return null;
  }

  const player = getPlayer(room, playerId);
  const availableSource = getAvailableSource(player);
  const cards = getSourceCards(player, availableSource);
  const topConstraintRank = getTopConstraintRank(room.game.activePile);
  const legalCardIds = availableSource === 'faceDown'
    ? cards.map((card) => card.id)
    : cards.filter((card) => canPlayRank(card.rank, topConstraintRank)).map((card) => card.id);
  const canDrawChance =
    availableSource === 'hand' && room.game.drawPile.length > 0 && !room.game.turn.drewChanceCard && legalCardIds.length === 0;
  const canPickupPile = room.game.activePile.length > 0 && legalCardIds.length === 0 && !canDrawChance;

  return {
    availableSource,
    legalCardIds,
    canDrawChance,
    canPickupPile,
    topConstraintRank
  };
}

export function playCard(room: RoomState, playerId: string, cardId: string): RoomState {
  const nextRoom = cloneRoom(room);
  const { player, game } = assertCurrentTurn(nextRoom, playerId);
  const source = getAvailableSource(player);
  const card = removeCard(getSourceCards(player, source), cardId);

  const isLegalPlay = canPlayRank(card.rank, getTopConstraintRank(game.activePile));

  if (!isLegalPlay && source !== 'faceDown') {
    throw new Error('That card cannot be played right now.');
  }

  game.activePile.push(card);

  if (!isLegalPlay) {
    const pileCards = [...game.activePile];
    player.hand.push(...pileCards);
    player.hand = sortCardsAscending(player.hand);
    game.activePile = [];
    appendReplayEntry(nextRoom, player, {
      type: 'illegal_reveal',
      source,
      cards: [card],
      pileCards,
      activePileCount: 0,
      drawPileCount: game.drawPile.length
    });
    return completeTurn(nextRoom, playerId);
  }

  const playedPileCount = game.activePile.length;
  const burnedCards = card.rank === 10 ? [...game.activePile] : [];

  if (card.rank === 10) {
    game.discardedPile.push(...burnedCards);
    game.activePile = [];
  }

  if (source === 'hand') {
    drawUpToThree(player, game.drawPile);
  } else {
    sortPlayerCards(player);
  }

  appendReplayEntry(nextRoom, player, {
    type: card.rank === 10 ? 'burn' : 'play',
    source,
    cards: [card],
    pileCards: burnedCards,
    activePileCount: card.rank === 10 ? 0 : playedPileCount,
    drawPileCount: game.drawPile.length
  });

  return completeTurn(nextRoom, playerId);
}

export function drawChanceCard(room: RoomState, playerId: string): RoomState {
  const nextRoom = cloneRoom(room);
  const { player, game } = assertCurrentTurn(nextRoom, playerId);
  const actionState = getPlayerActionState(nextRoom, playerId);

  if (!actionState?.canDrawChance) {
    throw new Error('A chance card cannot be drawn right now.');
  }

  const drawnCards = takeFromTop(game.drawPile, 1);
  player.hand.push(...drawnCards);
  sortPlayerCards(player);
  appendReplayEntry(nextRoom, player, {
    type: 'chance_draw',
    source: 'hand',
    cards: [],
    pileCards: [],
    activePileCount: game.activePile.length,
    drawPileCount: game.drawPile.length
  });
  game.turn = {
    ...game.turn,
    drewChanceCard: true,
    availableSource: getAvailableSource(player)
  };

  return nextRoom;
}

export function pickupPile(room: RoomState, playerId: string): RoomState {
  const nextRoom = cloneRoom(room);
  const { player, game } = assertCurrentTurn(nextRoom, playerId);
  const actionState = getPlayerActionState(nextRoom, playerId);

  if (!actionState?.canPickupPile) {
    throw new Error('The pile cannot be picked up right now.');
  }

  const pileCards = [...game.activePile];
  player.hand.push(...pileCards);
  player.hand = sortCardsAscending(player.hand);
  game.activePile = [];
  appendReplayEntry(nextRoom, player, {
    type: 'pickup',
    source: actionState.availableSource,
    cards: [],
    pileCards,
    activePileCount: 0,
    drawPileCount: game.drawPile.length
  });

  return completeTurn(nextRoom, playerId);
}
