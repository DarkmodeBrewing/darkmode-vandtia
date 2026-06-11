import { sortCardsAscending } from './cards';
import type { Card, CardSource, PlayerState } from './types';

export function getAvailableSource(player: PlayerState): CardSource {
  if (player.hand.length > 0) {
    return 'hand';
  }

  if (player.table.faceUp.length > 0) {
    return 'faceUp';
  }

  return 'faceDown';
}

export function getSourceCards(player: PlayerState, source: CardSource): Card[] {
  if (source === 'hand') {
    return player.hand;
  }

  return source === 'faceUp' ? player.table.faceUp : player.table.faceDown;
}

export function removeCard(cards: Card[], cardId: string): Card {
  const cardIndex = cards.findIndex((card) => card.id === cardId);

  if (cardIndex < 0) {
    throw new Error('Card not found in the active source.');
  }

  return cards.splice(cardIndex, 1)[0]!;
}

export function sortPlayerCards(player: PlayerState): void {
  player.hand = sortCardsAscending(player.hand);
  player.table.faceUp = sortCardsAscending(player.table.faceUp);
  player.table.faceDown = sortCardsAscending(player.table.faceDown);
}

export function isPlayerOut(player: PlayerState): boolean {
  return player.hand.length === 0 && player.table.faceUp.length === 0 && player.table.faceDown.length === 0;
}
