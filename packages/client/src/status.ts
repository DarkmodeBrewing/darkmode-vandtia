import type { CardSource, RoomView } from '@darkmode-vandtia/shared';

export type SessionRestoreState = 'idle' | 'restoring' | 'failed' | 'restored';
export type StatusTone = 'info' | 'warning' | 'success';

export interface StatusSummary {
  tone: StatusTone;
  title: string;
  detail: string;
  bullets: string[];
}

interface StatusSummaryInput {
  connected: boolean;
  room: RoomView | null;
  sessionRestoreState: SessionRestoreState;
  sessionRoomCode: string | null;
}

function describeSource(source: CardSource): string {
  switch (source) {
    case 'faceUp':
      return 'face-up table';
    case 'faceDown':
      return 'face-down table';
    default:
      return 'hand';
  }
}

function getConstraintSummary(room: RoomView): string {
  const game = room.game;

  if (!game || game.activePile.length === 0) {
    return 'The pile is open, so any rank can be played.';
  }

  if (game.actionState?.topConstraintRank === null) {
    return 'A two reset the minimum rank, so any card can be played.';
  }

  return `Play ${game.activePile.at(-1)?.label ?? game.actionState?.topConstraintRank ?? 'the top card'} or higher.`;
}

function getWaitingPlayers(room: RoomView): string[] {
  return room.players.filter((player) => !player.ready).map((player) => player.name);
}

export function getStatusSummary({ connected, room, sessionRestoreState, sessionRoomCode }: StatusSummaryInput): StatusSummary {
  if (!connected) {
    return {
      tone: 'warning',
      title: 'Offline.',
      detail: sessionRoomCode
        ? `Reconnect to restore your saved seat in room ${sessionRoomCode}.`
        : 'Reconnect before creating or joining a room.',
      bullets: ['Create and join actions stay disabled until the socket reconnects.']
    };
  }

  if (!room) {
    if (sessionRestoreState === 'restoring' && sessionRoomCode) {
      return {
        tone: 'info',
        title: 'Restoring saved session.',
        detail: `Trying to reconnect you to room ${sessionRoomCode}.`,
        bullets: ['Keep this tab open while the room state syncs back in.']
      };
    }

    if (sessionRestoreState === 'failed' && sessionRoomCode) {
      return {
        tone: 'warning',
        title: 'Saved session needs attention.',
        detail: `Room ${sessionRoomCode} could not be restored automatically.`,
        bullets: ['Clear the saved session if you want to create a fresh room or join again manually.']
      };
    }

    return {
      tone: 'info',
      title: 'Ready for a new room.',
      detail: 'Create a room or join an existing code to begin.',
      bullets: ['Names and room codes are required before you can continue.']
    };
  }

  const me = room.players.find((player) => player.isMe) ?? null;

  if (room.status === 'lobby') {
    const readyPlayers = room.players.filter((player) => player.ready).length;
    const waitingPlayers = getWaitingPlayers(room);

    if (room.players.length < 2) {
      return {
        tone: 'info',
        title: 'Waiting for more players.',
        detail: 'At least two players are needed before the game can start.',
        bullets: [`${room.players.length}/${room.maxPlayers} seats are filled.`, `Share room code ${room.roomCode} with another player.`]
      };
    }

    if (waitingPlayers.length === 0) {
      return {
        tone: 'success',
        title: 'Everyone is ready.',
        detail: me?.isHost ? 'Start the game when everyone is ready.' : 'The host can start the game when everyone is ready.',
        bullets: [`${readyPlayers}/${room.players.length} joined players are ready.`]
      };
    }

    return {
      tone: me?.ready ? 'info' : 'warning',
      title: me?.ready ? 'Waiting on ready checks.' : 'You still need to ready up.',
      detail: waitingPlayers.length === 1 ? `${waitingPlayers[0]} is not ready yet.` : `${waitingPlayers.join(', ')} are not ready yet.`,
      bullets: [`${readyPlayers}/${room.players.length} joined players are ready.`, me?.isHost ? 'You can start once every joined player is marked ready.' : 'The host can start once every joined player is marked ready.']
    };
  }

  if (!room.game) {
    return {
      tone: 'info',
      title: 'Waiting for game state.',
      detail: 'The room is active, but the next game update has not arrived yet.',
      bullets: []
    };
  }

  const winner = room.game.winnerPlayerId
    ? room.players.find((player) => player.playerId === room.game?.winnerPlayerId)?.name ?? 'Unknown player'
    : null;

  if (room.status === 'finished' || winner) {
    return {
      tone: 'success',
      title: 'Game finished.',
      detail: winner ? `${winner} cleared every card and won the round.` : 'The round has ended.',
      bullets: [me?.isHost ? 'Set up the next round to bring everyone back to the lobby.' : 'Wait for the host to set up the next round, or leave when you are done.']
    };
  }

  const activePlayerName = room.players.find((player) => player.playerId === room.game?.currentTurnPlayerId)?.name ?? 'Another player';
  const actionState = room.game.actionState;
  const isMyTurn = room.game.currentTurnPlayerId === room.mePlayerId;

  if (!isMyTurn) {
    return {
      tone: 'info',
      title: `Waiting for ${activePlayerName}.`,
      detail: getConstraintSummary(room),
      bullets: ['Your controls will unlock automatically when the turn reaches you.']
    };
  }

  if (!actionState) {
    return {
      tone: 'warning',
      title: 'Your turn is loading.',
      detail: 'A fresh action state is still syncing from the server.',
      bullets: []
    };
  }

  if (actionState.legalCardIds.length > 0) {
    return {
      tone: 'success',
      title: 'Your turn.',
      detail: actionState.availableSource === 'faceDown'
        ? 'Choose one face-down table card to reveal.'
        : `Play from your ${describeSource(actionState.availableSource)} cards.`,
      bullets: [getConstraintSummary(room)]
    };
  }

  if (actionState.canDrawChance) {
    return {
      tone: 'warning',
      title: 'No legal hand card.',
      detail: 'Draw one chance card. If it still cannot be played, you will have to pick up the pile.',
      bullets: ['You can only draw one chance card per turn.']
    };
  }

  if (actionState.canPickupPile) {
    return {
      tone: 'warning',
      title: 'Pile pickup required.',
      detail: 'No legal play remains, so you must collect the active pile into your hand.',
      bullets: ['Picking up the pile ends your turn immediately.']
    };
  }

  return {
    tone: 'info',
    title: 'Waiting for your next action.',
    detail: getConstraintSummary(room),
    bullets: []
  };
}
