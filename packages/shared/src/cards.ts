import type { Card, CardRank, Suit } from './types';

export const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
export const RANKS: CardRank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const RANK_LABELS: Record<CardRank, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A'
};

const SUIT_SYMBOLS: Record<Suit, string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠'
};

export function createCard(rank: CardRank, suit: Suit): Card {
  return {
    id: `${rank}-${suit}`,
    rank,
    suit,
    label: `${RANK_LABELS[rank]}${SUIT_SYMBOLS[suit]}`
  };
}

export function createStandardDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => createCard(rank, suit)));
}

export function shuffleDeck(cards: Card[]): Card[] {
  const deck = [...cards];

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex]!, deck[index]!];
  }

  return deck;
}

export function sortCardsAscending(cards: Card[]): Card[] {
  return [...cards].sort((left, right) => left.rank - right.rank || left.suit.localeCompare(right.suit));
}
