# Vändtia rules used by this prototype

This document records the exact rule interpretation currently enforced by the shared engine in `packages/shared`.

## Lobby and setup

- A room supports the host-selected capacity: two or three players.
- A game can only start from the lobby once at least two players have joined and every joined player is marked ready.
- When the game starts, each player is dealt:
  - 3 face-down table cards
  - 3 face-up table cards
  - 3 hand cards
- Cards are dealt in that order for the whole table: all face-down cards first, then all face-up cards, then all hand cards.
- The starting player is the player with the lowest hand card after the opening deal.
- If multiple players share the same lowest hand rank, the lower seat number starts.

## Turn order and card sources

- Turns advance by seat order, skipping any player who has already cleared all of their cards.
- A player must use their cards in this order:
  1. hand
  2. face-up table cards
  3. face-down table cards
- Face-down cards stay hidden from every player, including their owner, until selected. Once hand and face-up cards are gone, the owner chooses one hidden face-down card to reveal.
- If the revealed face-down card is legal, it is played normally. If it is illegal, the revealed card and the active pile are added to that player's hand, the hand is sorted, the active pile is cleared, and the turn ends.
- After a legal hand play, the player draws back up to 3 hand cards while the draw pile still has cards.
- No automatic refill happens after face-up or face-down plays.

## Pile rule

- If the active pile is empty, any rank can be played.
- Otherwise, the next card must meet or beat the current minimum rank.
- The current minimum rank is normally the top card of the active pile.
- Rank comparison is numeric and ascending:
  - 2 is the lowest rank
  - 14 is Ace

## Special cards

### Two

- A 2 is always legal to play.
- After a 2 is played, the pile is reset and any rank can be played next.
- The 2 stays in the active pile until a later burn or pile pickup moves it away.

### Ten

- A 10 is always legal to play.
- After a 10 is played, the entire active pile is burned immediately.
- Burned cards move to the discarded pile and the next player starts on an empty pile.

## Blocked turns

- If a player is playing from hand, has no legal hand card, and the draw pile still has cards, they may draw exactly one chance card for that turn.
- After the chance draw, legality is checked again using the updated hand.
- If no legal play remains, or if the player had no legal play and could not draw a chance card, they must pick up the active pile.
- Picking up the pile adds every active-pile card to that player's hand, sorts the hand, clears the pile, and ends the turn immediately.

## Winning

- A player wins as soon as they have no hand cards, no face-up table cards, and no face-down table cards after completing a legal play.
- When that happens, the room moves to the finished state and no further turns are taken.
