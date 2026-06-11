import type { Card, CardSource, RoomView, RoundReplayEntry } from '@darkmode-vandtia/shared';

export function getRoomStatusLabel(room: RoomView): string {
  switch (room.status) {
    case 'lobby':
      return 'Lobby';
    case 'finished':
      return 'Finished';
    default:
      return 'In progress';
  }
}

export function getSourceLabel(source: CardSource | null): string {
  switch (source) {
    case 'faceUp':
      return 'face-up';
    case 'faceDown':
      return 'face-down';
    case 'hand':
      return 'hand';
    default:
      return 'table';
  }
}

export function getCardListLabel(cards: Card[]): string {
  return cards.map((card) => card.label).join(', ');
}

export function getCountLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function getReplayEntryText(entry: RoundReplayEntry): string {
  const source = getSourceLabel(entry.source);
  const cards = getCardListLabel(entry.cards);
  const pileCount = getCountLabel(entry.pileCards.length, 'pile card');

  switch (entry.type) {
    case 'burn':
      return `${entry.playerName} played ${cards} from ${source} and burned ${pileCount}.`;
    case 'chance_draw':
      return `${entry.playerName} drew one chance card.`;
    case 'illegal_reveal':
      return `${entry.playerName} revealed ${cards} from face-down and picked up ${pileCount}.`;
    case 'pickup':
      return `${entry.playerName} picked up ${pileCount}.`;
    default:
      return `${entry.playerName} played ${cards} from ${source}.`;
  }
}

export function getMinimumRankLabel(room: RoomView): string {
  const topCard = room.game?.activePile.at(-1);

  if (!topCard || topCard.rank === 2) {
    return 'Open';
  }

  return `${topCard.label}+`;
}
