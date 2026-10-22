"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  supabase,
} from "@/lib/supabase";

import {
  getNextSecretWord,
} from "@/lib/word-engine";

type LobbyView =
  | "menu"
  | "create"
  | "join"
  | "lobby";

type GameMode =
  | "default"
  | "custom"
  | "chaos";

type Room = {
  id: string;

  code: string;

  host_user_id: string;

  status:
    | "lobby"
    | "playing"
    | "finished";

  mode: GameMode;

  imposter_count: number;

  elimination_mode: boolean;

  private_phone_voting: boolean;

  random_clue_order: boolean;

  allow_self_vote: boolean;

  voting_round_limit: number;

  settings_revision: number;

  game_phase:
    | "lobby"
    | "preparing"
    | "role_reveal"
    | "clue"
    | "voting"
    | "result"
    | "finished";

  game_revision: number;

  started_at: string | null;

  chat_enabled: boolean;

  voice_chat_enabled: boolean;

  clue_timer_enabled: boolean;

  clue_time_seconds: number;

  clue_miss_penalty_enabled: boolean;

  clue_rotations: number;

  clue_round_number: number;

  clue_turn_index: number;

  clue_turn_started_at: string | null;

  clue_session_complete: boolean;

  voting_round_number: number;

  vote_ballot_number: number;

  vote_stage:
    | "idle"
    | "open"
    | "tie_break"
    | "result";

  votes_submitted_count: number;

  votes_required_count: number;

  vote_result_player_id: string | null;

  vote_result_was_imposter: boolean | null;

  vote_winner:
    | "players"
    | "imposters"
    | null;

  imposters_revealed: boolean;

  clue_cycle_end_round: number;

  created_at: string;

  updated_at: string;
};

type RoomPlayer = {
  id: string;

  room_id: string;

  user_id: string;

  name: string;

  is_host: boolean;

  is_spectator: boolean;

  joined_at: string;
};

type PrivateRole = {
  id: string;

  room_id: string;

  room_player_id: string;

  user_id: string;

  game_revision: number;

  role:
    | "player"
    | "imposter";

  secret_word: string | null;

  is_word_provider: boolean;

  created_at: string;
};

type ClueOrderItem = {
  id: string;

  room_id: string;

  game_revision: number;

  round_number: number;

  turn_position: number;

  room_player_id: string;

  user_id: string;

  turn_status:
    | "pending"
    | "submitted"
    | "spoken"
    | "missed";

  completed_at: string | null;

  penalty_applied: boolean;

  created_at: string;
};

type RoomClue = {
  id: string;

  room_id: string;

  game_revision: number;

  round_number: number;

  room_player_id: string;

  user_id: string;

  clue_text: string;

  submitted_at: string;

  edited_at: string | null;
};

type VoteCandidate = {
  room_player_id: string;
};

type RevealedImposter = {
  room_player_id: string;
};

type RecentGamePlayer = {
  name: string;
  role:
    | "player"
    | "imposter"
    | "spectator";
  eliminated: boolean;
};

type RecentGameClue = {
  player: string;
  round: number;
  clue: string;
  edited: boolean;
};

type RecentGamePenalty = {
  player: string;
  count: number;
};

type RecentGame = {
  id: string;
  room_id: string;
  room_code: string;
  game_revision: number;
  completed_at: string;
  winner:
    | "players"
    | "imposters"
    | null;
  secret_word: string | null;
  imposter_names: string[];
  players: RecentGamePlayer[];
  clues: RecentGameClue[];
  penalties: RecentGamePenalty[];
  last_vote_player: string | null;
  last_vote_was_imposter: boolean | null;
  mode: GameMode;
  chat_enabled: boolean;
  online_voting: boolean;
};

type VoiceParticipant = {
  userId: string;
  name: string;
  muted: boolean;
};

type RemoteVoiceStream = {
  userId: string;
  stream: MediaStream;
};

type VoiceSignalPayload = {
  from: string;
  to: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

function RemoteVoiceAudio({
  stream,
  muted,
  userId,
}: {
  stream: MediaStream;
  muted: boolean;
  userId: string;
}) {
  const audioRef =
    useRef<HTMLAudioElement | null>(
      null
    );

  useEffect(() => {
    const audio =
      audioRef.current;

    if (!audio) {
      return;
    }

    if (
      audio.srcObject !==
      stream
    ) {
      audio.srcObject =
        stream;
    }

    audio.muted =
      muted;

    void audio.play().catch(
      () => {
        // Some mobile browsers wait for the user's Join Voice tap.
      }
    );
  }, [stream, muted]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      muted={muted}
      data-imposter-voice-audio="true"
      data-imposter-voice-user={userId}
      className="hidden"
    />
  );
}

type RoomSettingsPatch =
  Partial<
    Pick<
      Room,
      | "mode"
      | "imposter_count"
      | "elimination_mode"
      | "private_phone_voting"
      | "random_clue_order"
      | "allow_self_vote"
      | "voting_round_limit"
    >
  >;

type ClueSettingsPatch =
  Partial<
    Pick<
      Room,
      | "chat_enabled"
      | "clue_timer_enabled"
      | "clue_time_seconds"
      | "clue_miss_penalty_enabled"
      | "clue_rotations"
    >
  >;

const SAVED_PLAYERS_KEY =
  "imposter-saved-players-v1";

const MULTIPLAYER_NAME_KEY =
  "imposter-multiplayer-name-v1";

const ACTIVE_ROOM_KEY =
  "imposter-active-room-v1";

function cleanName(
  value: string
) {
  return value
    .trim()
    .replace(
      /\s+/g,
      " "
    );
}

function randomInt(
  maxExclusive: number
) {
  if (
    maxExclusive <= 1
  ) {
    return 0;
  }

  const values =
    new Uint32Array(1);

  crypto.getRandomValues(
    values
  );

  return (
    values[0] %
    maxExclusive
  );
}

function randomBoolean() {
  return (
    randomInt(2) === 1
  );
}

function getMaxImposters(
  playerCount: number
) {
  if (
    playerCount < 3
  ) {
    return 1;
  }

  return Math.max(
    1,
    Math.floor(
      (playerCount - 1) /
        2
    )
  );
}

function getRecommendedImposters(
  playerCount: number
) {
  const maximum =
    getMaxImposters(
      playerCount
    );

  const recommended =
    Math.max(
      1,
      Math.round(
        playerCount / 5
      )
    );

  return Math.min(
    recommended,
    maximum
  );
}

function getChaosVotingMaximum(
  playerCount: number,
  imposterCount: number
) {
  return Math.max(
    imposterCount,
    Math.min(
      30,
      Math.max(
        imposterCount + 3,
        Math.ceil(
          playerCount / 2
        )
      )
    )
  );
}

function getFriendlyError(
  message: string
) {
  if (
    message.includes(
      "ROOM_NOT_FOUND"
    )
  ) {
    return "Room not found. Check the room code.";
  }

  if (
    message.includes(
      "ROOM_NOT_OPEN"
    )
  ) {
    return "That room is no longer open for changes.";
  }

  if (
    message.includes(
      "NAME_TAKEN"
    )
  ) {
    return "That name is already being used in this room.";
  }

  if (
    message.includes(
      "INVALID_NAME"
    )
  ) {
    return "Enter a player name between 1 and 24 characters.";
  }

  if (
    message.includes(
      "NOT_AUTHENTICATED"
    )
  ) {
    return "Your multiplayer session could not be created. Refresh and try again.";
  }

  if (
    message.includes(
      "NOT_HOST"
    )
  ) {
    return "Only the room host can change this.";
  }

  if (
    message.includes(
      "INVALID_IMPOSTER_COUNT"
    )
  ) {
    return "That number of Imposters is not valid for the current number of players.";
  }

  if (
    message.includes(
      "INVALID_VOTING_LIMIT"
    )
  ) {
    return "The voting-round limit is not valid.";
  }

  if (
    message.includes(
      "INVALID_MODE"
    )
  ) {
    return "Invalid game mode.";
  }

  if (
    message.includes(
      "GAME_ALREADY_STARTED"
    )
  ) {
    return "This game has already started.";
  }

  if (
    message.includes(
      "NOT_ENOUGH_PLAYERS"
    )
  ) {
    return "At least 3 players are required to start.";
  }

  if (
    message.includes(
      "NO_WORD_PROVIDER"
    )
  ) {
    return "The secret word could not be prepared. Try creating a fresh room.";
  }

  if (
    message.includes(
      "NOT_WORD_PROVIDER"
    )
  ) {
    return "This device is not allowed to prepare the secret word.";
  }

  if (
    message.includes(
      "INVALID_WORD"
    )
  ) {
    return "The selected secret word was invalid. Try again.";
  }

  if (
    message.includes(
      "WORD_ALREADY_SET"
    )
  ) {
    return "The secret word has already been prepared.";
  }

  if (
    message.includes(
      "INVALID_GAME_PHASE"
    )
  ) {
    return "That action is not available in the current game phase.";
  }

  if (
    message.includes(
      "NOT_YOUR_TURN"
    )
  ) {
    return "It is not your turn to send a clue.";
  }

  if (
    message.includes(
      "CLUE_ALREADY_SUBMITTED"
    )
  ) {
    return "You already submitted your clue for this round.";
  }

  if (
    message.includes(
      "INVALID_CLUE"
    )
  ) {
    return "Enter a clue between 1 and 80 characters.";
  }

  if (
    message.includes(
      "CLUE_ORDER_NOT_READY"
    )
  ) {
    return "The clue order is not ready yet. Try again.";
  }


  if (
    message.includes(
      "INVALID_CLUE_TIME"
    )
  ) {
    return "Enter a clue timer between 1 and 3600 seconds.";
  }

  if (
    message.includes(
      "INVALID_CLUE_ROTATIONS"
    )
  ) {
    return "Choose between 1 and 10 clue rotations.";
  }

  if (
    message.includes(
      "INVALID_CLUE"
    )
  ) {
    return "Enter a clue between 1 and 80 characters.";
  }

  if (
    message.includes(
      "NOT_YOUR_TURN"
    )
  ) {
    return "It is not your clue turn yet.";
  }

  if (
    message.includes(
      "CHAT_DISABLED"
    )
  ) {
    return "Typed clues are disabled for this game.";
  }

  if (
    message.includes(
      "CHAT_ENABLED"
    )
  ) {
    return "This game is using typed clues.";
  }

  if (
    message.includes(
      "CLUE_ALREADY_SUBMITTED"
    )
  ) {
    return "Your clue for this turn was already submitted. Use Edit if you want to change it.";
  }

  if (
    message.includes(
      "TOO_MANY_CLUE_ROUNDS"
    )
  ) {
    return "The clue-round limit has been reached.";
  }

  if (
    message.includes(
      "VOTING_NOT_OPEN"
    )
  ) {
    return "Voting is not open right now.";
  }

  if (
    message.includes(
      "NOT_ELIGIBLE_TO_VOTE"
    )
  ) {
    return "Spectators cannot vote.";
  }

  if (
    message.includes(
      "INVALID_VOTE_TARGET"
    )
  ) {
    return "That player cannot be voted for in this ballot.";
  }

  if (
    message.includes(
      "SELF_VOTE_DISABLED"
    )
  ) {
    return "Self-voting is disabled.";
  }

  if (
    message.includes(
      "GAME_ALREADY_FINISHED"
    )
  ) {
    return "This game has already finished.";
  }

  if (
    message.includes(
      "VOICE_REQUIRES_CHAT"
    )
  ) {
    return "Turn Chat ON before enabling Voice Chat.";
  }

  return message;
}

function getErrorMessage(
  error: unknown,
  fallback: string
) {
  if (
    error &&
    typeof error ===
      "object" &&
    "message" in error
  ) {
    return String(
      (
        error as {
          message?: unknown;
        }
      ).message
    );
  }

  if (
    error instanceof
    Error
  ) {
    return error.message;
  }

  return fallback;
}

export default function MultiplayerPage() {
  const [
    view,
    setView,
  ] =
    useState<LobbyView>(
      "menu"
    );

  const [
    authReady,
    setAuthReady,
  ] =
    useState(false);

  const [
    userId,
    setUserId,
  ] =
    useState("");

  const [
    playerName,
    setPlayerName,
  ] =
    useState("");

  const [
    joinCode,
    setJoinCode,
  ] =
    useState("");

  const [
    room,
    setRoom,
  ] =
    useState<
      Room | null
    >(null);

  const [
    roomPlayers,
    setRoomPlayers,
  ] =
    useState<
      RoomPlayer[]
    >([]);

  const [
    savedNames,
    setSavedNames,
  ] =
    useState<string[]>(
      []
    );

  const [
    recentGames,
    setRecentGames,
  ] =
    useState<RecentGame[]>(
      []
    );

  const [
    recentGamesLoading,
    setRecentGamesLoading,
  ] =
    useState(false);

  const [
    expandedRecentGameId,
    setExpandedRecentGameId,
  ] =
    useState<string | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    settingsSaving,
    setSettingsSaving,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    realtimeStatus,
    setRealtimeStatus,
  ] =
    useState(
      "Connecting"
    );

  const [
    codeCopied,
    setCodeCopied,
  ] =
    useState(false);

  const [
    shareDone,
    setShareDone,
  ] =
    useState(false);

  const [
    privateRole,
    setPrivateRole,
  ] =
    useState<
      PrivateRole | null
    >(null);

  const [
    roleRevealed,
    setRoleRevealed,
  ] =
    useState(false);

  const [
    wordSubmitting,
    setWordSubmitting,
  ] =
    useState(false);

  const [
    clueOrder,
    setClueOrder,
  ] =
    useState<
      ClueOrderItem[]
    >([]);

  const [
    clues,
    setClues,
  ] =
    useState<
      RoomClue[]
    >([]);

  const [
    clueText,
    setClueText,
  ] =
    useState("");

  const [
    clueBusy,
    setClueBusy,
  ] =
    useState(false);

  const [
    editingClueId,
    setEditingClueId,
  ] =
    useState<string | null>(
      null
    );

  const [
    editingClueText,
    setEditingClueText,
  ] =
    useState("");

  const [
    expandedCluePlayerId,
    setExpandedCluePlayerId,
  ] =
    useState<string | null>(
      null
    );

  const [
    clueSecondsLeft,
    setClueSecondsLeft,
  ] =
    useState<number | null>(
      null
    );

  const [
    clueTimerInput,
    setClueTimerInput,
  ] =
    useState("20");

  const [
    votingBusy,
    setVotingBusy,
  ] =
    useState(false);

  const [
    myVoteTargetId,
    setMyVoteTargetId,
  ] =
    useState<string | null>(
      null
    );

  const [
    voteCandidateIds,
    setVoteCandidateIds,
  ] =
    useState<string[]>([]);

  const [
    revealedImposterIds,
    setRevealedImposterIds,
  ] =
    useState<string[]>([]);

  const [
    wordPeekOpen,
    setWordPeekOpen,
  ] =
    useState(false);

  const [
    voiceActive,
    setVoiceActive,
  ] =
    useState(false);

  const [
    voiceBusy,
    setVoiceBusy,
  ] =
    useState(false);

  const [
    voiceMuted,
    setVoiceMuted,
  ] =
    useState(true);

  const [
    voiceSpeakerMuted,
    setVoiceSpeakerMuted,
  ] =
    useState(false);

  const [
    locallyMutedVoiceUsers,
    setLocallyMutedVoiceUsers,
  ] =
    useState<string[]>(
      []
    );

  const [
    voiceStatus,
    setVoiceStatus,
  ] =
    useState("Off");

  const [
    voiceError,
    setVoiceError,
  ] =
    useState("");

  const [
    voiceParticipants,
    setVoiceParticipants,
  ] =
    useState<VoiceParticipant[]>(
      []
    );

  const [
    remoteVoiceStreams,
    setRemoteVoiceStreams,
  ] =
    useState<RemoteVoiceStream[]>(
      []
    );

  useEffect(() => {
    if (room) {
      setClueTimerInput(
        String(
          room.clue_time_seconds
        )
      );
    }
  }, [
    room?.clue_time_seconds,
  ]);

  const expireAttemptRef =
    useRef({
      turnKey: "",
      lastAttemptAt: 0,
      inFlight: false,
    });

  const wordSubmissionRevisionRef =
    useRef<number | null>(
      null
    );

  const voiceChannelRef =
    useRef<
      ReturnType<
        typeof supabase.channel
      > | null
    >(null);

  const voiceLocalStreamRef =
    useRef<MediaStream | null>(
      null
    );

  const voicePeersRef =
    useRef<
      Map<
        string,
        RTCPeerConnection
      >
    >(new Map());

  const voicePendingIceRef =
    useRef<
      Map<
        string,
        RTCIceCandidateInit[]
      >
    >(new Map());

  const voiceOfferInFlightRef =
    useRef<Set<string>>(
      new Set()
    );

  const voiceIncomingOfferInFlightRef =
    useRef<Set<string>>(
      new Set()
    );

  // If a microphone is attached while a peer is still negotiating,
  // remember that the stable connection must be renegotiated afterwards.
  const voiceNeedsRenegotiationRef =
    useRef<Set<string>>(
      new Set()
    );

  const removeVoicePeer =
    useCallback(
      (
        remoteUserId: string
      ) => {
        const peer =
          voicePeersRef.current.get(
            remoteUserId
          );

        if (peer) {
          peer.onicecandidate = null;
          peer.ontrack = null;
          peer.onconnectionstatechange =
            null;
          peer.close();

          voicePeersRef.current.delete(
            remoteUserId
          );
        }

        voicePendingIceRef.current.delete(
          remoteUserId
        );

        voiceOfferInFlightRef.current.delete(
          remoteUserId
        );

        voiceIncomingOfferInFlightRef.current.delete(
          remoteUserId
        );
        voiceNeedsRenegotiationRef.current.delete(
          remoteUserId
        );

        setRemoteVoiceStreams(
          (current) =>
            current.filter(
              (item) =>
                item.userId !==
                remoteUserId
            )
        );

        setLocallyMutedVoiceUsers(
          (current) =>
            current.filter(
              (id) =>
                id !==
                remoteUserId
            )
        );
      },
      []
    );

  const stopVoiceResources =
    useCallback(() => {
      const channel =
        voiceChannelRef.current;

      voiceChannelRef.current = null;

      if (channel) {
        void channel.untrack();
        void supabase.removeChannel(
          channel
        );
      }

      voicePeersRef.current.forEach(
        (peer) => {
          peer.onicecandidate = null;
          peer.ontrack = null;
          peer.onconnectionstatechange =
            null;
          peer.close();
        }
      );

      voicePeersRef.current.clear();
      voicePendingIceRef.current.clear();
      voiceOfferInFlightRef.current.clear();
      voiceIncomingOfferInFlightRef.current.clear();
      voiceNeedsRenegotiationRef.current.clear();

      const stream =
        voiceLocalStreamRef.current;

      voiceLocalStreamRef.current = null;

      stream?.getTracks().forEach(
        (track) => track.stop()
      );

      setRemoteVoiceStreams([]);
      setVoiceParticipants([]);
      setVoiceActive(false);
      setVoiceBusy(false);
      setVoiceMuted(true);
      setVoiceSpeakerMuted(false);
      setLocallyMutedVoiceUsers([]);
      setVoiceStatus("Off");
    }, []);

  async function sendVoiceSignal(
    event: string,
    payload: VoiceSignalPayload
  ) {
    const channel =
      voiceChannelRef.current;

    if (!channel) {
      return;
    }

    await channel.send({
      type: "broadcast",
      event,
      payload,
    });
  }

  function createVoicePeer(
    remoteUserId: string
  ) {
    const existing =
      voicePeersRef.current.get(
        remoteUserId
      );

    if (existing) {
      if (
        existing.connectionState !== "failed" &&
        existing.connectionState !== "closed"
      ) {
        return existing;
      }

      removeVoicePeer(remoteUserId);
    }

    const peer =
      new RTCPeerConnection({
        iceServers: [
          {
            urls: [
              "stun:stun.l.google.com:19302",
              "stun:stun1.l.google.com:19302",
            ],
          },
        ],
      });

    const localStream =
      voiceLocalStreamRef.current;

    const localTrack =
      localStream
        ?.getAudioTracks()[0] ??
      null;

    if (
      localTrack &&
      localStream
    ) {
      peer.addTransceiver(
        localTrack,
        {
          direction:
            "sendrecv",
          streams: [
            localStream,
          ],
        }
      );
    } else {
      /*
        Voice listening connects without microphone
        permission. The mic track is attached only
        after the player taps the microphone button.
      */
      peer.addTransceiver(
        "audio",
        {
          // Do not advertise an outgoing audio sender before a real mic
          // track exists. addTrack() can reuse this recvonly transceiver
          // when the player enables their microphone later.
          direction:
            "recvonly",
        }
      );
    }

    peer.onicecandidate =
      (event) => {
        if (!event.candidate) {
          return;
        }

        void sendVoiceSignal(
          "voice-ice",
          {
            from: userId,
            to: remoteUserId,
            candidate:
              event.candidate.toJSON(),
          }
        );
      };

    peer.ontrack =
      (event) => {
        const stream =
          event.streams[0] ??
          new MediaStream([
            event.track,
          ]);

        setRemoteVoiceStreams(
          (current) => [
            ...current.filter(
              (item) =>
                item.userId !==
                remoteUserId
            ),
            {
              userId:
                remoteUserId,
              stream,
            },
          ]
        );
      };

    peer.onconnectionstatechange =
      () => {
        if (
          peer.connectionState ===
          "connected"
        ) {
          setVoiceStatus("Live");
        }

        if (
          peer.connectionState ===
          "failed"
        ) {
          const remoteName =
            roomPlayers.find(
              (player) =>
                player.user_id === remoteUserId
            )?.name ?? "another player";

          setVoiceError(
            `The voice connection to ${remoteName} failed. This network may require a TURN relay.`
          );

          removeVoicePeer(
            remoteUserId
          );
          return;
        }

        if (
          peer.connectionState ===
          "closed"
        ) {
          removeVoicePeer(
            remoteUserId
          );
        }
      };

    voicePeersRef.current.set(
      remoteUserId,
      peer
    );

    return peer;
  }

  async function flushVoiceIce(
    remoteUserId: string,
    peer: RTCPeerConnection
  ) {
    const queued =
      voicePendingIceRef.current.get(
        remoteUserId
      ) ?? [];

    voicePendingIceRef.current.delete(
      remoteUserId
    );

    for (const candidate of queued) {
      try {
        await peer.addIceCandidate(
          candidate
        );
      } catch {
        // Ignore stale ICE candidates after a reconnect.
      }
    }
  }

  async function createVoiceOffer(
    remoteUserId: string
  ) {
    if (
      !userId ||
      userId >= remoteUserId ||
      voiceOfferInFlightRef.current.has(
        remoteUserId
      )
    ) {
      return;
    }

    const peer =
      createVoicePeer(
        remoteUserId
      );

    if (
      peer.signalingState !== "stable" ||
      peer.localDescription
    ) {
      return;
    }

    voiceOfferInFlightRef.current.add(
      remoteUserId
    );

    try {
      // Re-check after acquiring the per-peer lock. Presence can sync
      // several times while multiple players join the same room.
      if (
        voicePeersRef.current.get(remoteUserId) !== peer ||
        peer.signalingState !== "stable" ||
        peer.localDescription
      ) {
        return;
      }

      const offer =
        await peer.createOffer();

      if (
        voicePeersRef.current.get(remoteUserId) !== peer ||
        peer.signalingState !== "stable" ||
        peer.localDescription
      ) {
        return;
      }

      await peer.setLocalDescription(
        offer
      );

      await sendVoiceSignal(
        "voice-offer",
        {
          from: userId,
          to: remoteUserId,
          description:
            peer.localDescription ??
            offer,
        }
      );
    } catch {
      removeVoicePeer(
        remoteUserId
      );
      setVoiceError(
        "A voice connection could not be negotiated. Please tap the speaker or microphone control to retry."
      );
    } finally {
      voiceOfferInFlightRef.current.delete(
        remoteUserId
      );
    }
  }

  async function renegotiateVoicePeer(
    remoteUserId: string
  ) {
    // Only the lexicographically lower user ID creates offers. This keeps
    // renegotiation deterministic and avoids simultaneous-offer collisions.
    if (
      !userId ||
      userId >= remoteUserId
    ) {
      return;
    }

    const peer =
      voicePeersRef.current.get(
        remoteUserId
      );

    if (
      !peer ||
      peer.connectionState === "closed" ||
      peer.connectionState === "failed"
    ) {
      return;
    }

    if (
      peer.signalingState !== "stable" ||
      voiceOfferInFlightRef.current.has(
        remoteUserId
      )
    ) {
      voiceNeedsRenegotiationRef.current.add(
        remoteUserId
      );
      return;
    }

    voiceOfferInFlightRef.current.add(
      remoteUserId
    );

    try {
      const offer =
        await peer.createOffer();

      if (
        voicePeersRef.current.get(remoteUserId) !== peer ||
        peer.signalingState !== "stable"
      ) {
        voiceNeedsRenegotiationRef.current.add(
          remoteUserId
        );
        return;
      }

      // Avoid leaving the peer in have-local-offer for an identical SDP.
      if (
        offer.sdp &&
        offer.sdp === peer.localDescription?.sdp
      ) {
        return;
      }

      await peer.setLocalDescription(
        offer
      );

      await sendVoiceSignal(
        "voice-offer",
        {
          from: userId,
          to: remoteUserId,
          description:
            peer.localDescription ??
            offer,
        }
      );
    } catch {
      setVoiceError(
        "The microphone changed, but the voice connection could not update. Please toggle the microphone off and on."
      );
    } finally {
      voiceOfferInFlightRef.current.delete(
        remoteUserId
      );
      void flushPendingVoiceRenegotiation(
        remoteUserId
      );
    }
  }

  async function requestVoiceRenegotiation(
    remoteUserId: string
  ) {
    if (!userId) {
      return;
    }

    const peer =
      voicePeersRef.current.get(
        remoteUserId
      );

    if (!peer) {
      return;
    }

    if (
      peer.signalingState !== "stable" ||
      voiceOfferInFlightRef.current.has(
        remoteUserId
      )
    ) {
      voiceNeedsRenegotiationRef.current.add(
        remoteUserId
      );
      return;
    }

    if (userId < remoteUserId) {
      await renegotiateVoicePeer(
        remoteUserId
      );
      return;
    }

    try {
      // The other peer owns offer creation for this pair. Ask it to create
      // the offer after our new microphone sender has been attached.
      await sendVoiceSignal(
        "voice-renegotiate",
        {
          from: userId,
          to: remoteUserId,
        }
      );
    } catch {
      setVoiceError(
        "The microphone is on, but the voice update could not be sent. Please retry."
      );
    }
  }

  async function flushPendingVoiceRenegotiation(
    remoteUserId: string
  ) {
    if (
      !voiceNeedsRenegotiationRef.current.has(
        remoteUserId
      )
    ) {
      return;
    }

    const peer =
      voicePeersRef.current.get(
        remoteUserId
      );

    if (
      !peer ||
      peer.signalingState !== "stable" ||
      voiceOfferInFlightRef.current.has(
        remoteUserId
      )
    ) {
      return;
    }

    voiceNeedsRenegotiationRef.current.delete(
      remoteUserId
    );

    await requestVoiceRenegotiation(
      remoteUserId
    );
  }

  async function handleVoiceRenegotiationRequest(
    payload: VoiceSignalPayload
  ) {
    if (
      payload.to !== userId ||
      payload.from === userId ||
      !userId ||
      userId >= payload.from
    ) {
      return;
    }

    await renegotiateVoicePeer(
      payload.from
    );
  }

  async function handleVoiceOffer(
    payload: VoiceSignalPayload
  ) {
    if (
      payload.to !== userId ||
      payload.from === userId ||
      !payload.description ||
      voiceIncomingOfferInFlightRef.current.has(
        payload.from
      )
    ) {
      return;
    }

    const existingPeer =
      voicePeersRef.current.get(
        payload.from
      );

    if (
      existingPeer?.remoteDescription?.sdp ===
      payload.description.sdp
    ) {
      return;
    }

    voiceIncomingOfferInFlightRef.current.add(
      payload.from
    );

    try {
      const peer =
        createVoicePeer(
          payload.from
        );

      await peer.setRemoteDescription(
        payload.description
      );

      await flushVoiceIce(
        payload.from,
        peer
      );

      const answer =
        await peer.createAnswer();

      await peer.setLocalDescription(
        answer
      );

      await sendVoiceSignal(
        "voice-answer",
        {
          from: userId,
          to: payload.from,
          description:
            peer.localDescription ??
            answer,
        }
      );

      await flushPendingVoiceRenegotiation(
        payload.from
      );
    } catch {
      removeVoicePeer(
        payload.from
      );
      setVoiceError(
        "A voice connection could not be completed. Please toggle the microphone off and on to retry."
      );
    } finally {
      voiceIncomingOfferInFlightRef.current.delete(
        payload.from
      );
    }
  }

  async function handleVoiceAnswer(
    payload: VoiceSignalPayload
  ) {
    if (
      payload.to !== userId ||
      payload.from === userId ||
      !payload.description
    ) {
      return;
    }

    const peer =
      voicePeersRef.current.get(
        payload.from
      );

    if (
      !peer ||
      peer.signalingState !== "have-local-offer"
    ) {
      // Ignore answers for a previous negotiation attempt.
      return;
    }

    try {
      await peer.setRemoteDescription(
        payload.description
      );

      await flushVoiceIce(
        payload.from,
        peer
      );

      await flushPendingVoiceRenegotiation(
        payload.from
      );
    } catch {
      removeVoicePeer(
        payload.from
      );
    }
  }

  async function handleVoiceIce(
    payload: VoiceSignalPayload
  ) {
    if (
      payload.to !== userId ||
      payload.from === userId ||
      !payload.candidate
    ) {
      return;
    }

    const peer =
      voicePeersRef.current.get(
        payload.from
      );

    if (peer?.remoteDescription) {
      try {
        await peer.addIceCandidate(
          payload.candidate
        );
      } catch {
        // Ignore a stale candidate from an old peer connection.
      }
      return;
    }

    // ICE candidates can arrive before their offer over realtime broadcast.
    // Queue them without constructing a peer until an offer/local offer exists.
    const queued =
      voicePendingIceRef.current.get(
        payload.from
      ) ?? [];

    if (queued.length < 128) {
      queued.push(
        payload.candidate
      );
    }

    voicePendingIceRef.current.set(
      payload.from,
      queued
    );
  }

  function syncVoicePresence(
    channel: ReturnType<
      typeof supabase.channel
    >
  ) {
    const state =
      channel.presenceState() as Record<
        string,
        Array<{
          user_id?: string;
          name?: string;
          muted?: boolean;
        }>
      >;

    const byUser =
      new Map<
        string,
        VoiceParticipant
      >();

    Object.values(state)
      .flat()
      .forEach((entry) => {
        if (!entry.user_id) {
          return;
        }

        byUser.set(
          entry.user_id,
          {
            userId:
              entry.user_id,
            name:
              entry.name ??
              "Player",
            muted:
              Boolean(
                entry.muted
              ),
          }
        );
      });

    const participants =
      Array.from(
        byUser.values()
      );

    setVoiceParticipants(
      participants
    );

    const presentIds =
      new Set(
        participants.map(
          (participant) =>
            participant.userId
        )
      );

    voicePeersRef.current.forEach(
      (_, remoteUserId) => {
        if (
          !presentIds.has(
            remoteUserId
          )
        ) {
          removeVoicePeer(
            remoteUserId
          );
        }
      }
    );

    participants.forEach(
      (participant) => {
        if (
          participant.userId !==
            userId &&
          userId <
            participant.userId
        ) {
          void createVoiceOffer(
            participant.userId
          );
        }
      }
    );
  }

  async function connectVoiceRoom() {
    if (
      !room ||
      !room.chat_enabled ||
      !room.voice_chat_enabled ||
      !userId ||
      voiceBusy ||
      voiceChannelRef.current
    ) {
      return;
    }

    setVoiceBusy(true);
    setVoiceError("");
    setVoiceStatus(
      "Connecting"
    );

    try {
      const myName =
        roomPlayers.find(
          (player) =>
            player.user_id ===
            userId
        )?.name ||
        playerName.trim() ||
        "Player";

      const channel =
        supabase.channel(
          `voice:${room.id}`,
          {
            config: {
              private: true,
              broadcast: {
                self: false,
                ack: false,
              },
              presence: {
                key: userId,
              },
            },
          }
        );

      voiceChannelRef.current =
        channel;

      channel
        .on(
          "broadcast",
          { event: "voice-offer" },
          ({ payload }) => {
            void handleVoiceOffer(
              payload as VoiceSignalPayload
            );
          }
        )
        .on(
          "broadcast",
          { event: "voice-answer" },
          ({ payload }) => {
            void handleVoiceAnswer(
              payload as VoiceSignalPayload
            );
          }
        )
        .on(
          "broadcast",
          { event: "voice-ice" },
          ({ payload }) => {
            void handleVoiceIce(
              payload as VoiceSignalPayload
            );
          }
        )
        .on(
          "broadcast",
          { event: "voice-renegotiate" },
          ({ payload }) => {
            void handleVoiceRenegotiationRequest(
              payload as VoiceSignalPayload
            );
          }
        )
        .on(
          "presence",
          { event: "sync" },
          () => {
            syncVoicePresence(
              channel
            );
          }
        )
        .subscribe(
          async (status) => {
            if (
              voiceChannelRef.current !==
              channel
            ) {
              return;
            }

            if (
              status ===
              "SUBSCRIBED"
            ) {
              await channel.track({
                user_id: userId,
                name: myName,
                muted: true,
              });

              setVoiceActive(true);
              setVoiceMuted(true);
              setVoiceStatus("Live");
              setVoiceBusy(false);
              return;
            }

            if (
              status ===
                "CHANNEL_ERROR" ||
              status ===
                "TIMED_OUT"
            ) {
              setVoiceError(
                "Voice connection failed. Reconnecting..."
              );
              stopVoiceResources();
            }
          }
        );
    } catch (voiceConnectError) {
      const message =
        getErrorMessage(
          voiceConnectError,
          "Unable to connect voice."
        );

      setVoiceError(message);
      stopVoiceResources();
      setVoiceBusy(false);
    }
  }

  function unlockRemoteVoiceAudio(
    remoteUserId?: string
  ) {
    if (typeof document === "undefined") {
      return;
    }

    const audioElements =
      document.querySelectorAll<HTMLAudioElement>(
        'audio[data-imposter-voice-audio="true"]'
      );

    audioElements.forEach((audio) => {
      if (
        remoteUserId &&
        audio.dataset.imposterVoiceUser !==
          remoteUserId
      ) {
        return;
      }

      // Run play() directly from the user's click handler so mobile
      // browsers have a chance to unlock incoming audio playback.
      void audio.play().catch((playError: unknown) => {
        const name =
          playError instanceof DOMException
            ? playError.name
            : "";

        if (name === "NotAllowedError") {
          setVoiceError(
            "Incoming audio is blocked by the browser. Tap the speaker button to enable audio."
          );
        }
      });
    });
  }

  async function attachMicrophoneToPeers(
    track: MediaStreamTrack
  ) {
    const peerEntries =
      Array.from(
        voicePeersRef.current.entries()
      );
    const localStream =
      voiceLocalStreamRef.current;

    if (!localStream) {
      return peerEntries.map(
        ([remoteUserId]) => remoteUserId
      );
    }

    const failedUserIds =
      await Promise.all(
        peerEntries.map(
          async ([remoteUserId, peer]) => {
            try {
              if (
                peer.connectionState === "closed" ||
                peer.connectionState === "failed"
              ) {
                throw new Error(
                  "Voice connection is not active."
                );
              }

              const audioTransceiver =
                peer
                  .getTransceivers()
                  .find(
                    (transceiver) =>
                      transceiver.receiver.track.kind ===
                      "audio" &&
                      transceiver.sender.track?.kind ===
                      "audio"
                  ) ??
                peer
                  .getTransceivers()
                  .find(
                    (transceiver) =>
                      transceiver.receiver.track.kind ===
                      "audio"
                  );

              if (!audioTransceiver) {
                throw new Error(
                  "Audio transceiver is missing."
                );
              }

              if (!audioTransceiver.sender.track) {
                // The peer was negotiated while this player had no mic.
                // addTrack() reuses the recvonly transceiver when possible,
                // associates the actual stream, and requires a fresh offer.
                peer.addTrack(
                  track,
                  localStream
                );
                await requestVoiceRenegotiation(
                  remoteUserId
                );
              } else if (
                audioTransceiver.sender.track.id !== track.id
              ) {
                await audioTransceiver.sender.replaceTrack(
                  track
                );
              }

              return null;
            } catch {
              return remoteUserId;
            }
          }
        )
      );

    return failedUserIds.filter(
      (remoteUserId): remoteUserId is string =>
        remoteUserId !== null
    );
  }

  function getVoicePeerNames(
    userIds: string[]
  ) {
    return userIds.map(
      (remoteUserId) =>
        roomPlayers.find(
          (player) =>
            player.user_id === remoteUserId
        )?.name ?? "another player"
    );
  }

  async function updateVoicePresence(
    muted: boolean
  ) {
    const channel =
      voiceChannelRef.current;

    if (!channel) {
      return;
    }

    const myName =
      roomPlayers.find(
        (player) =>
          player.user_id === userId
      )?.name ??
      "Player";

    try {
      await channel.track({
        user_id: userId,
        name: myName,
        muted,
      });
    } catch {
      setVoiceError(
        "Your microphone changed, but voice status could not sync. Please try again."
      );
    }
  }

  async function toggleVoiceMic() {
    if (
      !room ||
      !voiceActive ||
      voiceBusy
    ) {
      return;
    }

    // This is a real user gesture; use it to unlock any incoming audio
    // that the browser may have blocked from autoplaying.
    unlockRemoteVoiceAudio();
    setVoiceError("");

    const existingTrack =
      voiceLocalStreamRef.current
        ?.getAudioTracks()[0] ?? null;

    if (
      !voiceLocalStreamRef.current ||
      !existingTrack ||
      existingTrack.readyState === "ended"
    ) {
      setVoiceBusy(true);

      try {
        voiceLocalStreamRef.current
          ?.getTracks()
          .forEach((track) => track.stop());

        voiceLocalStreamRef.current = null;

        if (
          !navigator.mediaDevices ||
          !navigator.mediaDevices.getUserMedia
        ) {
          throw new Error(
            "Microphone access is not supported in this browser."
          );
        }

        const stream =
          await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });

        const track =
          stream.getAudioTracks()[0];

        if (!track) {
          stream.getTracks().forEach(
            (mediaTrack) => mediaTrack.stop()
          );
          throw new Error(
            "No microphone track was available."
          );
        }

        track.enabled = true;
        voiceLocalStreamRef.current = stream;

        // A single failed peer must not abort attachment to every other
        // peer or leave the UI claiming the microphone is still muted.
        const failedUserIds =
          await attachMicrophoneToPeers(track);

        setVoiceMuted(false);
        await updateVoicePresence(false);

        if (failedUserIds.length > 0) {
          const names =
            getVoicePeerNames(failedUserIds);

          setVoiceError(
            `Your microphone is on, but the connection to ${names.join(", ")} could not attach the mic. Toggle the mic off and on to retry.`
          );
        } else {
          setVoiceError("");
        }
      } catch (microphoneError) {
        const message =
          getErrorMessage(
            microphoneError,
            "Unable to use the microphone."
          );

        if (
          message.toLowerCase().includes("permission") ||
          message.toLowerCase().includes("notallowed")
        ) {
          setVoiceError(
            "Microphone permission was blocked. Allow microphone access for this site and tap the mic again."
          );
        } else {
          setVoiceError(message);
        }
      } finally {
        setVoiceBusy(false);
      }

      return;
    }

    const nextMuted =
      !voiceMuted;

    const localStream =
      voiceLocalStreamRef.current;

    localStream
      ?.getAudioTracks()
      .forEach((track) => {
        track.enabled = !nextMuted;
      });

    setVoiceMuted(nextMuted);

    if (!nextMuted) {
      // Re-attach on every unmute. This repairs peers that were present
      // when the microphone was first enabled but did not accept the track.
      const track =
        localStream?.getAudioTracks()[0];

      if (track) {
        const failedUserIds =
          await attachMicrophoneToPeers(track);

        if (failedUserIds.length > 0) {
          const names =
            getVoicePeerNames(failedUserIds);

          setVoiceError(
            `Your microphone is on, but the connection to ${names.join(", ")} still needs to reconnect.`
          );
        } else {
          setVoiceError("");
        }
      }
    }

    await updateVoicePresence(nextMuted);
  }

  function toggleVoiceSpeaker() {
    if (!voiceActive) {
      return;
    }

    if (voiceSpeakerMuted) {
      unlockRemoteVoiceAudio();
    }

    setVoiceSpeakerMuted(
      (current) =>
        !current
    );
  }

  function toggleLocalPlayerMute(
    remoteUserId: string
  ) {
    if (
      !voiceActive ||
      remoteUserId ===
        userId
    ) {
      return;
    }

    if (
      locallyMutedVoiceUsers.includes(
        remoteUserId
      ) &&
      !voiceSpeakerMuted
    ) {
      unlockRemoteVoiceAudio(
        remoteUserId
      );
    }

    setLocallyMutedVoiceUsers(
      (current) =>
        current.includes(
          remoteUserId
        )
          ? current.filter(
              (id) =>
                id !==
                remoteUserId
            )
          : [
              ...current,
              remoteUserId,
            ]
    );
  }

  function muteAllRemotePlayers() {
    if (!voiceActive) {
      return;
    }

    setVoiceSpeakerMuted(
      true
    );
  }

  function unmuteAllRemotePlayers() {
    if (!voiceActive) {
      return;
    }

    unlockRemoteVoiceAudio();

    setVoiceSpeakerMuted(
      false
    );

    setLocallyMutedVoiceUsers(
      []
    );
  }

  useEffect(() => {
    return () => {
      stopVoiceResources();
    };
  }, [stopVoiceResources]);

  useEffect(() => {
    if (
      !room ||
      !room.chat_enabled ||
      !room.voice_chat_enabled
    ) {
      if (
        voiceLocalStreamRef.current ||
        voiceChannelRef.current
      ) {
        stopVoiceResources();
      }

      return;
    }

    if (
      !voiceChannelRef.current
    ) {
      void connectVoiceRoom();
    }
  }, [
    room?.id,
    room?.chat_enabled,
    room?.voice_chat_enabled,
    userId,
    stopVoiceResources,
  ]);

  /*
    CLEAR ACTIVE ROOM
  */

  const clearActiveRoom =
    useCallback(
      (
        message = ""
      ) => {
        localStorage.removeItem(
          ACTIVE_ROOM_KEY
        );

        stopVoiceResources();

        setRoom(null);

        setRoomPlayers([]);

        // Room codes are temporary.
        // Always clear the previous join code when
        // a room is closed, left, or no longer exists.
        setJoinCode("");

        setCodeCopied(false);
        setShareDone(false);

        setPrivateRole(null);

        setRoleRevealed(false);

        setWordSubmitting(false);

        setClueOrder([]);

        setClues([]);

        setClueText("");

        setClueBusy(false);

        setEditingClueId(null);

        setEditingClueText("");

        setExpandedCluePlayerId(null);

        setClueSecondsLeft(null);

        setVotingBusy(false);

        setMyVoteTargetId(null);

        setVoteCandidateIds([]);

        setRevealedImposterIds([]);

        setWordPeekOpen(false);

        expireAttemptRef.current = {
          turnKey: "",
          lastAttemptAt: 0,
          inFlight: false,
        };

        wordSubmissionRevisionRef.current =
          null;

        setView(
          "menu"
        );

        setRealtimeStatus(
          "Disconnected"
        );

        if (message) {
          setError(
            message
          );
        }
      },
      [stopVoiceResources]
    );

  /*
    LOAD PLAYERS
  */

  const loadRoomPlayers =
    useCallback(
      async (
        roomId: string
      ) => {
        const {
          data,
          error:
            playersError,
        } =
          await supabase
            .from(
              "room_players"
            )
            .select(
              "id, room_id, user_id, name, is_host, is_spectator, joined_at"
            )
            .eq(
              "room_id",
              roomId
            )
            .order(
              "joined_at",
              {
                ascending:
                  true,
              }
            );

        if (
          playersError
        ) {
          return;
        }

        setRoomPlayers(
          (
            data ??
            []
          ) as RoomPlayer[]
        );
      },
      []
    );

  /*
    LOAD LAST 2 COMPLETED GAMES
  */

  const loadRecentGames =
    useCallback(
      async () => {
        if (!userId) {
          setRecentGames([]);
          return;
        }

        setRecentGamesLoading(true);

        try {
          const {
            data,
            error:
              recentError,
          } =
            await supabase
              .from(
                "user_game_history"
              )
              .select(
                `
                id,
                room_id,
                room_code,
                game_revision,
                completed_at,
                winner,
                secret_word,
                imposter_names,
                players,
                clues,
                penalties,
                last_vote_player,
                last_vote_was_imposter,
                mode,
                chat_enabled,
                online_voting
                `
              )
              .order(
                "completed_at",
                {
                  ascending:
                    false,
                }
              )
              .limit(2);

          if (recentError) {
            return;
          }

          setRecentGames(
            (
              data ?? []
            ).map(
              (item) => ({
                id:
                  String(
                    item.id
                  ),
                room_id:
                  String(
                    item.room_id
                  ),
                room_code:
                  String(
                    item.room_code ??
                      ""
                  ),
                game_revision:
                  Number(
                    item.game_revision ??
                      0
                  ),
                completed_at:
                  String(
                    item.completed_at
                  ),
                winner:
                  item.winner ===
                    "players" ||
                  item.winner ===
                    "imposters"
                    ? item.winner
                    : null,
                secret_word:
                  item.secret_word
                    ? String(
                        item.secret_word
                      )
                    : null,
                imposter_names:
                  Array.isArray(
                    item.imposter_names
                  )
                    ? item.imposter_names.map(
                        (name) =>
                          String(
                            name
                          )
                      )
                    : [],
                players:
                  Array.isArray(
                    item.players
                  )
                    ? item.players as
                        RecentGamePlayer[]
                    : [],
                clues:
                  Array.isArray(
                    item.clues
                  )
                    ? item.clues as
                        RecentGameClue[]
                    : [],
                penalties:
                  Array.isArray(
                    item.penalties
                  )
                    ? item.penalties as
                        RecentGamePenalty[]
                    : [],
                last_vote_player:
                  item.last_vote_player
                    ? String(
                        item.last_vote_player
                      )
                    : null,
                last_vote_was_imposter:
                  typeof item.last_vote_was_imposter ===
                    "boolean"
                    ? item.last_vote_was_imposter
                    : null,
                mode:
                  item.mode ===
                    "custom" ||
                  item.mode ===
                    "chaos"
                    ? item.mode
                    : "default",
                chat_enabled:
                  Boolean(
                    item.chat_enabled
                  ),
                online_voting:
                  Boolean(
                    item.online_voting
                  ),
              })
            )
          );
        } finally {
          setRecentGamesLoading(
            false
          );
        }
      },
      [userId]
    );

  /*
    LOAD PRIVATE ROLE
  */

  const loadPrivateRole =
    useCallback(
      async (
        roomId: string,
        gameRevision: number
      ) => {
        if (
          gameRevision < 1
        ) {
          setPrivateRole(null);
          return;
        }

        const {
          data,
          error:
            roleError,
        } =
          await supabase
            .from(
              "room_private_roles"
            )
            .select(
              "id, room_id, room_player_id, user_id, game_revision, role, secret_word, is_word_provider, created_at"
            )
            .eq(
              "room_id",
              roomId
            )
            .eq(
              "game_revision",
              gameRevision
            )
            .maybeSingle();

        if (
          roleError
        ) {
          return;
        }

        setPrivateRole(
          data as
            PrivateRole | null
        );
      },
      []
    );

  /*
    LOAD CLUE DATA / HISTORY
  */

  const loadClueData =
    useCallback(
      async (
        roomId: string,
        gameRevision: number
      ) => {
        if (
          gameRevision < 1
        ) {
          setClueOrder([]);
          setClues([]);
          return;
        }

        const [
          orderResult,
          cluesResult,
        ] =
          await Promise.all([
            supabase
              .from(
                "room_clue_order"
              )
              .select(
                "id, room_id, game_revision, round_number, turn_position, room_player_id, user_id, turn_status, completed_at, penalty_applied, created_at"
              )
              .eq(
                "room_id",
                roomId
              )
              .eq(
                "game_revision",
                gameRevision
              )
              .order(
                "round_number",
                { ascending: true }
              )
              .order(
                "turn_position",
                { ascending: true }
              ),

            supabase
              .from(
                "room_clues"
              )
              .select(
                "id, room_id, game_revision, round_number, room_player_id, user_id, clue_text, submitted_at, edited_at"
              )
              .eq(
                "room_id",
                roomId
              )
              .eq(
                "game_revision",
                gameRevision
              )
              .order(
                "round_number",
                { ascending: true }
              )
              .order(
                "submitted_at",
                { ascending: true }
              ),
          ]);

        if (
          orderResult.error ||
          cluesResult.error
        ) {
          return;
        }

        setClueOrder(
          (orderResult.data ?? []) as
            ClueOrderItem[]
        );

        setClues(
          (cluesResult.data ?? []) as
            RoomClue[]
        );
      },
      []
    );

  /*
    LOAD VOTING / REVEAL DATA
  */

  const loadVotingData =
    useCallback(
      async (
        roomId: string,
        gameRevision: number,
        votingRound: number,
        ballotNumber: number
      ) => {
        if (
          gameRevision < 1
        ) {
          setVoteCandidateIds([]);
          setRevealedImposterIds([]);
          setMyVoteTargetId(null);
          return;
        }

        const [
          candidatesResult,
          revealResult,
        ] =
          await Promise.all([
            supabase
              .from(
                "room_vote_candidates"
              )
              .select(
                "room_player_id"
              )
              .eq(
                "room_id",
                roomId
              )
              .eq(
                "game_revision",
                gameRevision
              )
              .eq(
                "voting_round_number",
                votingRound
              )
              .eq(
                "ballot_number",
                ballotNumber
              ),

            supabase
              .from(
                "room_revealed_imposters"
              )
              .select(
                "room_player_id"
              )
              .eq(
                "room_id",
                roomId
              )
              .eq(
                "game_revision",
                gameRevision
              ),
          ]);

        if (
          !candidatesResult.error
        ) {
          setVoteCandidateIds(
            (
              candidatesResult.data ??
              []
            ).map(
              (
                item
              ) =>
                (
                  item as VoteCandidate
                ).room_player_id
            )
          );
        }

        if (
          !revealResult.error
        ) {
          setRevealedImposterIds(
            (
              revealResult.data ??
              []
            ).map(
              (
                item
              ) =>
                (
                  item as RevealedImposter
                ).room_player_id
            )
          );
        }

        if (
          votingRound < 1 ||
          ballotNumber < 1
        ) {
          setMyVoteTargetId(null);
          return;
        }

        const {
          data:
            myVoteData,
          error:
            myVoteError,
        } =
          await supabase
            .from(
              "room_votes"
            )
            .select(
              "target_room_player_id"
            )
            .eq(
              "room_id",
              roomId
            )
            .eq(
              "game_revision",
              gameRevision
            )
            .eq(
              "voting_round_number",
              votingRound
            )
            .eq(
              "ballot_number",
              ballotNumber
            )
            .maybeSingle();

        if (
          !myVoteError
        ) {
          setMyVoteTargetId(
            myVoteData
              ? String(
                  myVoteData.target_room_player_id
                )
              : null
          );
        }
      },
      []
    );

  /*
    REFRESH ROOM
  */

  const refreshRoom =
    useCallback(
      async (
        roomId: string
      ) => {
        const {
          data,
          error:
            roomError,
        } =
          await supabase
            .from(
              "rooms"
            )
            .select(
              `
              id,
              code,
              host_user_id,
              status,
              mode,
              imposter_count,
              elimination_mode,
              private_phone_voting,
              random_clue_order,
              allow_self_vote,
              voting_round_limit,
              settings_revision,
              game_phase,
              game_revision,
              started_at,
              chat_enabled,
              voice_chat_enabled,
              clue_timer_enabled,
              clue_time_seconds,
              clue_miss_penalty_enabled,
              clue_rotations,
              clue_round_number,
              clue_turn_index,
              clue_turn_started_at,
              clue_session_complete,
              voting_round_number,
              vote_ballot_number,
              vote_stage,
              votes_submitted_count,
              votes_required_count,
              vote_result_player_id,
              vote_result_was_imposter,
              vote_winner,
              imposters_revealed,
              clue_cycle_end_round,
              created_at,
              updated_at
              `
            )
            .eq(
              "id",
              roomId
            )
            .maybeSingle();

        if (
          roomError
        ) {
          return;
        }

        if (!data) {
          clearActiveRoom(
            "The room was closed or you were removed from it."
          );

          return;
        }

        setRoom(
          data as Room
        );
      },
      [
        clearActiveRoom,
      ]
    );

  /*
    AUTH BOOTSTRAP
  */

  useEffect(() => {
    let cancelled =
      false;

    async function bootstrap() {
      try {
        setError("");

        const {
          data:
            sessionData,
          error:
            sessionError,
        } =
          await supabase
            .auth
            .getSession();

        if (
          sessionError
        ) {
          throw sessionError;
        }

        let currentUser =
          sessionData
            .session
            ?.user ??
          null;

        if (
          !currentUser
        ) {
          const {
            data:
              anonymousData,
            error:
              anonymousError,
          } =
            await supabase
              .auth
              .signInAnonymously();

          if (
            anonymousError
          ) {
            throw anonymousError;
          }

          currentUser =
            anonymousData.user;
        }

        if (
          !currentUser
        ) {
          throw new Error(
            "Unable to create multiplayer session."
          );
        }

        if (
          cancelled
        ) {
          return;
        }

        setUserId(
          currentUser.id
        );

        /*
          REMEMBERED NAME
        */

        const rememberedName =
          localStorage.getItem(
            MULTIPLAYER_NAME_KEY
          );

        if (
          rememberedName
        ) {
          setPlayerName(
            rememberedName
          );
        }

        /*
          SINGLE-PHONE SAVED NAMES
        */

        try {
          const rawRoster =
            localStorage.getItem(
              SAVED_PLAYERS_KEY
            );

          if (
            rawRoster
          ) {
            const parsed =
              JSON.parse(
                rawRoster
              );

            if (
              Array.isArray(
                parsed
              )
            ) {
              const names =
                parsed
                  .map(
                    (
                      item
                    ) =>
                      cleanName(
                        String(
                          item
                        )
                      )
                  )
                  .filter(
                    Boolean
                  );

              setSavedNames(
                [
                  ...new Set(
                    names
                  ),
                ]
              );
            }
          }
        } catch {
          setSavedNames(
            []
          );
        }

        /*
          RESUME EXISTING ROOM
        */

        const activeRoomRaw =
          localStorage.getItem(
            ACTIVE_ROOM_KEY
          );

        if (
          activeRoomRaw
        ) {
          try {
            const activeRoom =
              JSON.parse(
                activeRoomRaw
              ) as {
                roomId?: string;
              };

            if (
              activeRoom.roomId
            ) {
              const {
                data:
                  existingRoom,
              } =
                await supabase
                  .from(
                    "rooms"
                  )
                  .select(
                    `
                    id,
                    code,
                    host_user_id,
                    status,
                    mode,
                    imposter_count,
                    elimination_mode,
                    private_phone_voting,
                    random_clue_order,
                    allow_self_vote,
                    voting_round_limit,
                    settings_revision,
                    game_phase,
                    game_revision,
                    started_at,
                    chat_enabled,
                    voice_chat_enabled,
                    clue_timer_enabled,
                    clue_time_seconds,
                    clue_miss_penalty_enabled,
                    clue_rotations,
                    clue_round_number,
                    clue_turn_index,
                    clue_turn_started_at,
                    clue_session_complete,
                    voting_round_number,
                    vote_ballot_number,
                    vote_stage,
                    votes_submitted_count,
                    votes_required_count,
                    vote_result_player_id,
                    vote_result_was_imposter,
                    vote_winner,
                    imposters_revealed,
                    clue_cycle_end_round,
                    created_at,
                    updated_at
                    `
                  )
                  .eq(
                    "id",
                    activeRoom.roomId
                  )
                  .maybeSingle();

              if (
                existingRoom
              ) {
                setRoom(
                  existingRoom as Room
                );

                setView(
                  "lobby"
                );

                await loadRoomPlayers(
                  existingRoom.id
                );
              } else {
                localStorage.removeItem(
                  ACTIVE_ROOM_KEY
                );
              }
            }
          } catch {
            localStorage.removeItem(
              ACTIVE_ROOM_KEY
            );
          }
        }
      } catch (
        bootstrapError
      ) {
        const message =
          getErrorMessage(
            bootstrapError,
            "Unable to connect to multiplayer."
          );

        setError(
          getFriendlyError(
            message
          )
        );
      } finally {
        if (
          !cancelled
        ) {
          setAuthReady(
            true
          );
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [
    loadRoomPlayers,
  ]);

  /*
    SAVE COMPLETED GAME HISTORY

    Every connected player may call the archive RPC, but the
    database upsert makes it safe. The SQL stores one private
    snapshot per participant and keeps only the newest two.
  */

  useEffect(() => {
    if (
      !room ||
      room.game_revision < 1
    ) {
      return;
    }

    const completed =
      room.game_phase ===
        "finished" ||
      (
        room.game_phase ===
          "result" &&
        Boolean(
          room.vote_winner
        )
      );

    if (!completed) {
      return;
    }

    let cancelled =
      false;

    async function archive() {
      const {
        error:
          archiveError,
      } =
        await supabase.rpc(
          "archive_room_game_history",
          {
            p_room_id:
              room!.id,
          }
        );

      if (
        !archiveError &&
        !cancelled
      ) {
        await loadRecentGames();
      }
    }

    void archive();

    return () => {
      cancelled = true;
    };
  }, [
    room?.id,
    room?.game_revision,
    room?.game_phase,
    room?.vote_winner,
    loadRecentGames,
  ]);

  useEffect(() => {
    if (
      authReady &&
      userId &&
      view ===
        "menu"
    ) {
      void loadRecentGames();
    }
  }, [
    authReady,
    userId,
    view,
    loadRecentGames,
  ]);

  /*
    REALTIME
  */

  useEffect(() => {
    if (!room) {
      return;
    }

    const roomId =
      room.id;

    void loadRoomPlayers(
      roomId
    );

    const channel =
      supabase
        .channel(
          `imposter-room-${roomId}`
        )

        .on(
          "postgres_changes",
          {
            event: "*",
            schema:
              "public",
            table:
              "room_players",
            filter:
              `room_id=eq.${roomId}`,
          },
          () => {
            void loadRoomPlayers(
              roomId
            );
          }
        )

        .on(
          "postgres_changes",
          {
            event: "*",
            schema:
              "public",
            table:
              "rooms",
            filter:
              `id=eq.${roomId}`,
          },
          () => {
            void refreshRoom(
              roomId
            );
          }
        )

        .subscribe(
          (status) => {
            if (
              status ===
              "SUBSCRIBED"
            ) {
              setRealtimeStatus(
                "Live"
              );
            } else if (
              status ===
              "CHANNEL_ERROR"
            ) {
              setRealtimeStatus(
                "Connection error"
              );
            } else if (
              status ===
              "TIMED_OUT"
            ) {
              setRealtimeStatus(
                "Reconnecting"
              );
            } else if (
              status ===
              "CLOSED"
            ) {
              setRealtimeStatus(
                "Disconnected"
              );
            }
          }
        );

    /*
      Small fallback refresh in
      case the browser sleeps.
    */

    const refreshTimer =
      window.setInterval(
        () => {
          void refreshRoom(
            roomId
          );

          void loadRoomPlayers(
            roomId
          );
        },
        5000
      );

    return () => {
      window.clearInterval(
        refreshTimer
      );

      void supabase
        .removeChannel(
          channel
        );
    };
  }, [
    room?.id,
    loadRoomPlayers,
    refreshRoom,
  ]);

  /*
    SHARED ROOM LINK
  */

  useEffect(() => {
    if (
      typeof window ===
      "undefined"
    ) {
      return;
    }

    const params =
      new URLSearchParams(
        window.location.search
      );

    const sharedCode =
      (params.get("room") ?? "")
        .trim()
        .toUpperCase();

    if (
      /^[A-Z0-9]{6}$/.test(
        sharedCode
      )
    ) {
      setJoinCode(
        sharedCode
      );

      setView((current) =>
        current === "menu"
          ? "join"
          : current
      );
    }
  }, []);

  /*
    PRIVATE ROLE SYNC
  */

  useEffect(() => {
    if (
      !room ||
      room.status !==
        "playing" ||
      room.game_revision < 1
    ) {
      setPrivateRole(null);
      setRoleRevealed(false);
      return;
    }

    void loadPrivateRole(
      room.id,
      room.game_revision
    );
  }, [
    room?.id,
    room?.status,
    room?.game_revision,
    room?.game_phase,
    loadPrivateRole,
  ]);

  /*
    SECRET WORD PROVIDER

    Exactly one NORMAL player's
    private row has
    is_word_provider = true.

    That device chooses a word
    from the existing local word
    bank and submits it securely.
  */

  useEffect(() => {
    if (
      !room ||
      room.status !==
        "playing" ||
      room.game_phase !==
        "preparing" ||
      !privateRole ||
      privateRole.game_revision !==
        room.game_revision ||
      !privateRole.is_word_provider ||
      privateRole.role !==
        "player"
    ) {
      return;
    }

    if (
      wordSubmissionRevisionRef.current ===
      room.game_revision
    ) {
      return;
    }

    const roomId =
      room.id;

    const gameRevision =
      room.game_revision;

    wordSubmissionRevisionRef.current =
      gameRevision;

    async function prepareSecretWord() {
      setWordSubmitting(true);

      try {
        const secretWord =
          await getNextSecretWord();

        const {
          error:
            submitWordError,
        } =
          await supabase.rpc(
            "submit_room_secret_word",
            {
              p_room_id:
                roomId,

              p_word:
                secretWord,
            }
          );

        if (
          submitWordError
        ) {
          if (
            String(
              submitWordError.message
            ).includes(
              "WORD_ALREADY_SET"
            )
          ) {
            await refreshRoom(
              roomId
            );

            await loadPrivateRole(
              roomId,
              gameRevision
            );

            return;
          }

          throw submitWordError;
        }

        await refreshRoom(
          roomId
        );

        await loadPrivateRole(
          roomId,
          gameRevision
        );
      } catch (
        wordError
      ) {
        wordSubmissionRevisionRef.current =
          null;

        const message =
          getErrorMessage(
            wordError,
            "Unable to prepare the secret word."
          );

        setError(
          getFriendlyError(
            message
          )
        );
      } finally {
        setWordSubmitting(false);
      }
    }

    void prepareSecretWord();
  }, [
    room?.id,
    room?.status,
    room?.game_phase,
    room?.game_revision,
    privateRole,
    refreshRoom,
    loadPrivateRole,
  ]);

  /*
    CLUE ROUND / HISTORY SYNC
  */

  useEffect(() => {
    if (
      !room ||
      room.status !==
        "playing" ||
      room.game_revision < 1 ||
      room.clue_round_number < 1
    ) {
      if (
        !room ||
        room.status !==
          "playing" ||
        room.clue_round_number < 1
      ) {
        setClueOrder([]);
        setClues([]);
      }

      return;
    }

    void loadClueData(
      room.id,
      room.game_revision
    );
  }, [
    room?.id,
    room?.status,
    room?.game_phase,
    room?.game_revision,
    room?.clue_round_number,
    room?.clue_turn_index,
    room?.clue_session_complete,
    room?.updated_at,
    loadClueData,
  ]);

  /*
    VOTING / REVEAL SYNC
  */

  useEffect(() => {
    if (
      !room ||
      room.game_revision < 1
    ) {
      setVoteCandidateIds([]);
      setRevealedImposterIds([]);
      setMyVoteTargetId(null);
      return;
    }

    void loadVotingData(
      room.id,
      room.game_revision,
      room.voting_round_number,
      room.vote_ballot_number
    );
  }, [
    room?.id,
    room?.game_revision,
    room?.game_phase,
    room?.voting_round_number,
    room?.vote_ballot_number,
    room?.vote_stage,
    room?.imposters_revealed,
    room?.updated_at,
    loadVotingData,
  ]);

  /*
    HOST
  */

  const isHost =
    useMemo(
      () =>
        Boolean(
          room &&
            userId &&
            room.host_user_id ===
              userId
        ),
      [
        room,
        userId,
      ]
    );

  const activePlayerCount =
    roomPlayers.filter(
      (player) =>
        !player.is_spectator
    ).length;

  const maximumImposters =
    getMaxImposters(
      activePlayerCount
    );

  const recommendedImposters =
    getRecommendedImposters(
      activePlayerCount
    );

  const settingsAreValid =
    Boolean(
      room &&
        activePlayerCount >=
          3 &&
        room.imposter_count >=
          1 &&
        room.imposter_count <=
          maximumImposters
    );

  const myRoomPlayer =
    roomPlayers.find(
      (player) =>
        player.user_id ===
        userId
    ) ??
    null;

  const currentRoundOrder =
    room
      ? clueOrder.filter(
          (item) =>
            item.round_number ===
            room.clue_round_number
        )
      : [];

  /*
    ONE CLUE ORDER PER MATCH

    The first generated clue order is the master order.
    Later rotations keep the same player sequence.
    Eliminated/spectator players are hidden from the board.
  */
  const gameClueOrder =
    useMemo(() => {
      if (
        clueOrder.length ===
        0
      ) {
        return [];
      }

      const firstRound =
        Math.min(
          ...clueOrder.map(
            (item) =>
              item.round_number
          )
        );

      const activePlayerIds =
        new Set(
          roomPlayers
            .filter(
              (player) =>
                !player.is_spectator
            )
            .map(
              (player) =>
                player.id
            )
        );

      return clueOrder
        .filter(
          (item) =>
            item.round_number ===
              firstRound &&
            activePlayerIds.has(
              item.room_player_id
            )
        )
        .slice()
        .sort(
          (a, b) =>
            a.turn_position -
            b.turn_position
        );
    }, [
      clueOrder,
      roomPlayers,
    ]);

  const currentClueTurn =
    room
      ? currentRoundOrder.find(
          (item) =>
            item.turn_position ===
            room.clue_turn_index
        ) ??
        null
      : null;

  const currentCluePlayer =
    currentClueTurn
      ? roomPlayers.find(
          (player) =>
            player.id ===
            currentClueTurn.room_player_id
        ) ??
        null
      : null;

  const myCurrentClue =
    myRoomPlayer &&
    room
      ? clues.find(
          (clue) =>
            clue.room_player_id ===
              myRoomPlayer.id &&
            clue.round_number ===
              room.clue_round_number
        ) ??
        null
      : null;

  const isMyClueTurn =
    Boolean(
      currentClueTurn &&
        myRoomPlayer &&
        currentClueTurn.room_player_id ===
          myRoomPlayer.id &&
        currentClueTurn.turn_status ===
          "pending"
    );

  const clueDeadlineReached =
    Boolean(
      room &&
        room.chat_enabled &&
        room.clue_timer_enabled &&
        clueSecondsLeft === 0
    );

  const eligibleVotePlayers =
    roomPlayers.filter(
      (player) =>
        !player.is_spectator &&
        (
          room?.allow_self_vote ||
          player.user_id !==
            userId
        )
    );

  const tiedVotePlayers =
    roomPlayers.filter(
      (player) =>
        voteCandidateIds.includes(
          player.id
        )
    );

  const voteResultPlayer =
    room?.vote_result_player_id
      ? roomPlayers.find(
          (player) =>
            player.id ===
            room.vote_result_player_id
        ) ??
        null
      : null;

  const revealedImposterPlayers =
    roomPlayers.filter(
      (player) =>
        revealedImposterIds.includes(
          player.id
        )
    );

  const completedCurrentRoundTurns =
    currentRoundOrder.filter(
      (item) =>
        item.turn_status !==
        "pending"
    ).length;

  /*
    CLUE TIMER
  */

  useEffect(() => {
    if (
      !room ||
      room.game_phase !==
        "clue" ||
      room.clue_session_complete ||
      !room.chat_enabled ||
      !room.clue_timer_enabled ||
      !room.clue_turn_started_at ||
      !currentClueTurn ||
      currentClueTurn.turn_status !==
        "pending"
    ) {
      setClueSecondsLeft(null);
      return;
    }

    const turnKey =
      `${room.game_revision}:${room.clue_round_number}:${room.clue_turn_index}`;

    const deadline =
      new Date(
        room.clue_turn_started_at
      ).getTime() +
      room.clue_time_seconds *
        1000;

    function updateTimer() {
      const remaining =
        Math.max(
          0,
          Math.ceil(
            (deadline -
              Date.now()) /
              1000
          )
        );

      setClueSecondsLeft(
        remaining
      );

      if (
        remaining === 0 &&
        (isHost ||
          isMyClueTurn)
      ) {
        const now =
          Date.now();

        if (
          expireAttemptRef.current.turnKey !==
          turnKey
        ) {
          expireAttemptRef.current = {
            turnKey,
            lastAttemptAt: 0,
            inFlight: false,
          };
        }

        const canRetry =
          !expireAttemptRef.current.inFlight &&
          now -
            expireAttemptRef.current.lastAttemptAt >=
            600;

        if (canRetry) {
          expireAttemptRef.current.inFlight =
            true;

          expireAttemptRef.current.lastAttemptAt =
            now;

          void expireClueTurn();
        }
      }
    }

    updateTimer();

    const timer =
      window.setInterval(
        updateTimer,
        250
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, [
    room?.id,
    room?.game_phase,
    room?.game_revision,
    room?.clue_round_number,
    room?.clue_turn_index,
    room?.clue_turn_started_at,
    room?.clue_time_seconds,
    room?.clue_timer_enabled,
    room?.chat_enabled,
    room?.clue_session_complete,
    currentClueTurn?.id,
    currentClueTurn?.turn_status,
    isHost,
    isMyClueTurn,
  ]);

  /*
    NAME
  */

  function rememberName() {
    const clean =
      cleanName(
        playerName
      );

    if (clean) {
      localStorage.setItem(
        MULTIPLAYER_NAME_KEY,
        clean
      );
    }

    return clean;
  }

  /*
    OPEN ROOM
  */

  async function openRoom(
    roomId: string
  ) {
    const {
      data,
      error:
        roomError,
    } =
      await supabase
        .from(
          "rooms"
        )
        .select(
          `
          id,
          code,
          host_user_id,
          status,
          mode,
          imposter_count,
          elimination_mode,
          private_phone_voting,
          random_clue_order,
          allow_self_vote,
          voting_round_limit,
          settings_revision,
          game_phase,
          game_revision,
          started_at,
          chat_enabled,
          voice_chat_enabled,
          clue_timer_enabled,
          clue_time_seconds,
          clue_miss_penalty_enabled,
          clue_rotations,
          clue_round_number,
          clue_turn_index,
          clue_turn_started_at,
          clue_session_complete,
          voting_round_number,
          vote_ballot_number,
          vote_stage,
          votes_submitted_count,
          votes_required_count,
          vote_result_player_id,
          vote_result_was_imposter,
          vote_winner,
          imposters_revealed,
          clue_cycle_end_round,
          created_at,
          updated_at
          `
        )
        .eq(
          "id",
          roomId
        )
        .single();

    if (
      roomError
    ) {
      throw roomError;
    }

    const loadedRoom =
      data as Room;

    setRoom(
      loadedRoom
    );

    setView(
      "lobby"
    );

    localStorage.setItem(
      ACTIVE_ROOM_KEY,
      JSON.stringify({
        roomId:
          loadedRoom.id,

        code:
          loadedRoom.code,
      })
    );

    await loadRoomPlayers(
      loadedRoom.id
    );
  }

  /*
    CREATE ROOM
  */

  async function createRoom() {
    if (
      loading ||
      !authReady
    ) {
      return;
    }

    const name =
      rememberName();

    if (!name) {
      setError(
        "Enter your player name."
      );

      return;
    }

    if (
      name.length > 24
    ) {
      setError(
        "Player name must be 24 characters or less."
      );

      return;
    }

    setLoading(true);

    setError("");

    try {
      const {
        data,
        error:
          createError,
      } =
        await supabase.rpc(
          "create_game_room",
          {
            p_name:
              name,
          }
        );

      if (
        createError
      ) {
        throw createError;
      }

      const created =
        Array.isArray(
          data
        )
          ? data[0]
          : data;

      if (
        !created?.room_id
      ) {
        throw new Error(
          "Room could not be created."
        );
      }

      await openRoom(
        created.room_id
      );
    } catch (
      createRoomError
    ) {
      const message =
        getErrorMessage(
          createRoomError,
          "Unable to create room."
        );

      setError(
        getFriendlyError(
          message
        )
      );
    } finally {
      setLoading(false);
    }
  }

  /*
    JOIN ROOM
  */

  async function joinRoom() {
    if (
      loading ||
      !authReady
    ) {
      return;
    }

    const name =
      rememberName();

    const code =
      joinCode
        .trim()
        .toUpperCase();

    if (!name) {
      setError(
        "Enter your player name."
      );

      return;
    }

    if (
      name.length > 24
    ) {
      setError(
        "Player name must be 24 characters or less."
      );

      return;
    }

    if (
      code.length !== 6
    ) {
      setError(
        "Enter the 6-character room code."
      );

      return;
    }

    setLoading(true);

    setError("");

    try {
      const {
        data,
        error:
          joinError,
      } =
        await supabase.rpc(
          "join_game_room",
          {
            p_code:
              code,

            p_name:
              name,
          }
        );

      if (
        joinError
      ) {
        throw joinError;
      }

      const joined =
        Array.isArray(
          data
        )
          ? data[0]
          : data;

      if (
        !joined?.room_id
      ) {
        throw new Error(
          "Unable to join room."
        );
      }

      await openRoom(
        joined.room_id
      );

      // The code has already served its purpose.
      // Do not carry it into the next room attempt.
      setJoinCode("");
    } catch (
      joinRoomError
    ) {
      const message =
        getErrorMessage(
          joinRoomError,
          "Unable to join room."
        );

      setError(
        getFriendlyError(
          message
        )
      );
    } finally {
      setLoading(false);
    }
  }

  /*
    LEAVE ROOM
  */

  async function leaveRoom() {
    if (
      !room ||
      loading
    ) {
      return;
    }

    setLoading(true);

    setError("");

    try {
      const {
        error:
          leaveError,
      } =
        await supabase.rpc(
          "leave_game_room",
          {
            p_room_id:
              room.id,
          }
        );

      if (
        leaveError
      ) {
        throw leaveError;
      }

      clearActiveRoom();
    } catch (
      leaveRoomError
    ) {
      const message =
        getErrorMessage(
          leaveRoomError,
          "Unable to leave room."
        );

      setError(
        getFriendlyError(
          message
        )
      );
    } finally {
      setLoading(false);
    }
  }

  /*
    REMOVE PLAYER
  */

  async function removePlayer(
    playerId: string
  ) {
    if (
      !room ||
      !isHost ||
      loading
    ) {
      return;
    }

    setLoading(true);

    setError("");

    try {
      const {
        error:
          removeError,
      } =
        await supabase.rpc(
          "kick_room_player",
          {
            p_room_id:
              room.id,

            p_player_id:
              playerId,
          }
        );

      if (
        removeError
      ) {
        throw removeError;
      }

      await loadRoomPlayers(
        room.id
      );
    } catch (
      removePlayerError
    ) {
      const message =
        getErrorMessage(
          removePlayerError,
          "Unable to remove player."
        );

      setError(
        getFriendlyError(
          message
        )
      );
    } finally {
      setLoading(false);
    }
  }

  /*
    COPY CODE
  */

  async function copyRoomCode() {
    if (!room) {
      return;
    }

    try {
      await navigator
        .clipboard
        .writeText(
          room.code
        );

      setCodeCopied(
        true
      );

      window.setTimeout(
        () =>
          setCodeCopied(
            false
          ),
        1500
      );
    } catch {
      setError(
        "Could not copy the room code."
      );
    }
  }

  async function shareRoom() {
    if (!room) {
      return;
    }

    const roomUrl =
      `${window.location.origin}/multiplayer?room=${encodeURIComponent(
        room.code
      )}`;

    const shareText =
      `Join my Imposter room ${room.code}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Imposter Game",
          text: shareText,
          url: roomUrl,
        });
      } else {
        await navigator.clipboard.writeText(
          `${shareText}\n${roomUrl}`
        );
      }

      setShareDone(true);

      window.setTimeout(
        () =>
          setShareDone(false),
        1500
      );
    } catch (shareError) {
      if (
        shareError instanceof
          DOMException &&
        shareError.name ===
          "AbortError"
      ) {
        return;
      }

      setError(
        "Could not share the room link."
      );
    }
  }

  /*
    SETTINGS UPDATE
  */

  async function updateRoomSettings(
    patch:
      RoomSettingsPatch
  ) {
    if (
      !room ||
      !isHost ||
      settingsSaving
    ) {
      return;
    }

    if (
      room.status !==
      "lobby"
    ) {
      setError(
        "Settings cannot be changed after the game starts."
      );

      return;
    }

    const maximum =
      getMaxImposters(
        activePlayerCount
      );

    let nextMode =
      patch.mode ??
      room.mode;

    let nextImposterCount =
      patch.imposter_count ??
      room.imposter_count;

    let nextEliminationMode =
      patch.elimination_mode ??
      room.elimination_mode;

    let nextPrivateVoting =
      patch.private_phone_voting ??
      room.private_phone_voting;

    let nextRandomClueOrder =
      patch.random_clue_order ??
      room.random_clue_order;

    let nextAllowSelfVote =
      patch.allow_self_vote ??
      room.allow_self_vote;

    let nextVotingLimit =
      patch.voting_round_limit ??
      room.voting_round_limit;

    nextImposterCount =
      Math.min(
        Math.max(
          1,
          nextImposterCount
        ),
        maximum
      );

    /*
      DEFAULT RULES
    */

    if (
      nextMode ===
      "default"
    ) {
      nextRandomClueOrder =
        true;

      nextAllowSelfVote =
        false;

      if (
        !nextEliminationMode
      ) {
        nextVotingLimit =
          nextImposterCount;
      }
    }

    /*
      SELF VOTING ONLY EXISTS
      WITH PRIVATE VOTING
    */

    if (
      !nextPrivateVoting
    ) {
      nextAllowSelfVote =
        false;
    }

    /*
      ELIMINATION MODE DOES NOT
      USE A VOTING ROUND LIMIT
    */

    if (
      nextEliminationMode
    ) {
      nextVotingLimit =
        nextImposterCount;
    } else {
      nextVotingLimit =
        Math.max(
          nextImposterCount,
          nextVotingLimit
        );
    }

    setSettingsSaving(
      true
    );

    setError("");

    try {
      const {
        error:
          settingsError,
      } =
        await supabase.rpc(
          "update_game_room_settings",
          {
            p_room_id:
              room.id,

            p_mode:
              nextMode,

            p_imposter_count:
              nextImposterCount,

            p_elimination_mode:
              nextEliminationMode,

            p_private_phone_voting:
              nextPrivateVoting,

            p_random_clue_order:
              nextRandomClueOrder,

            p_allow_self_vote:
              nextAllowSelfVote,

            p_voting_round_limit:
              nextVotingLimit,
          }
        );

      if (
        settingsError
      ) {
        throw settingsError;
      }

      await refreshRoom(
        room.id
      );
    } catch (
      settingsUpdateError
    ) {
      const message =
        getErrorMessage(
          settingsUpdateError,
          "Unable to save room settings."
        );

      setError(
        getFriendlyError(
          message
        )
      );
    } finally {
      setSettingsSaving(
        false
      );
    }
  }

  /*
    CLUE / CHAT SETTINGS
  */

  async function updateClueSettings(
    patch: ClueSettingsPatch
  ) {
    if (
      !room ||
      !isHost ||
      settingsSaving
    ) {
      return;
    }

    const nextChat =
      patch.chat_enabled ??
      room.chat_enabled;

    const nextTimer =
      nextChat &&
      (
        patch.clue_timer_enabled ??
        room.clue_timer_enabled
      );

    const nextSeconds =
      Math.min(
        3600,
        Math.max(
          1,
          patch.clue_time_seconds ??
            room.clue_time_seconds
        )
      );

    const nextPenalty =
      nextTimer &&
      (
        patch.clue_miss_penalty_enabled ??
        room.clue_miss_penalty_enabled
      );

    const nextRotations =
      Math.min(
        20,
        Math.max(
          1,
          patch.clue_rotations ??
            room.clue_rotations
        )
      );

    setSettingsSaving(true);
    setError("");

    try {
      const { error: clueSettingsError } =
        await supabase.rpc(
          "update_clue_room_settings",
          {
            p_room_id: room.id,
            p_chat_enabled: nextChat,
            p_timer_enabled: nextTimer,
            p_time_seconds: nextSeconds,
            p_penalty_enabled: nextPenalty,
            p_rotations: nextRotations,
          }
        );

      if (clueSettingsError) {
        throw clueSettingsError;
      }

      await refreshRoom(
        room.id
      );
    } catch (clueSettingsUpdateError) {
      const message =
        getErrorMessage(
          clueSettingsUpdateError,
          "Unable to save clue settings."
        );

      setError(
        getFriendlyError(
          message
        )
      );
    } finally {
      setSettingsSaving(false);
    }
  }

  async function saveClueTimerSeconds() {
    if (
      !room ||
      !isHost ||
      settingsSaving
    ) {
      return;
    }

    const seconds =
      Number(
        clueTimerInput
      );

    if (
      !Number.isInteger(
        seconds
      ) ||
      seconds < 1 ||
      seconds > 3600
    ) {
      setError(
        "Enter the clue time in whole seconds from 1 to 3600."
      );
      return;
    }

    await updateClueSettings({
      clue_time_seconds:
        seconds,
    });
  }

  async function updateVoiceSetting(
    enabled: boolean
  ) {
    if (
      !room ||
      !isHost ||
      settingsSaving
    ) {
      return;
    }

    setSettingsSaving(true);
    setError("");

    try {
      const {
        error: voiceSettingError,
      } = await supabase.rpc(
        "update_voice_room_setting",
        {
          p_room_id: room.id,
          p_enabled: enabled,
        }
      );

      if (voiceSettingError) {
        throw voiceSettingError;
      }

      await refreshRoom(
        room.id
      );
    } catch (
      voiceSettingUpdateError
    ) {
      const message =
        getErrorMessage(
          voiceSettingUpdateError,
          "Unable to save the voice setting."
        );

      setError(
        getFriendlyError(message)
      );
    } finally {
      setSettingsSaving(false);
    }
  }

  /*
    SELECT MODE / APPLY DEFAULTS
  */

  async function selectMode(
    mode: GameMode
  ) {
    if (
      !room ||
      !isHost
    ) {
      return;
    }

    /*
      DEFAULT
    */

    if (
      mode ===
      "default"
    ) {
      await updateRoomSettings({
        mode:
          "default",

        random_clue_order:
          true,

        allow_self_vote:
          false,

        voting_round_limit:
          room.imposter_count,
      });

      return;
    }

    /*
      CUSTOM
    */

    if (
      mode ===
      "custom"
    ) {
      await updateRoomSettings({
        mode:
          "custom",
      });

      return;
    }

    /*
      CHAOS

      The host can select Chaos
      even before 3 players join.

      With fewer than 3 players,
      keep a safe temporary rule
      set. Once 3+ players are in
      the room, Reroll generates
      the real random Chaos rules.
    */

    if (
      mode ===
      "chaos"
    ) {
      if (
        activePlayerCount <
        3
      ) {
        await updateRoomSettings({
          mode:
            "chaos",

          imposter_count:
            1,

          elimination_mode:
            true,

          random_clue_order:
            true,

          allow_self_vote:
            room.private_phone_voting
              ? false
              : false,

          voting_round_limit:
            1,
        });

        return;
      }

      await rollChaosRules();
    }
  }

  /*
    CHAOS
  */

  async function rollChaosRules() {
    if (
      !room ||
      !isHost
    ) {
      return;
    }

    if (
      activePlayerCount <
      3
    ) {
      setError(
        "Chaos needs at least 3 players before rules can be generated."
      );

      return;
    }

    const maxImposters =
      getMaxImposters(
        activePlayerCount
      );

    const nextImposters =
      randomInt(
        maxImposters
      ) + 1;

    const nextElimination =
      randomBoolean();

    const nextRandomOrder =
      randomBoolean();

    const nextSelfVote =
      room.private_phone_voting
        ? randomBoolean()
        : false;

    let nextVotingLimit =
      nextImposters;

    if (
      !nextElimination
    ) {
      const maximumRounds =
        getChaosVotingMaximum(
          activePlayerCount,
          nextImposters
        );

      nextVotingLimit =
        nextImposters +
        randomInt(
          maximumRounds -
            nextImposters +
            1
        );
    }

    await updateRoomSettings({
      mode:
        "chaos",

      imposter_count:
        nextImposters,

      elimination_mode:
        nextElimination,

      private_phone_voting:
        room.private_phone_voting,

      random_clue_order:
        nextRandomOrder,

      allow_self_vote:
        nextSelfVote,

      voting_round_limit:
        nextVotingLimit,
    });
  }

  /*
    START GAME
  */

  async function startGame() {
    if (
      !room ||
      !isHost ||
      loading ||
      settingsSaving
    ) {
      return;
    }

    if (
      activePlayerCount < 3
    ) {
      setError(
        "At least 3 players are required to start."
      );
      return;
    }

    if (
      !settingsAreValid
    ) {
      setError(
        "Adjust the game settings before starting."
      );
      return;
    }

    setLoading(true);
    setError("");
    setPrivateRole(null);
    setRoleRevealed(false);
    setClueOrder([]);
    setClues([]);
    setClueText("");
    setClueBusy(false);
    setEditingClueId(null);
    setEditingClueText("");
    setClueSecondsLeft(null);
    expireAttemptRef.current = {
          turnKey: "",
          lastAttemptAt: 0,
          inFlight: false,
        };
    wordSubmissionRevisionRef.current =
      null;

    try {
      const {
        error:
          startError,
      } =
        await supabase.rpc(
          "start_game_room",
          {
            p_room_id:
              room.id,
          }
        );

      if (
        startError
      ) {
        throw startError;
      }

      await refreshRoom(
        room.id
      );
    } catch (
      startGameError
    ) {
      const message =
        getErrorMessage(
          startGameError,
          "Unable to start game."
        );

      setError(
        getFriendlyError(
          message
        )
      );
    } finally {
      setLoading(false);
    }
  }

  /*
    BEGIN CLUE SESSION
  */

  async function beginClueRound() {
    if (
      !room ||
      !isHost ||
      loading ||
      clueBusy
    ) {
      return;
    }

    setClueBusy(true);
    setError("");
    setClueText("");

    try {
      const { error: beginError } =
        await supabase.rpc(
          "begin_room_clue_round",
          { p_room_id: room.id }
        );

      if (beginError) {
        throw beginError;
      }

      await refreshRoom(
        room.id
      );
    } catch (beginClueError) {
      const message =
        getErrorMessage(
          beginClueError,
          "Unable to start the clue round."
        );

      setError(
        getFriendlyError(message)
      );
    } finally {
      setClueBusy(false);
    }
  }

  /*
    CHAT ON: SUBMIT ONE CLUE
  */

  async function submitClue() {
    if (
      !room ||
      room.game_phase !==
        "clue" ||
      !room.chat_enabled ||
      room.clue_session_complete ||
      !isMyClueTurn ||
      myCurrentClue ||
      clueBusy
    ) {
      return;
    }

    const cleanClue =
      clueText
        .trim()
        .replace(/\s+/g, " ");

    if (
      cleanClue.length < 1 ||
      cleanClue.length > 80
    ) {
      setError(
        "Enter a clue between 1 and 80 characters."
      );
      return;
    }

    setClueBusy(true);
    setError("");

    try {
      const { error: clueError } =
        await supabase.rpc(
          "submit_room_clue",
          {
            p_room_id: room.id,
            p_clue: cleanClue,
          }
        );

      if (clueError) {
        throw clueError;
      }

      setClueText("");

      await Promise.all([
        refreshRoom(room.id),
        loadClueData(
          room.id,
          room.game_revision
        ),
      ]);
    } catch (submitClueError) {
      const message =
        getErrorMessage(
          submitClueError,
          "Unable to submit clue."
        );

      setError(
        getFriendlyError(message)
      );
    } finally {
      setClueBusy(false);
    }
  }

  /*
    CHAT ON: EDIT EXISTING CLUE
  */

  async function saveEditedClue() {
    if (
      !room ||
      !editingClueId ||
      clueBusy
    ) {
      return;
    }

    const cleanClue =
      editingClueText
        .trim()
        .replace(/\s+/g, " ");

    if (
      cleanClue.length < 1 ||
      cleanClue.length > 80
    ) {
      setError(
        "Enter a clue between 1 and 80 characters."
      );
      return;
    }

    setClueBusy(true);
    setError("");

    try {
      const { error: editError } =
        await supabase.rpc(
          "edit_room_clue",
          {
            p_room_id: room.id,
            p_clue_id: editingClueId,
            p_clue: cleanClue,
          }
        );

      if (editError) {
        throw editError;
      }

      setEditingClueId(null);
      setEditingClueText("");

      await loadClueData(
        room.id,
        room.game_revision
      );
    } catch (editError) {
      const message =
        getErrorMessage(
          editError,
          "Unable to edit clue."
        );
      setError(
        getFriendlyError(message)
      );
    } finally {
      setClueBusy(false);
    }
  }

  /*
    TIMER DEADLINE
  */

  async function expireClueTurn() {
    if (!room) {
      expireAttemptRef.current.inFlight =
        false;
      return;
    }

    try {
      const { error: expireError } =
        await supabase.rpc(
          "expire_room_clue_turn",
          { p_room_id: room.id }
        );

      if (expireError) {
        throw expireError;
      }

      await Promise.all([
        refreshRoom(room.id),
        loadClueData(
          room.id,
          room.game_revision
        ),
      ]);
    } catch {
      // The server is the source of truth for the deadline.
      // If this browser reaches 0 slightly before the server,
      // the timer effect retries after a short delay.
    } finally {
      expireAttemptRef.current.inFlight =
        false;
    }
  }

  /*
    HOST: ADD ONE MORE CLUE ROUND
  */

  async function addAnotherClueRound() {
    if (
      !room ||
      !isHost ||
      clueBusy
    ) {
      return;
    }

    setClueBusy(true);
    setError("");

    try {
      const { error: extraError } =
        await supabase.rpc(
          "add_extra_room_clue_round",
          { p_room_id: room.id }
        );

      if (extraError) {
        throw extraError;
      }

      await refreshRoom(room.id);
    } catch (extraError) {
      const message =
        getErrorMessage(
          extraError,
          "Unable to add another clue round."
        );
      setError(
        getFriendlyError(message)
      );
    } finally {
      setClueBusy(false);
    }
  }

  /*
    HOST: PROCEED AFTER CLUES
    Online Voting ON  -> Voting
    Online Voting OFF -> Finished / Next Game
  */

  async function proceedAfterClues() {
    if (
      !room ||
      !isHost ||
      clueBusy
    ) {
      return;
    }

    setClueBusy(true);
    setError("");

    try {
      const { error: proceedError } =
        await supabase.rpc(
          "proceed_after_room_clues",
          { p_room_id: room.id }
        );

      if (proceedError) {
        throw proceedError;
      }

      await refreshRoom(room.id);
    } catch (proceedError) {
      const message =
        getErrorMessage(
          proceedError,
          "Unable to proceed after the clue round."
        );
      setError(
        getFriendlyError(message)
      );
    } finally {
      setClueBusy(false);
    }
  }

  async function startNextGame() {
    if (
      !room ||
      !isHost ||
      clueBusy
    ) {
      return;
    }

    setClueBusy(true);
    setError("");

    try {
      const {
        error:
          archiveError,
      } =
        await supabase.rpc(
          "archive_room_game_history",
          {
            p_room_id:
              room.id,
          }
        );

      if (archiveError) {
        throw archiveError;
      }

      const { error: nextGameError } =
        await supabase.rpc(
          "reset_room_for_next_game",
          { p_room_id: room.id }
        );

      if (nextGameError) {
        throw nextGameError;
      }

      setPrivateRole(null);
      setRoleRevealed(false);
      setClueOrder([]);
      setClues([]);
      setClueText("");
      setEditingClueId(null);
      setEditingClueText("");
      setExpandedCluePlayerId(null);
      setClueSecondsLeft(null);
      setVotingBusy(false);
      setMyVoteTargetId(null);
      setVoteCandidateIds([]);
      setRevealedImposterIds([]);
      setWordPeekOpen(false);

      await Promise.all([
        refreshRoom(room.id),
        loadRoomPlayers(room.id),
        loadRecentGames(),
      ]);
    } catch (nextGameError) {
      const message =
        getErrorMessage(
          nextGameError,
          "Unable to prepare the next game."
        );
      setError(
        getFriendlyError(message)
      );
    } finally {
      setClueBusy(false);
    }
  }

  /*
    ONLINE VOTING
  */

  async function submitVote(
    targetPlayerId: string
  ) {
    if (
      !room ||
      votingBusy
    ) {
      return;
    }

    setVotingBusy(true);
    setError("");

    try {
      const {
        error:
          voteError,
      } =
        await supabase.rpc(
          "submit_room_vote",
          {
            p_room_id:
              room.id,

            p_target_room_player_id:
              targetPlayerId,
          }
        );

      if (
        voteError
      ) {
        throw voteError;
      }

      setMyVoteTargetId(
        targetPlayerId
      );

      await Promise.all([
        refreshRoom(
          room.id
        ),

        loadVotingData(
          room.id,
          room.game_revision,
          room.voting_round_number,
          room.vote_ballot_number
        ),
      ]);
    } catch (
      voteSubmitError
    ) {
      const message =
        getErrorMessage(
          voteSubmitError,
          "Unable to submit vote."
        );

      setError(
        getFriendlyError(
          message
        )
      );
    } finally {
      setVotingBusy(false);
    }
  }

  async function continueAfterVoteResult() {
    if (
      !room ||
      !isHost ||
      votingBusy
    ) {
      return;
    }

    setVotingBusy(true);
    setError("");

    try {
      const {
        error:
          continueError,
      } =
        await supabase.rpc(
          "continue_after_vote_result",
          {
            p_room_id:
              room.id,
          }
        );

      if (
        continueError
      ) {
        throw continueError;
      }

      setMyVoteTargetId(null);
      setVoteCandidateIds([]);
      setWordPeekOpen(false);

      await Promise.all([
        refreshRoom(
          room.id
        ),
        loadClueData(
          room.id,
          room.game_revision
        ),
        loadRoomPlayers(
          room.id
        ),
      ]);
    } catch (
      continueVoteError
    ) {
      const message =
        getErrorMessage(
          continueVoteError,
          "Unable to continue the game."
        );

      setError(
        getFriendlyError(
          message
        )
      );
    } finally {
      setVotingBusy(false);
    }
  }

  async function revealImposters() {
    if (
      !room ||
      !isHost ||
      votingBusy
    ) {
      return;
    }

    setVotingBusy(true);
    setError("");

    try {
      const {
        error:
          revealError,
      } =
        await supabase.rpc(
          "reveal_room_imposters",
          {
            p_room_id:
              room.id,
          }
        );

      if (
        revealError
      ) {
        throw revealError;
      }

      await Promise.all([
        refreshRoom(
          room.id
        ),

        loadVotingData(
          room.id,
          room.game_revision,
          room.voting_round_number,
          room.vote_ballot_number
        ),
      ]);
    } catch (
      revealImposterError
    ) {
      const message =
        getErrorMessage(
          revealImposterError,
          "Unable to reveal the Imposter."
        );

      setError(
        getFriendlyError(
          message
        )
      );
    } finally {
      setVotingBusy(false);
    }
  }

  function renderVoiceAudio() {
    if (
      !room ||
      !room.chat_enabled ||
      !room.voice_chat_enabled
    ) {
      return null;
    }

    return (
      <>
        {remoteVoiceStreams.map(
          (item) => (
            <RemoteVoiceAudio
              key={item.userId}
              userId={item.userId}
              stream={item.stream}
              muted={
                voiceSpeakerMuted ||
                locallyMutedVoiceUsers.includes(
                  item.userId
                )
              }
            />
          )
        )}
      </>
    );
  }

  function renderVoiceQuickControls() {
    if (
      !room ||
      !room.chat_enabled ||
      !room.voice_chat_enabled
    ) {
      return null;
    }

    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() =>
            void toggleVoiceMic()
          }
          disabled={
            voiceBusy ||
            !voiceActive
          }
          title={
            voiceMuted
              ? "Turn microphone on"
              : "Turn microphone off"
          }
          aria-label={
            voiceMuted
              ? "Turn microphone on"
              : "Turn microphone off"
          }
          className={`flex h-9 w-9 items-center justify-center rounded-xl border text-base disabled:opacity-30 ${
            voiceMuted
              ? "border-white/10 bg-white/[0.04] text-zinc-400"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {voiceMuted
            ? "🎙️"
            : "🎤"}
        </button>

        <button
          type="button"
          onClick={
            voiceSpeakerMuted
              ? unmuteAllRemotePlayers
              : muteAllRemotePlayers
          }
          disabled={
            !voiceActive
          }
          title={
            voiceSpeakerMuted
              ? "Unmute everyone"
              : "Mute everyone"
          }
          aria-label={
            voiceSpeakerMuted
              ? "Unmute everyone"
              : "Mute everyone"
          }
          className={`flex h-9 w-9 items-center justify-center rounded-xl border text-base disabled:opacity-30 ${
            voiceSpeakerMuted
              ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
              : "border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
          }`}
        >
          {voiceSpeakerMuted
            ? "🔇"
            : "🔊"}
        </button>
      </div>
    );
  }

  function renderPlayerSpeakerButton(
    playerUserId: string
  ) {
    if (
      !room ||
      !room.chat_enabled ||
      !room.voice_chat_enabled ||
      playerUserId ===
        userId
    ) {
      return null;
    }

    const locallyMuted =
      voiceSpeakerMuted ||
      locallyMutedVoiceUsers.includes(
        playerUserId
      );

    return (
      <button
        type="button"
        onClick={() =>
          toggleLocalPlayerMute(
            playerUserId
          )
        }
        disabled={
          !voiceActive ||
          voiceSpeakerMuted
        }
        title={
          locallyMuted
            ? "Unmute this player"
            : "Mute this player for me"
        }
        aria-label={
          locallyMuted
            ? "Unmute this player"
            : "Mute this player for me"
        }
        className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl border text-sm disabled:opacity-30 ${
          locallyMuted
            ? "border-amber-500/30 bg-amber-500/10"
            : "border-white/10 bg-white/[0.03]"
        }`}
      >
        {locallyMuted
          ? "🔇"
          : "🔊"}
      </button>
    );
  }


  /*
    AUTH LOADING
  */

  if (
    !authReady
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#08080b] px-6 text-white">

        <div className="text-center">

          <div className="text-5xl">
            📡
          </div>

          <h1 className="mt-5 text-2xl font-black">
            Connecting
          </h1>

          <p className="mt-2 text-sm text-zinc-500">
            Preparing multiplayer...
          </p>

        </div>

      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#08080b] text-white">

      {renderVoiceAudio()}

      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 py-8">

        {/* BACK */}

        {view !==
          "lobby" && (
          <button
            onClick={() => {
              if (
                view ===
                "menu"
              ) {
                window.location.href =
                  "/";
              } else {
                setError("");

                // Keep the remembered player name,
                // but never keep an old room code.
                setJoinCode("");

                setView(
                  "menu"
                );
              }
            }}
            className="mb-8 w-fit text-sm font-semibold text-zinc-400"
          >
            ← Back
          </button>
        )}

        {/* ERROR */}

        {error && (
          <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm leading-6 text-red-300">
            {
              error
            }
          </div>
        )}

        {/* MENU */}

        {view ===
          "menu" && (
          <section>

            <p className="text-xs font-bold tracking-[0.2em] text-violet-400">
              MULTIPLE PHONES
            </p>

            <h1 className="mt-3 text-4xl font-black">
              Play together
            </h1>

            <p className="mt-3 text-sm leading-6 text-zinc-500">
              Everyone joins the same room from their own phone.
            </p>

            <div className="mt-10 space-y-4">

              <button
                onClick={() => {
                  setError("");

                  setView(
                    "create"
                  );
                }}
                className="w-full rounded-3xl border border-violet-500/40 bg-violet-500/10 p-6 text-left"
              >

                <div className="text-3xl">
                  👑
                </div>

                <h2 className="mt-5 text-xl font-black">
                  Create Room
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Become the host and share a room code with your friends.
                </p>

              </button>

              <button
                onClick={() => {
                  setError("");

                  // Every Join Room attempt starts with
                  // a fresh room-code field.
                  // The saved player name is intentionally kept.
                  setJoinCode("");

                  setView(
                    "join"
                  );
                }}
                className="w-full rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-left"
              >

                <div className="text-3xl">
                  🚪
                </div>

                <h2 className="mt-5 text-xl font-black">
                  Join Room
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Enter the host&apos;s 6-character room code.
                </p>

              </button>

            </div>

            <div className="mt-10">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-600">
                    Recent Games
                  </p>

                  <p className="mt-1 text-xs leading-5 text-zinc-600">
                    Last 2 completed multiplayer matches.
                  </p>
                </div>

                {recentGamesLoading && (
                  <span className="text-[10px] font-black text-zinc-700">
                    Loading…
                  </span>
                )}
              </div>

              {recentGames.length ===
              0 ? (
                <div className="mt-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                  <p className="text-xs text-zinc-600">
                    No completed multiplayer games yet.
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {recentGames.map(
                    (game) => {
                      const expanded =
                        expandedRecentGameId ===
                        game.id;

                      const title =
                        game.winner ===
                        "players"
                          ? "Players Won"
                          : game.winner ===
                              "imposters"
                            ? "Imposters Won"
                            : "Offline Match";

                      return (
                        <div
                          key={game.id}
                          className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedRecentGameId(
                                expanded
                                  ? null
                                  : game.id
                              )
                            }
                            className="flex w-full items-center gap-4 p-4 text-left"
                          >
                            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-violet-500/10 text-xl">
                              {game.winner ===
                              "players"
                                ? "🕵️"
                                : game.winner ===
                                    "imposters"
                                  ? "🎭"
                                  : "🎮"}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="font-black">
                                {title}
                              </p>

                              <p className="mt-1 truncate text-[11px] font-bold text-zinc-600">
                                Room {game.room_code} • {new Date(game.completed_at).toLocaleString()}
                              </p>
                            </div>

                            <span className="text-zinc-600">
                              {expanded
                                ? "▴"
                                : "▾"}
                            </span>
                          </button>

                          {expanded && (
                            <div className="border-t border-white/5 bg-black/20 p-4">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">
                                    Word
                                  </p>
                                  <p className="mt-1 break-words font-black text-zinc-300">
                                    {game.secret_word ??
                                      "—"}
                                  </p>
                                </div>

                                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">
                                    Mode
                                  </p>
                                  <p className="mt-1 font-black capitalize text-zinc-300">
                                    {game.mode}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-3 rounded-xl border border-violet-500/10 bg-violet-500/[0.04] p-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-300">
                                  Imposter{game.imposter_names.length === 1 ? "" : "s"}
                                </p>

                                <p className="mt-2 text-sm font-black">
                                  {game.imposter_names.length >
                                  0
                                    ? game.imposter_names.join(
                                        " • "
                                      )
                                    : "—"}
                                </p>
                              </div>

                              <div className="mt-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">
                                  Players
                                </p>

                                <div className="mt-2 flex flex-wrap gap-2">
                                  {game.players.map(
                                    (
                                      player,
                                      index
                                    ) => (
                                      <span
                                        key={`${player.name}-${index}`}
                                        className={`rounded-full border px-3 py-2 text-[11px] font-bold ${
                                          player.role ===
                                          "imposter"
                                            ? "border-violet-500/20 bg-violet-500/[0.06] text-violet-200"
                                            : "border-white/10 bg-white/[0.03] text-zinc-400"
                                        }`}
                                      >
                                        {player.name}
                                        {player.eliminated
                                          ? " • out"
                                          : ""}
                                      </span>
                                    )
                                  )}
                                </div>
                              </div>

                              {game.last_vote_player && (
                                <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">
                                    Last Vote Result
                                  </p>
                                  <p className="mt-1 text-sm font-bold text-zinc-300">
                                    {game.last_vote_player}
                                    {game.last_vote_was_imposter ===
                                    true
                                      ? " • Imposter"
                                      : game.last_vote_was_imposter ===
                                          false
                                        ? " • Normal player"
                                        : ""}
                                  </p>
                                </div>
                              )}

                              {game.clues.length >
                                0 && (
                                <div className="mt-4">
                                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">
                                    Clues
                                  </p>

                                  <div className="mt-2 space-y-2">
                                    {game.clues.map(
                                      (
                                        clue,
                                        index
                                      ) => (
                                        <div
                                          key={`${clue.player}-${clue.round}-${index}`}
                                          className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2"
                                        >
                                          <p className="text-xs font-black text-zinc-300">
                                            {clue.player}
                                          </p>
                                          <p className="mt-1 break-words text-xs text-zinc-500">
                                            R{clue.round}: {clue.clue}
                                            {clue.edited
                                              ? " • edited"
                                              : ""}
                                          </p>
                                        </div>
                                      )
                                    )}
                                  </div>
                                </div>
                              )}

                              {game.penalties.length >
                                0 && (
                                <div className="mt-4">
                                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-400/70">
                                    Penalties
                                  </p>

                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {game.penalties.map(
                                      (penalty) => (
                                        <span
                                          key={penalty.player}
                                          className="rounded-full border border-amber-500/10 bg-amber-500/[0.05] px-3 py-2 text-[11px] font-black text-amber-200"
                                        >
                                          {penalty.player} +{penalty.count}
                                        </span>
                                      )
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>

          </section>
        )}

        {/* CREATE */}

        {view ===
          "create" && (
          <section>

            <p className="text-xs font-bold tracking-[0.2em] text-violet-400">
              CREATE ROOM
            </p>

            <h1 className="mt-3 text-4xl font-black">
              Your name
            </h1>

            <p className="mt-3 text-sm leading-6 text-zinc-500">
              Your friends will see this name in the lobby.
            </p>

            {savedNames.length >
              0 && (
              <div className="mt-7">

                <p className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-600">
                  Saved on this phone
                </p>

                <div className="mt-3 flex max-h-32 flex-wrap gap-2 overflow-y-auto">

                  {savedNames.map(
                    (name) => (
                      <button
                        key={
                          name
                        }
                        onClick={() =>
                          setPlayerName(
                            name
                          )
                        }
                        className={`rounded-full border px-3 py-2 text-xs font-bold ${
                          playerName ===
                          name
                            ? "border-violet-500 bg-violet-500/15 text-violet-200"
                            : "border-white/10 text-zinc-400"
                        }`}
                      >
                        {
                          name
                        }
                      </button>
                    )
                  )}

                </div>

              </div>
            )}

            <input
              value={
                playerName
              }
              maxLength={
                24
              }
              onChange={(
                event
              ) =>
                setPlayerName(
                  event.target.value
                )
              }
              onKeyDown={(
                event
              ) => {
                if (
                  event.key ===
                  "Enter"
                ) {
                  void createRoom();
                }
              }}
              placeholder="Enter your name"
              className="mt-7 h-14 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-lg font-bold outline-none placeholder:text-zinc-700 focus:border-violet-500"
            />

            <button
              onClick={() =>
                void createRoom()
              }
              disabled={
                loading ||
                !playerName.trim()
              }
              className="mt-5 w-full rounded-2xl bg-violet-600 py-5 text-lg font-black disabled:opacity-30"
            >
              {
                loading
                  ? "Creating..."
                  : "Create Room"
              }
            </button>

          </section>
        )}

        {/* JOIN */}

        {view ===
          "join" && (
          <section>

            <p className="text-xs font-bold tracking-[0.2em] text-violet-400">
              JOIN ROOM
            </p>

            <h1 className="mt-3 text-4xl font-black">
              Enter room code
            </h1>

            <p className="mt-3 text-sm leading-6 text-zinc-500">
              Get the 6-character code from the room host.
            </p>

            <p className="mt-8 text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
              Room Code
            </p>

            <input
              value={
                joinCode
              }
              maxLength={
                6
              }
              autoCapitalize="characters"
              onChange={(
                event
              ) =>
                setJoinCode(
                  event.target.value
                    .toUpperCase()
                    .replace(
                      /[^A-Z0-9]/g,
                      ""
                    )
                )
              }
              placeholder="ABC123"
              className="mt-3 h-20 w-full rounded-3xl border border-white/10 bg-white/[0.04] px-4 text-center text-4xl font-black uppercase tracking-[0.2em] outline-none placeholder:text-zinc-800 focus:border-violet-500"
            />

            {savedNames.length >
              0 && (
              <div className="mt-7">

                <p className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-600">
                  Saved Names
                </p>

                <div className="mt-3 flex max-h-32 flex-wrap gap-2 overflow-y-auto">

                  {savedNames.map(
                    (name) => (
                      <button
                        key={
                          name
                        }
                        onClick={() =>
                          setPlayerName(
                            name
                          )
                        }
                        className={`rounded-full border px-3 py-2 text-xs font-bold ${
                          playerName ===
                          name
                            ? "border-violet-500 bg-violet-500/15 text-violet-200"
                            : "border-white/10 text-zinc-400"
                        }`}
                      >
                        {
                          name
                        }
                      </button>
                    )
                  )}

                </div>

              </div>
            )}

            <p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
              Your Name
            </p>

            <input
              value={
                playerName
              }
              maxLength={
                24
              }
              onChange={(
                event
              ) =>
                setPlayerName(
                  event.target.value
                )
              }
              onKeyDown={(
                event
              ) => {
                if (
                  event.key ===
                  "Enter"
                ) {
                  void joinRoom();
                }
              }}
              placeholder="Your name"
              className="mt-3 h-14 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 font-bold outline-none placeholder:text-zinc-700 focus:border-violet-500"
            />

            <button
              onClick={() =>
                void joinRoom()
              }
              disabled={
                loading ||
                joinCode.length !==
                  6 ||
                !playerName.trim()
              }
              className="mt-5 w-full rounded-2xl bg-violet-600 py-5 text-lg font-black disabled:opacity-30"
            >
              {
                loading
                  ? "Joining..."
                  : "Join Room"
              }
            </button>

          </section>
        )}

        {/* LOBBY */}

        {view ===
          "lobby" &&
          room &&
          room.status ===
            "lobby" && (
          <section className="flex min-h-[calc(100vh-4rem)] flex-col">

            {/* HEADER */}

            <div className="flex items-start justify-between gap-4">

              <div>

                <p className="text-xs font-bold tracking-[0.2em] text-violet-400">
                  MULTIPLAYER LOBBY
                </p>

                <h1 className="mt-3 text-3xl font-black">
                  {
                    isHost
                      ? "Your Room"
                      : "Joined Room"
                  }
                </h1>

              </div>

              <div
                className={`rounded-full px-3 py-2 text-[10px] font-black ${
                  realtimeStatus ===
                  "Live"
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "bg-amber-500/10 text-amber-300"
                }`}
              >
                ●{" "}
                {
                  realtimeStatus
                }
              </div>

            </div>

            {/* ROOM CODE */}

            <div className="mt-7 rounded-[2rem] border border-violet-500/30 bg-violet-500/10 p-6 text-center">

              <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">
                Room Code
              </p>

              <p className="mt-3 text-5xl font-black tracking-[0.16em]">
                {
                  room.code
                }
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  onClick={() =>
                    void copyRoomCode()
                  }
                  className="rounded-xl border border-violet-500/30 bg-black/20 px-4 py-3 text-xs font-bold text-violet-200"
                >
                  {codeCopied
                    ? "✓ Copied"
                    : "Copy Code"}
                </button>

                <button
                  onClick={() =>
                    void shareRoom()
                  }
                  className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-xs font-bold text-violet-100"
                >
                  {shareDone
                    ? "✓ Shared"
                    : "Share Room"}
                </button>
              </div>

            </div>

            {/* PLAYERS */}

            <div className="mt-8">

              <div className="flex items-end justify-between">

                <div>

                  <h2 className="text-xl font-black">
                    Players
                  </h2>

                  <p className="mt-1 text-xs text-zinc-500">
                    Everyone updates automatically.
                  </p>

                </div>

                <div className="flex items-center gap-2">
                  {renderVoiceQuickControls()}

                  <span className="rounded-full bg-white/5 px-3 py-2 text-xs font-black text-zinc-400">
                    {
                      activePlayerCount
                    }
                  </span>
                </div>

              </div>

              <div className="mt-5 space-y-3">

                {roomPlayers.map(
                  (player) => {
                    const isMe =
                      player.user_id ===
                      userId;

                    return (
                      <div
                        key={
                          player.id
                        }
                        className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                      >

                        <div
                          className={`flex h-11 w-11 flex-none items-center justify-center rounded-2xl ${
                            player.is_host
                              ? "bg-amber-500/10"
                              : "bg-violet-500/10"
                          }`}
                        >
                          {
                            player.is_host
                              ? "👑"
                              : "👤"
                          }
                        </div>

                        <div className="min-w-0 flex-1">

                          <div className="flex items-center gap-2">

                            <p className="truncate font-black">
                              {
                                player.name
                              }
                            </p>

                            {isMe && (
                              <span className="rounded-full bg-violet-500/10 px-2 py-1 text-[9px] font-black text-violet-300">
                                YOU
                              </span>
                            )}

                          </div>

                          <p className="mt-1 text-xs text-zinc-600">
                            {
                              player.is_host
                                ? "Host"
                                : player.is_spectator
                                  ? "Spectator"
                                  : "Player"
                            }
                          </p>

                        </div>

                        {renderPlayerSpeakerButton(
                          player.user_id
                        )}

                        {isHost &&
                          !player.is_host && (
                          <button
                            onClick={() =>
                              void removePlayer(
                                player.id
                              )
                            }
                            disabled={
                              loading
                            }
                            className="rounded-xl border border-red-500/20 px-3 py-2 text-xs font-bold text-red-300 disabled:opacity-30"
                          >
                            Remove
                          </button>
                        )}

                      </div>
                    );
                  }
                )}

              </div>

            </div>


            {/* GAME SETUP */}

            <div className="mt-9 border-t border-white/10 pt-8">

              <div className="flex items-start justify-between gap-4">

                <div>

                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-400">
                    Game Setup
                  </p>

                  <h2 className="mt-2 text-2xl font-black">
                    {
                      isHost
                        ? "Choose the rules"
                        : "Host settings"
                    }
                  </h2>

                </div>

                {settingsSaving && (
                  <span className="rounded-full bg-amber-500/10 px-3 py-2 text-[10px] font-black text-amber-300">
                    Syncing...
                  </span>
                )}

              </div>

              {!isHost && (
                <div className="mt-4 rounded-2xl border border-emerald-500/10 bg-emerald-500/5 p-4">

                  <p className="text-xs leading-5 text-emerald-200">
                    These settings are controlled by the host and update live on your phone.
                  </p>

                </div>
              )}

              {/* MODE */}

              <div className="mt-7">

                <p className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-600">
                  Game Mode
                </p>

                <div className="mt-3 grid grid-cols-3 gap-2">

                  {(
                    [
                      {
                        id:
                          "default" as const,

                        icon:
                          "⚡",

                        name:
                          "Default",
                      },

                      {
                        id:
                          "custom" as const,

                        icon:
                          "⚙️",

                        name:
                          "Custom",
                      },

                      {
                        id:
                          "chaos" as const,

                        icon:
                          "🎲",

                        name:
                          "Chaos",
                      },
                    ]
                  ).map(
                    (mode) => (
                      <button
                        key={
                          mode.id
                        }
                        onClick={() => {
                          if (
                            isHost
                          ) {
                            void selectMode(
                              mode.id
                            );
                          }
                        }}
                        disabled={
                          !isHost ||
                          settingsSaving
                        }
                        className={`rounded-2xl border p-3 text-center transition ${
                          room.mode ===
                          mode.id
                            ? mode.id ===
                              "chaos"
                              ? "border-fuchsia-500 bg-fuchsia-500/10"
                              : "border-violet-500 bg-violet-500/10"
                            : "border-white/10 bg-white/[0.02]"
                        } disabled:cursor-default`}
                      >

                        <div className="text-xl">
                          {
                            mode.icon
                          }
                        </div>

                        <p className="mt-2 text-xs font-black">
                          {
                            mode.name
                          }
                        </p>

                      </button>
                    )
                  )}

                </div>

              </div>

              {/* CHAOS */}

              {room.mode ===
                "chaos" && (
                <div className="mt-5 rounded-3xl border border-fuchsia-500/20 bg-fuchsia-500/[0.05] p-5">

                  <div className="flex items-center justify-between gap-4">

                    <div>

                      <h3 className="font-black text-fuchsia-200">
                        Chaos Rules
                      </h3>

                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        Random but always valid.
                      </p>

                    </div>

                    {isHost && (
                      <button
                        onClick={() =>
                          void rollChaosRules()
                        }
                        disabled={
                          settingsSaving ||
                          activePlayerCount <
                            3
                        }
                        className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-2 text-xs font-black text-fuchsia-200 disabled:opacity-30"
                      >
                        🎲 Reroll
                      </button>
                    )}

                  </div>

                </div>
              )}

              {/* SETTINGS SUMMARY / CONTROLS */}

              <div className="mt-5 space-y-4">

                {/* IMPOSTER COUNT */}

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">

                  <div className="flex items-center justify-between">

                    <div>

                      <h3 className="font-black">
                        Imposters
                      </h3>

                      <p className="mt-1 text-xs text-zinc-500">
                        Recommended{" "}
                        {
                          recommendedImposters
                        }{" "}
                        • Max{" "}
                        {
                          maximumImposters
                        }
                      </p>

                    </div>

                    {isHost &&
                    room.mode !==
                      "chaos" ? (
                      <div className="flex items-center gap-3">

                        <button
                          onClick={() =>
                            void updateRoomSettings({
                              imposter_count:
                                Math.max(
                                  1,
                                  room.imposter_count -
                                    1
                                ),
                            })
                          }
                          disabled={
                            settingsSaving ||
                            room.imposter_count <=
                              1
                          }
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-xl disabled:opacity-20"
                        >
                          −
                        </button>

                        <span className="min-w-7 text-center text-2xl font-black">
                          {
                            room.imposter_count
                          }
                        </span>

                        <button
                          onClick={() =>
                            void updateRoomSettings({
                              imposter_count:
                                Math.min(
                                  maximumImposters,
                                  room.imposter_count +
                                    1
                                ),
                            })
                          }
                          disabled={
                            settingsSaving ||
                            room.imposter_count >=
                              maximumImposters
                          }
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-xl text-violet-300 disabled:opacity-20"
                        >
                          +
                        </button>

                      </div>
                    ) : (
                      <p className="text-2xl font-black">
                        {
                          room.imposter_count
                        }
                      </p>
                    )}

                  </div>

                </div>

                {/* ELIMINATION */}

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">

                  <div className="flex items-center justify-between gap-4">

                    <div>

                      <h3 className="font-black">
                        Elimination Mode
                      </h3>

                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        Voted players are removed and become spectators.
                      </p>

                    </div>

                    {isHost &&
                    room.mode !==
                      "chaos" ? (
                      <button
                        onClick={() =>
                          void updateRoomSettings({
                            elimination_mode:
                              !room.elimination_mode,
                          })
                        }
                        disabled={
                          settingsSaving
                        }
                        className={`relative h-8 w-14 flex-none rounded-full transition ${
                          room.elimination_mode
                            ? "bg-violet-600"
                            : "bg-zinc-700"
                        }`}
                      >

                        <span
                          className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
                            room.elimination_mode
                              ? "left-7"
                              : "left-1"
                          }`}
                        />

                      </button>
                    ) : (
                      <span
                        className={`rounded-full px-3 py-2 text-xs font-black ${
                          room.elimination_mode
                            ? "bg-violet-500/10 text-violet-300"
                            : "bg-amber-500/10 text-amber-300"
                        }`}
                      >
                        {
                          room.elimination_mode
                            ? "ON"
                            : "OFF"
                        }
                      </span>
                    )}

                  </div>

                </div>

                {/* CUSTOM OPTIONS */}

                {room.mode ===
                  "custom" && (
                  <>

                    {/* RANDOM ORDER */}

                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">

                      <div className="flex items-center justify-between gap-4">

                        <div>

                          <h3 className="font-black">
                            Random Clue Order
                          </h3>

                          <p className="mt-1 text-xs text-zinc-500">
                            Shuffle clue order each round.
                          </p>

                        </div>

                        {isHost ? (
                          <button
                            onClick={() =>
                              void updateRoomSettings({
                                random_clue_order:
                                  !room.random_clue_order,
                              })
                            }
                            disabled={
                              settingsSaving
                            }
                            className={`relative h-8 w-14 flex-none rounded-full transition ${
                              room.random_clue_order
                                ? "bg-violet-600"
                                : "bg-zinc-700"
                            }`}
                          >

                            <span
                              className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
                                room.random_clue_order
                                  ? "left-7"
                                  : "left-1"
                              }`}
                            />

                          </button>
                        ) : (
                          <span className="text-xs font-black text-zinc-400">
                            {
                              room.random_clue_order
                                ? "ON"
                                : "OFF"
                            }
                          </span>
                        )}

                      </div>

                    </div>

                    {/* SELF VOTE */}

                    {room.private_phone_voting && (
                      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">

                        <div className="flex items-center justify-between gap-4">

                          <div>

                            <h3 className="font-black">
                              Allow Self Vote
                            </h3>

                            <p className="mt-1 text-xs text-zinc-500">
                              Players may vote for themselves.
                            </p>

                          </div>

                          {isHost ? (
                            <button
                              onClick={() =>
                                void updateRoomSettings({
                                  allow_self_vote:
                                    !room.allow_self_vote,
                                })
                              }
                              disabled={
                                settingsSaving
                              }
                              className={`relative h-8 w-14 flex-none rounded-full transition ${
                                room.allow_self_vote
                                  ? "bg-violet-600"
                                  : "bg-zinc-700"
                              }`}
                            >

                              <span
                                className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
                                  room.allow_self_vote
                                    ? "left-7"
                                    : "left-1"
                                }`}
                              />

                            </button>
                          ) : (
                            <span className="text-xs font-black text-zinc-400">
                              {
                                room.allow_self_vote
                                  ? "ON"
                                  : "OFF"
                              }
                            </span>
                          )}

                        </div>

                      </div>
                    )}

                    {/* VOTING ROUNDS */}

                    {!room.elimination_mode && (
                      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">

                        <div>

                          <h3 className="font-black">
                            Voting Rounds
                          </h3>

                          <p className="mt-1 text-xs text-zinc-500">
                            Number of guesses available before Imposters win.
                          </p>

                        </div>

                        <div className="mt-4 flex items-center justify-between">

                          {isHost ? (
                            <button
                              onClick={() =>
                                void updateRoomSettings({
                                  voting_round_limit:
                                    Math.max(
                                      room.imposter_count,
                                      room.voting_round_limit -
                                        1
                                    ),
                                })
                              }
                              disabled={
                                settingsSaving ||
                                room.voting_round_limit <=
                                  room.imposter_count
                              }
                              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-xl disabled:opacity-20"
                            >
                              −
                            </button>
                          ) : (
                            <div />
                          )}

                          <div className="text-center">

                            <p className="text-3xl font-black">
                              {
                                room.voting_round_limit
                              }
                            </p>

                            <p className="mt-1 text-xs text-zinc-500">
                              Rounds
                            </p>

                          </div>

                          {isHost ? (
                            <button
                              onClick={() =>
                                void updateRoomSettings({
                                  voting_round_limit:
                                    Math.min(
                                      50,
                                      room.voting_round_limit +
                                        1
                                    ),
                                })
                              }
                              disabled={
                                settingsSaving ||
                                room.voting_round_limit >=
                                  50
                              }
                              className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-xl text-violet-300 disabled:opacity-20"
                            >
                              +
                            </button>
                          ) : (
                            <div />
                          )}

                        </div>

                      </div>
                    )}

                  </>
                )}

                {/* CHAOS SUMMARY */}

                {room.mode ===
                  "chaos" && (
                  <div className="rounded-3xl border border-fuchsia-500/20 bg-fuchsia-500/[0.04] p-5">

                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-fuchsia-300">
                      Chaos Summary
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">

                      <div className="rounded-2xl bg-black/20 p-3">
                        <p className="text-xs text-zinc-600">
                          Clue Order
                        </p>

                        <p className="mt-1 font-black">
                          {
                            room.random_clue_order
                              ? "Random"
                              : "Saved"
                          }
                        </p>
                      </div>

                      <div className="rounded-2xl bg-black/20 p-3">
                        <p className="text-xs text-zinc-600">
                          Self Vote
                        </p>

                        <p className="mt-1 font-black">
                          {
                            !room.private_phone_voting
                              ? "Not Used"
                              : room.allow_self_vote
                                ? "Allowed"
                                : "Blocked"
                          }
                        </p>
                      </div>

                      <div className="rounded-2xl bg-black/20 p-3">
                        <p className="text-xs text-zinc-600">
                          Vote Limit
                        </p>

                        <p className="mt-1 font-black">
                          {
                            room.elimination_mode
                              ? "No Limit"
                              : `${room.voting_round_limit} rounds`
                          }
                        </p>
                      </div>

                      <div className="rounded-2xl bg-black/20 p-3">
                        <p className="text-xs text-zinc-600">
                          Revision
                        </p>

                        <p className="mt-1 font-black">
                          #
                          {
                            room.settings_revision
                          }
                        </p>
                      </div>

                    </div>

                  </div>
                )}

              </div>

            </div>

            {/* INVALID SETTINGS */}

            {!settingsAreValid &&
              activePlayerCount >=
                3 && (
              <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">

                <p className="text-sm leading-6 text-amber-200">
                  The player count changed. The host needs to adjust the number of Imposters before starting.
                </p>

              </div>
            )}

            {/* CLUE COMMUNICATION */}

            <div className="mt-9 border-t border-white/10 pt-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-400">
                Clue Communication
              </p>

              <h2 className="mt-2 text-2xl font-black">
                Chat / Typed Clues
              </h2>

              <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-black">
                      Chat
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      {room.chat_enabled
                        ? "Online-style play: players type one clue on their own phone."
                        : "Together/offline-style play: the app shares roles, words, clue order, and rotations."}
                    </p>
                  </div>

                  {isHost ? (
                    <button
                      onClick={() =>
                        void updateClueSettings({
                          chat_enabled:
                            !room.chat_enabled,
                        })
                      }
                      disabled={settingsSaving}
                      className={`relative h-8 w-14 flex-none rounded-full transition ${
                        room.chat_enabled
                          ? "bg-violet-600"
                          : "bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
                          room.chat_enabled
                            ? "left-7"
                            : "left-1"
                        }`}
                      />
                    </button>
                  ) : (
                    <span className="rounded-full bg-white/5 px-3 py-2 text-xs font-black text-zinc-400">
                      {room.chat_enabled ? "ON" : "OFF"}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-black">
                      Voice Chat
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      {room.voice_chat_enabled
                        ? "Voice connects automatically for listening. Each player taps the mic icon only when they want to speak."
                        : room.chat_enabled
                          ? "Optional live voice for remote play. The microphone stays OFF until the player taps the mic icon."
                          : "Turn Chat ON first. Voice Chat is meant for remote/online play."}
                    </p>
                  </div>

                  {isHost ? (
                    <button
                      onClick={() =>
                        void updateVoiceSetting(
                          !room.voice_chat_enabled
                        )
                      }
                      disabled={
                        settingsSaving ||
                        !room.chat_enabled
                      }
                      className={`relative h-8 w-14 flex-none rounded-full transition disabled:opacity-30 ${
                        room.voice_chat_enabled
                          ? "bg-violet-600"
                          : "bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
                          room.voice_chat_enabled
                            ? "left-7"
                            : "left-1"
                        }`}
                      />
                    </button>
                  ) : (
                    <span className="rounded-full bg-white/5 px-3 py-2 text-xs font-black text-zinc-400">
                      {room.voice_chat_enabled ? "ON" : "OFF"}
                    </span>
                  )}
                </div>

                <p className="mt-3 text-[11px] leading-5 text-zinc-600">
                  No audio is recorded or saved by the game. Leaving voice stops your microphone tracks.
                </p>
              </div>

              <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-black">
                      Online Voting
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      {room.private_phone_voting
                        ? "Voting will happen privately on each player&apos;s phone."
                        : "Voting stays offline with the group. The app will move to Next Game after clues."}
                    </p>
                  </div>

                  {isHost ? (
                    <button
                      onClick={() =>
                        void updateRoomSettings({
                          private_phone_voting:
                            !room.private_phone_voting,
                        })
                      }
                      disabled={settingsSaving}
                      className={`relative h-8 w-14 flex-none rounded-full transition ${
                        room.private_phone_voting
                          ? "bg-violet-600"
                          : "bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
                          room.private_phone_voting
                            ? "left-7"
                            : "left-1"
                        }`}
                      />
                    </button>
                  ) : (
                    <span className="rounded-full bg-white/5 px-3 py-2 text-xs font-black text-zinc-400">
                      {room.private_phone_voting ? "ON" : "OFF"}
                    </span>
                  )}
                </div>

                <p className="mt-3 text-[11px] leading-5 text-zinc-600">
                  Chat OFF defaults this to OFF. Chat ON defaults this to ON. The host can override it afterward.
                </p>
              </div>

              {!room.chat_enabled ? (
                <div className="mt-4 rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.04] p-4">
                  <p className="text-sm font-black text-emerald-200">
                    Spoken mode
                  </p>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    No typed clues, clue history, timer, missed-turn penalty, or per-player Done button. Everyone simply follows the displayed clue order and speaks aloud.
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="font-black">
                          Clue Timer
                        </h3>
                        <p className="mt-1 text-xs text-zinc-500">
                          Optional deadline for each typed clue.
                        </p>
                      </div>

                      {isHost ? (
                        <button
                          onClick={() =>
                            void updateClueSettings({
                              clue_timer_enabled:
                                !room.clue_timer_enabled,
                            })
                          }
                          disabled={settingsSaving}
                          className={`relative h-8 w-14 flex-none rounded-full transition ${
                            room.clue_timer_enabled
                              ? "bg-violet-600"
                              : "bg-zinc-700"
                          }`}
                        >
                          <span
                            className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
                              room.clue_timer_enabled
                                ? "left-7"
                                : "left-1"
                            }`}
                          />
                        </button>
                      ) : (
                        <span className="text-xs font-black text-zinc-400">
                          {room.clue_timer_enabled ? "ON" : "OFF"}
                        </span>
                      )}
                    </div>

                    {room.clue_timer_enabled && (
                      <div className="mt-5">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-600">
                          Seconds per clue
                        </p>

                        {isHost ? (
                          <div className="mt-3 flex gap-2">
                            <input
                              type="number"
                              min={1}
                              max={3600}
                              step={1}
                              inputMode="numeric"
                              value={clueTimerInput}
                              onChange={(event) =>
                                setClueTimerInput(
                                  event.target.value.replace(
                                    /[^0-9]/g,
                                    ""
                                  )
                                )
                              }
                              placeholder="e.g. 14 or 80"
                              className="h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 font-black outline-none focus:border-violet-500"
                            />

                            <button
                              onClick={() =>
                                void saveClueTimerSeconds()
                              }
                              disabled={
                                settingsSaving ||
                                !clueTimerInput
                              }
                              className="rounded-xl bg-violet-600 px-4 text-xs font-black disabled:opacity-30"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <p className="mt-3 text-2xl font-black">
                            {room.clue_time_seconds}s
                          </p>
                        )}

                        <p className="mt-2 text-[11px] leading-5 text-zinc-600">
                          Enter any whole number from 1 to 3600 seconds.
                        </p>
                      </div>
                    )}
                  </div>

                  {room.clue_timer_enabled && (
                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="font-black">
                            Missed Turn Penalty
                          </h3>
                          <p className="mt-1 text-xs leading-5 text-zinc-500">
                            A missed deadline is saved as one extra suspicion vote for the later voting calculation.
                          </p>
                        </div>

                        {isHost ? (
                          <button
                            onClick={() =>
                              void updateClueSettings({
                                clue_miss_penalty_enabled:
                                  !room.clue_miss_penalty_enabled,
                              })
                            }
                            disabled={settingsSaving}
                            className={`relative h-8 w-14 flex-none rounded-full transition ${
                              room.clue_miss_penalty_enabled
                                ? "bg-violet-600"
                                : "bg-zinc-700"
                            }`}
                          >
                            <span
                              className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
                                room.clue_miss_penalty_enabled
                                  ? "left-7"
                                  : "left-1"
                              }`}
                            />
                          </button>
                        ) : (
                          <span className="text-xs font-black text-zinc-400">
                            {room.clue_miss_penalty_enabled ? "ON" : "OFF"}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div>
                  <h3 className="font-black">
                    Clue Rotations
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    Every active player gets one turn in each rotation.
                  </p>
                </div>

                <div className="mt-5 flex items-center justify-between">
                  {isHost ? (
                    <button
                      onClick={() =>
                        void updateClueSettings({
                          clue_rotations:
                            Math.max(
                              1,
                              room.clue_rotations - 1
                            ),
                        })
                      }
                      disabled={
                        settingsSaving ||
                        room.clue_rotations <= 1
                      }
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-xl disabled:opacity-20"
                    >
                      −
                    </button>
                  ) : (
                    <div />
                  )}

                  <div className="text-center">
                    <p className="text-3xl font-black">
                      {room.clue_rotations}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {room.clue_rotations === 1
                        ? "Rotation"
                        : "Rotations"}
                    </p>
                  </div>

                  {isHost ? (
                    <button
                      onClick={() =>
                        void updateClueSettings({
                          clue_rotations:
                            Math.min(
                              20,
                              room.clue_rotations + 1
                            ),
                        })
                      }
                      disabled={
                        settingsSaving ||
                        room.clue_rotations >= 20
                      }
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-xl text-violet-300 disabled:opacity-20"
                    >
                      +
                    </button>
                  ) : (
                    <div />
                  )}
                </div>
              </div>
            </div>

            {/* START AREA */}

            <div className="mt-auto pt-10">

              {isHost ? (
                <>

                  <button
                    onClick={() =>
                      void startGame()
                    }
                    disabled={
                      loading ||
                      settingsSaving ||
                      activePlayerCount <
                        3 ||
                      !settingsAreValid
                    }
                    className="w-full rounded-2xl bg-violet-600 py-5 text-lg font-black disabled:opacity-30"
                  >
                    {
                      loading
                        ? "Starting..."
                        : activePlayerCount <
                            3
                          ? `Need ${3 - activePlayerCount} more player${3 - activePlayerCount === 1 ? "" : "s"}`
                          : "Start Game"
                    }
                  </button>

                  <p className="mt-3 text-center text-xs leading-5 text-zinc-600">
                    Roles are assigned privately. Each phone can read only its own role.
                  </p>

                </>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">

                  <p className="font-bold">
                    Waiting for the host
                  </p>

                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    You can watch every setting change live. The host will start the game.
                  </p>

                </div>
              )}

              <button
                onClick={() =>
                  void leaveRoom()
                }
                disabled={
                  loading
                }
                className="mt-4 w-full rounded-2xl border border-white/10 py-4 font-bold text-zinc-400 disabled:opacity-30"
              >
                {
                  isHost
                    ? "Close Room & Leave"
                    : "Leave Room"
                }
              </button>

            </div>

          </section>
        )}

        {/* ACTIVE GAME */}

        {view ===
          "lobby" &&
          room &&
          room.status !==
            "lobby" && (
          <section className="flex min-h-[calc(100vh-4rem)] flex-col">

            <div className="flex items-start justify-between gap-4">

              <div>
                <p className="text-xs font-bold tracking-[0.2em] text-violet-400">
                  ROOM {room.code}
                </p>

                <h1 className="mt-3 text-3xl font-black">
                  {
                    room.game_phase ===
                    "preparing"
                      ? "Preparing game"
                      : room.game_phase ===
                          "role_reveal"
                        ? "Your private role"
                        : room.game_phase ===
                            "clue"
                          ? room.chat_enabled
                            ? `Clue Round ${room.clue_round_number}`
                            : "Clue Order"
                          : room.game_phase ===
                              "voting"
                            ? "Voting"
                            : "Game in progress"
                  }
                </h1>
              </div>

              <div className="flex items-center gap-2">
                {renderVoiceQuickControls()}

                <div
                  className={`rounded-full px-3 py-2 text-[10px] font-black ${
                    realtimeStatus ===
                    "Live"
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "bg-amber-500/10 text-amber-300"
                  }`}
                >
                  ● {realtimeStatus}
                </div>
              </div>

            </div>


            {room.game_phase ===
              "preparing" && (
              <div className="mt-10">

                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[2rem] border border-violet-500/20 bg-violet-500/10 text-5xl">
                  🔐
                </div>

                <div className="mt-7 text-center">
                  <h2 className="text-2xl font-black">
                    Roles assigned securely
                  </h2>

                  <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-zinc-500">
                    Keep this screen private. The secret word is being prepared without exposing it to any Imposter.
                  </p>
                </div>

                <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/10">
                      {wordSubmitting ? "🔄" : "✓"}
                    </div>

                    <div>
                      <p className="font-black">
                        {
                          privateRole
                            ? "Your private role is ready"
                            : "Receiving your private role"
                        }
                      </p>

                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        Do not show your phone to the other players.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-violet-500/15 bg-violet-500/[0.05] p-4 text-center">
                  <p className="text-xs leading-5 text-violet-200">
                    Waiting for all private game data to finish syncing…
                  </p>
                </div>

              </div>
            )}

            {room.game_phase ===
              "role_reveal" && (
              <div className="mt-9">

                <div className="rounded-3xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-center">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-300">
                    Private Screen
                  </p>

                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Hold your phone so nobody else can see it before revealing your role.
                  </p>
                </div>

                {!privateRole ? (
                  <div className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 text-center">
                    <div className="text-4xl">🔄</div>
                    <p className="mt-4 font-black">
                      Loading your private role…
                    </p>
                  </div>
                ) : !roleRevealed ? (
                  <button
                    onClick={() =>
                      setRoleRevealed(
                        true
                      )
                    }
                    className="mt-6 w-full rounded-[2rem] border border-violet-500/30 bg-violet-500/10 px-6 py-14 text-center"
                  >
                    <div className="text-6xl">🙈</div>

                    <p className="mt-6 text-2xl font-black">
                      Tap to reveal
                    </p>

                    <p className="mt-2 text-sm text-zinc-500">
                      Only you should look at this screen.
                    </p>
                  </button>
                ) : (
                  <div className="mt-6 rounded-[2rem] border border-violet-500/30 bg-violet-500/[0.07] p-7 text-center">
                    <div className="text-6xl">
                      🎭
                    </div>

                    <p className="mt-6 text-xs font-black uppercase tracking-[0.22em] text-violet-300">
                      Your Role
                    </p>

                    <h2 className="mt-3 text-4xl font-black">
                      {
                        privateRole.role ===
                        "imposter"
                          ? "IMPOSTER"
                          : "PLAYER"
                      }
                    </h2>

                    <div className="mt-7 rounded-3xl border border-white/10 bg-black/20 p-6">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
                        Secret Word
                      </p>

                      <p className="mt-3 break-words text-3xl font-black">
                        {
                          privateRole.role ===
                          "player"
                            ? privateRole.secret_word ??
                              "Loading…"
                            : "???"
                        }
                      </p>

                      <p className="mt-4 text-xs leading-5 text-zinc-500">
                        Keep this screen private. Do not let another player see your role.
                      </p>
                    </div>

                    <button
                      onClick={() =>
                        setRoleRevealed(
                          false
                        )
                      }
                      className="mt-6 w-full rounded-2xl border border-white/10 py-4 font-black text-zinc-300"
                    >
                      Hide My Role
                    </button>
                  </div>
                )}

                {isHost ? (
                  <div className="mt-6 rounded-3xl border border-violet-500/20 bg-violet-500/[0.05] p-5 text-center">
                    <p className="font-black">
                      Everyone checked their role?
                    </p>

                    <p className="mt-2 text-sm leading-6 text-zinc-500">
                      Start the clue round after every player has privately seen and hidden their role.
                    </p>

                    <button
                      onClick={() =>
                        void beginClueRound()
                      }
                      disabled={
                        clueBusy
                      }
                      className="mt-5 w-full rounded-2xl bg-violet-600 py-4 font-black disabled:opacity-30"
                    >
                      {
                        clueBusy
                          ? "Starting..."
                          : "Start Clue Round"
                      }
                    </button>
                  </div>
                ) : (
                  <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
                    <p className="font-black">
                      Waiting for the host
                    </p>

                    <p className="mt-2 text-sm leading-6 text-zinc-500">
                      Hide your role after checking it. The host will start the clue round.
                    </p>
                  </div>
                )}

              </div>
            )}

            {room.game_phase ===
              "clue" && (
              <div className="mt-8">

                <div className="mb-6 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  {!wordPeekOpen ? (
                    <button
                      onClick={() =>
                        setWordPeekOpen(
                          true
                        )
                      }
                      className="w-full rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] py-3 text-sm font-black text-violet-200"
                    >
                      👁 View My Word
                    </button>
                  ) : (
                    <div className="text-center">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">
                        Private
                      </p>

                      <div className="mt-4 text-4xl">
                        🎭
                      </div>

                      <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
                        Secret Word
                      </p>

                      <p className="mt-2 break-words text-3xl font-black">
                        {
                          privateRole?.role ===
                          "player"
                            ? privateRole.secret_word ??
                              "Loading…"
                            : "???"
                        }
                      </p>

                      <button
                        onClick={() =>
                          setWordPeekOpen(
                            false
                          )
                        }
                        className="mt-5 w-full rounded-2xl border border-white/10 py-3 font-black text-zinc-300"
                      >
                        Hide
                      </button>
                    </div>
                  )}
                </div>

                {!room.chat_enabled ? (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-400">
                          Together / Offline Clues
                        </p>

                        <h2 className="mt-2 text-2xl font-black">
                          Follow the clue order
                        </h2>

                        <p className="mt-2 text-sm leading-6 text-zinc-500">
                          Say clues aloud in this order. There is no Done button, timer, typed chat, clue history, or missed-turn penalty.
                        </p>
                      </div>

                      <span className="rounded-full bg-white/5 px-3 py-2 text-xs font-black text-zinc-400">
                        CHAT OFF
                      </span>
                    </div>

                    <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                      <div className="flex items-center justify-between gap-4">
                        <h3 className="font-black">
                          Clue Order
                        </h3>

                        <span className="rounded-full bg-white/5 px-3 py-2 text-[10px] font-black text-zinc-500">
                          {room.clue_rotations} rotation{room.clue_rotations === 1 ? "" : "s"}
                        </span>
                      </div>

                      <p className="mt-2 text-xs leading-5 text-zinc-600">
                        Follow this same order for every rotation in this match.
                      </p>

                      <div className="mt-4 space-y-2">
                        {gameClueOrder.length > 0 ? (
                          gameClueOrder.map(
                            (item, index) => {
                              const player =
                                roomPlayers.find(
                                  (candidate) =>
                                    candidate.id ===
                                    item.room_player_id
                                );

                              return (
                                <div
                                  key={item.room_player_id}
                                  className="flex items-center gap-3 rounded-2xl bg-black/20 px-4 py-3"
                                >
                                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-violet-500/10 text-xs font-black text-violet-300">
                                    {index + 1}
                                  </div>

                                  <p className="min-w-0 flex-1 truncate font-black">
                                    {player?.name ??
                                      "Player"}
                                  </p>
                                </div>
                              );
                            }
                          )
                        ) : (
                          <p className="text-sm text-zinc-600">
                            Loading order…
                          </p>
                        )}
                      </div>
                    </div>

                    {isHost ? (
                      <div className="mt-7 grid gap-3">
                        <button
                          onClick={() =>
                            void proceedAfterClues()
                          }
                          disabled={clueBusy}
                          className="w-full rounded-2xl bg-violet-600 py-4 font-black disabled:opacity-30"
                        >
                          {clueBusy
                            ? "Proceeding..."
                            : room.private_phone_voting
                              ? "Proceed to Online Voting"
                              : "Clues Finished — Next Game"}
                        </button>

                        <button
                          onClick={() =>
                            void addAnotherClueRound()
                          }
                          disabled={
                            clueBusy ||
                            room.clue_rotations >=
                              20
                          }
                          className="w-full rounded-2xl border border-white/10 py-4 font-black text-zinc-300 disabled:opacity-30"
                        >
                          + Add Another Rotation
                        </button>

                        <p className="text-center text-xs leading-5 text-zinc-600">
                          {room.private_phone_voting
                            ? "Online Voting is ON, so Proceed opens voting on every phone."
                            : "Online Voting is OFF, so your group can vote/discuss offline and then start the next game."}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
                        <p className="font-black">
                          Follow the displayed order
                        </p>
                        <p className="mt-2 text-xs leading-5 text-zinc-600">
                          The host will proceed after the group finishes the clue rotations.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-400">
                          Rotation {room.clue_round_number} / {room.clue_rotations}
                        </p>

                        <h2 className="mt-2 text-2xl font-black">
                          {room.clue_session_complete
                            ? "Clue rounds complete"
                            : "Typed clue round"}
                        </h2>

                        <p className="mt-2 text-sm leading-6 text-zinc-500">
                          One fixed player order for the match. Tap any player to view their clues; your clue box appears inside your own row when it is your turn.
                        </p>
                      </div>

                      <span className="rounded-full bg-violet-500/10 px-3 py-2 text-xs font-black text-violet-300">
                        CHAT ON
                      </span>
                    </div>

                    <div className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-black">
                            Clue Board
                          </h3>

                          <p className="mt-1 text-xs leading-5 text-zinc-500">
                            One player list only. Tap a name to view that player&apos;s clues from every rotation.
                          </p>
                        </div>

                        {!room.clue_session_complete && (
                          <span className="rounded-full bg-violet-500/10 px-3 py-2 text-[10px] font-black text-violet-300">
                            Round {room.clue_round_number}
                          </span>
                        )}
                      </div>

                      <div className="mt-5 space-y-3">
                        {gameClueOrder.map(
                          (baseItem, index) => {
                            const player =
                              roomPlayers.find(
                                (candidate) =>
                                  candidate.id ===
                                  baseItem.room_player_id
                              );

                            if (!player) {
                              return null;
                            }

                            const currentItem =
                              currentRoundOrder.find(
                                (item) =>
                                  item.room_player_id ===
                                  player.id
                              );

                            const active =
                              Boolean(
                                currentItem &&
                                currentItem.turn_position ===
                                  room.clue_turn_index &&
                                currentItem.turn_status ===
                                  "pending" &&
                                !room.clue_session_complete
                              );

                            const isMe =
                              player.user_id ===
                              userId;

                            const expanded =
                              expandedCluePlayerId ===
                              player.id;

                            const playerClues =
                              clues
                                .filter(
                                  (clue) =>
                                    clue.room_player_id ===
                                    player.id
                                )
                                .sort(
                                  (a, b) =>
                                    a.round_number -
                                    b.round_number
                                );

                            const playerMisses =
                              clueOrder
                                .filter(
                                  (item) =>
                                    item.room_player_id ===
                                      player.id &&
                                    item.turn_status ===
                                      "missed"
                                )
                                .sort(
                                  (a, b) =>
                                    a.round_number -
                                    b.round_number
                                );

                            const rounds =
                              Array.from(
                                new Set([
                                  ...playerClues.map(
                                    (clue) =>
                                      clue.round_number
                                  ),
                                  ...playerMisses.map(
                                    (item) =>
                                      item.round_number
                                  ),
                                ])
                              ).sort(
                                (a, b) =>
                                  a - b
                              );

                            const myActiveTurn =
                              active &&
                              isMe &&
                              !myCurrentClue &&
                              !clueDeadlineReached;

                            return (
                              <div
                                key={player.id}
                                className={`overflow-hidden rounded-2xl border transition-all duration-200 hover:scale-[1.01] ${
                                  active
                                    ? "border-violet-500/40 bg-violet-500/[0.09]"
                                    : expanded
                                      ? "border-white/20 bg-white/[0.05]"
                                      : "border-white/5 bg-black/20"
                                }`}
                              >
                                <div className="flex items-center gap-3 p-3">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedCluePlayerId(
                                        expanded
                                          ? null
                                          : player.id
                                      )
                                    }
                                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                  >
                                    <div
                                      className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl text-xs font-black ${
                                        active
                                          ? "bg-violet-500/20 text-violet-200"
                                          : "bg-white/5 text-zinc-500"
                                      }`}
                                    >
                                      {index + 1}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <p className="truncate font-black">
                                        {player.name}
                                        {isMe
                                          ? " (You)"
                                          : ""}
                                      </p>

                                      <p className="mt-1 text-[10px] font-bold text-zinc-600">
                                        {expanded
                                          ? "Tap to hide clues"
                                          : rounds.length > 0
                                            ? `${rounds.length} clue ${rounds.length === 1 ? "round" : "rounds"} • Tap to view`
                                            : "Tap to view clues"}
                                      </p>
                                    </div>
                                  </button>

                                  {renderPlayerSpeakerButton(
                                    player.user_id
                                  )}

                                  {!room.clue_session_complete && (
                                    <div className="flex flex-col items-end gap-1">
                                      {active &&
                                        room.clue_timer_enabled &&
                                        clueSecondsLeft !==
                                          null && (
                                        <span
                                          className={`rounded-full px-2 py-1 text-[10px] font-black ${
                                            clueSecondsLeft <=
                                            5
                                              ? "bg-amber-500/10 text-amber-300"
                                              : "bg-white/5 text-zinc-300"
                                          }`}
                                        >
                                          ⏱ {clueSecondsLeft}s
                                        </span>
                                      )}

                                      <span
                                        className={`text-[10px] font-black uppercase ${
                                          currentItem?.turn_status ===
                                          "submitted"
                                            ? "text-emerald-300"
                                            : currentItem?.turn_status ===
                                                "missed"
                                              ? "text-amber-300"
                                              : active
                                                ? "text-violet-300"
                                                : "text-zinc-600"
                                        }`}
                                      >
                                        {currentItem?.turn_status ===
                                        "submitted"
                                          ? "Sent"
                                          : currentItem?.turn_status ===
                                              "missed"
                                            ? "Missed"
                                            : active
                                              ? "Now"
                                              : "Waiting"}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {myActiveTurn && (
                                  <div className="border-t border-emerald-500/10 bg-emerald-500/[0.04] p-4">
                                    <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-300">
                                      Your turn — type one clue
                                    </p>

                                    <input
                                      value={clueText}
                                      maxLength={80}
                                      onChange={(event) =>
                                        setClueText(
                                          event.target.value
                                        )
                                      }
                                      onKeyDown={(event) => {
                                        if (
                                          event.key ===
                                          "Enter"
                                        ) {
                                          void submitClue();
                                        }
                                      }}
                                      placeholder="Type one clue..."
                                      className="mt-3 h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 font-bold outline-none placeholder:text-zinc-700 focus:border-emerald-500"
                                    />

                                    <div className="mt-2 flex items-center justify-between gap-3">
                                      <span className="text-[10px] font-bold text-zinc-600">
                                        {clueText.length}/80
                                      </span>

                                      <button
                                        onClick={() =>
                                          void submitClue()
                                        }
                                        disabled={
                                          clueBusy ||
                                          !clueText.trim()
                                        }
                                        className="rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black disabled:opacity-30"
                                      >
                                        {clueBusy
                                          ? "Sending..."
                                          : "Send Clue"}
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {active &&
                                  isMe &&
                                  clueDeadlineReached &&
                                  !myCurrentClue && (
                                  <div className="border-t border-amber-500/10 bg-amber-500/[0.04] p-4 text-center">
                                    <p className="text-xs font-black text-amber-200">
                                      ⏱ Time expired — marking this turn as missed...
                                    </p>
                                  </div>
                                )}

                                {expanded && (
                                  <div className="border-t border-white/5 bg-black/20 p-4">
                                    {rounds.length ===
                                    0 ? (
                                      <p className="text-xs text-zinc-600">
                                        No clue has been submitted yet.
                                      </p>
                                    ) : (
                                      <div className="space-y-2">
                                        {rounds.map(
                                          (roundNumber) => {
                                            const clue =
                                              playerClues.find(
                                                (item) =>
                                                  item.round_number ===
                                                  roundNumber
                                              );

                                            const missed =
                                              playerMisses.find(
                                                (item) =>
                                                  item.round_number ===
                                                  roundNumber
                                              );

                                            return (
                                              <div
                                                key={roundNumber}
                                                className="rounded-xl border border-white/5 bg-white/[0.02] p-3"
                                              >
                                                <div className="flex items-start justify-between gap-3">
                                                  <div className="min-w-0 flex-1">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-600">
                                                      Round {roundNumber}
                                                    </p>

                                                    <p className="mt-1 break-words text-sm font-bold text-zinc-300">
                                                      {clue
                                                        ? clue.clue_text
                                                        : "Missed deadline"}
                                                    </p>

                                                    {clue?.edited_at && (
                                                      <p className="mt-1 text-[10px] text-zinc-600">
                                                        Edited
                                                      </p>
                                                    )}

                                                    {missed?.penalty_applied && (
                                                      <p className="mt-2 text-xs font-bold text-amber-300">
                                                        +1 suspicion vote
                                                      </p>
                                                    )}
                                                  </div>

                                                  {clue &&
                                                    clue.user_id ===
                                                      userId &&
                                                    room.game_phase ===
                                                      "clue" &&
                                                    editingClueId !==
                                                      clue.id && (
                                                    <button
                                                      onClick={() => {
                                                        setEditingClueId(
                                                          clue.id
                                                        );
                                                        setEditingClueText(
                                                          clue.clue_text
                                                        );
                                                      }}
                                                      className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-zinc-400"
                                                    >
                                                      Edit
                                                    </button>
                                                  )}
                                                </div>

                                                {clue &&
                                                  editingClueId ===
                                                    clue.id && (
                                                  <div className="mt-4">
                                                    <input
                                                      value={
                                                        editingClueText
                                                      }
                                                      maxLength={80}
                                                      onChange={(event) =>
                                                        setEditingClueText(
                                                          event.target.value
                                                        )
                                                      }
                                                      className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-3 font-bold outline-none focus:border-violet-500"
                                                    />

                                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                                      <button
                                                        onClick={() => {
                                                          setEditingClueId(
                                                            null
                                                          );
                                                          setEditingClueText(
                                                            ""
                                                          );
                                                        }}
                                                        disabled={
                                                          clueBusy
                                                        }
                                                        className="rounded-xl border border-white/10 py-3 text-xs font-black text-zinc-400 disabled:opacity-30"
                                                      >
                                                        Cancel
                                                      </button>

                                                      <button
                                                        onClick={() =>
                                                          void saveEditedClue()
                                                        }
                                                        disabled={
                                                          clueBusy ||
                                                          !editingClueText.trim()
                                                        }
                                                        className="rounded-xl bg-violet-600 py-3 text-xs font-black disabled:opacity-30"
                                                      >
                                                        Save Edit
                                                      </button>
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          }
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          }
                        )}
                      </div>

                      {gameClueOrder.length ===
                        0 && (
                        <p className="mt-5 text-sm text-zinc-600">
                          Loading clue order…
                        </p>
                      )}
                    </div>

                    {room.clue_session_complete && (
                      <div className="mt-8 rounded-[2rem] border border-emerald-500/20 bg-emerald-500/[0.05] p-7 text-center">
                        <div className="text-5xl">✅</div>

                        <h2 className="mt-5 text-2xl font-black">
                          Clue rounds complete
                        </h2>

                        <p className="mt-3 text-sm leading-6 text-zinc-500">
                          All {room.clue_rotations} configured rotation{room.clue_rotations === 1 ? "" : "s"} are complete.
                        </p>

                        {isHost ? (
                          <div className="mt-6 grid gap-3">
                            <button
                              onClick={() =>
                                void proceedAfterClues()
                              }
                              disabled={clueBusy}
                              className="w-full rounded-2xl bg-violet-600 py-4 font-black disabled:opacity-30"
                            >
                              {room.private_phone_voting
                                ? "Go to Online Voting"
                                : "Finish — Next Game"}
                            </button>

                            <button
                              onClick={() =>
                                void addAnotherClueRound()
                              }
                              disabled={
                                clueBusy ||
                                room.clue_rotations >=
                                  20
                              }
                              className="w-full rounded-2xl border border-white/10 py-4 font-black text-zinc-300 disabled:opacity-30"
                            >
                              + Add Another Clue Round
                            </button>
                          </div>
                        ) : (
                          <p className="mt-5 text-xs font-bold text-zinc-600">
                            Waiting for the host.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}

              </div>
            )}

            {room.game_phase ===
              "voting" && (
              <div className="mt-8">
                <div className="rounded-[2rem] border border-violet-500/20 bg-violet-500/[0.05] p-6">
                  <div className="text-center">
                    <div className="text-5xl">🗳️</div>

                    <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-violet-300">
                      {
                        room.vote_stage ===
                        "tie_break"
                          ? `Re-vote • Ballot ${room.vote_ballot_number}`
                          : `Voting Round ${room.voting_round_number}`
                      }
                    </p>

                    <h2 className="mt-2 text-2xl font-black">
                      Vote privately
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-zinc-500">
                      {
                        room.vote_stage ===
                        "tie_break"
                          ? "The previous vote was tied. Vote again — you may choose any active player."
                          : "Choose the player you suspect. Other players cannot see your vote."
                      }
                    </p>

                    <div className="mt-4 rounded-2xl bg-black/20 px-4 py-3 text-sm font-black text-zinc-300">
                      {room.votes_submitted_count}/{room.votes_required_count} votes submitted
                    </div>

                    {room.vote_stage ===
                      "tie_break" &&
                      tiedVotePlayers.length >
                        0 && (
                      <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] p-4">
                        <p className="text-xs font-black uppercase tracking-[0.15em] text-amber-300">
                          Previous Vote Tied
                        </p>

                        <p className="mt-2 text-sm font-black leading-6 text-white">
                          {tiedVotePlayers
                            .map(
                              (player) =>
                                player.name
                            )
                            .join(" • ")}
                        </p>

                        <p className="mt-2 text-xs leading-5 text-zinc-500">
                          These players tied in the previous ballot. This is a full re-vote, so you can vote for any active player again.
                        </p>
                      </div>
                    )}
                  </div>

                  {myRoomPlayer?.is_spectator ? (
                    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
                      <p className="font-black">
                        You are a spectator
                      </p>
                      <p className="mt-2 text-sm text-zinc-500">
                        Spectators cannot vote.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-6 space-y-3">
                      {eligibleVotePlayers.map(
                        (player) => {
                          const selected =
                            myVoteTargetId ===
                            player.id;

                          return (
                            <button
                              key={
                                player.id
                              }
                              onClick={() =>
                                void submitVote(
                                  player.id
                                )
                              }
                              disabled={
                                votingBusy
                              }
                              className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left ${
                                selected
                                  ? "border-violet-500 bg-violet-500/10"
                                  : "border-white/10 bg-white/[0.03]"
                              } disabled:opacity-50`}
                            >
                              <div>
                                <p className="font-black">
                                  {
                                    player.name
                                  }
                                </p>

                                <p className="mt-1 text-xs text-zinc-600">
                                  {
                                    player.user_id ===
                                    userId
                                      ? "You"
                                      : "Player"
                                  }
                                </p>
                              </div>

                              <span className="text-sm font-black text-violet-300">
                                {
                                  selected
                                    ? "✓ Voted"
                                    : "Vote"
                                }
                              </span>
                            </button>
                          );
                        }
                      )}
                    </div>
                  )}

                  {myVoteTargetId && (
                    <p className="mt-5 text-center text-xs leading-5 text-zinc-600">
                      Your latest vote is saved. You may change it until everyone has voted.
                    </p>
                  )}
                </div>
              </div>
            )}

            {room.game_phase ===
              "result" && (
              <div className="mt-8">
                <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-7 text-center">
                  <div className="text-5xl">
                    {
                      room.vote_winner
                        ? "🏁"
                        : "📣"
                    }
                  </div>

                  <h2 className="mt-5 text-2xl font-black">
                    {
                      room.vote_winner ===
                      "players"
                        ? "Players Win"
                        : room.vote_winner ===
                            "imposters"
                          ? "Imposters Win"
                          : room.elimination_mode
                            ? "Player Eliminated"
                            : room.vote_result_was_imposter
                              ? "Imposter Caught"
                              : "Wrong Guess"
                    }
                  </h2>

                  {voteResultPlayer && (
                    <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-600">
                        Voting Result
                      </p>

                      <p className="mt-2 text-2xl font-black">
                        {
                          voteResultPlayer.name
                        }
                      </p>

                      <p className="mt-2 text-sm font-bold text-zinc-400">
                        {
                          room.vote_result_was_imposter
                            ? "Was an Imposter"
                            : "Was not an Imposter"
                        }
                      </p>
                    </div>
                  )}

                  {room.imposters_revealed && (
                    <div className="mt-6 rounded-3xl border border-violet-500/20 bg-violet-500/[0.05] p-5">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-300">
                        {
                          revealedImposterPlayers.length ===
                          1
                            ? "The Imposter Was"
                            : "The Imposters Were"
                        }
                      </p>

                      <div className="mt-4 space-y-2">
                        {revealedImposterPlayers.map(
                          (player) => (
                            <p
                              key={
                                player.id
                              }
                              className="text-2xl font-black"
                            >
                              {
                                player.name
                              }
                            </p>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {isHost ? (
                    <div className="mt-6 grid gap-3">
                      {!room.vote_winner ? (
                        <button
                          onClick={() =>
                            void continueAfterVoteResult()
                          }
                          disabled={
                            votingBusy
                          }
                          className="w-full rounded-2xl bg-violet-600 py-4 font-black disabled:opacity-30"
                        >
                          Continue to Next Clue Round
                        </button>
                      ) : (
                        <>
                          {!room.imposters_revealed && (
                            <button
                              onClick={() =>
                                void revealImposters()
                              }
                              disabled={
                                votingBusy
                              }
                              className="w-full rounded-2xl bg-violet-600 py-4 font-black disabled:opacity-30"
                            >
                              Reveal Imposter{room.imposter_count === 1 ? "" : "s"}
                            </button>
                          )}

                          <button
                            onClick={() =>
                              void startNextGame()
                            }
                            disabled={
                              votingBusy ||
                              clueBusy
                            }
                            className="w-full rounded-2xl border border-white/10 py-4 font-black text-zinc-300 disabled:opacity-30"
                          >
                            Play Next Game
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="mt-6 text-xs font-bold text-zinc-600">
                      Waiting for the host.
                    </p>
                  )}
                </div>
              </div>
            )}

            {room.game_phase ===
              "finished" && (
              <div className="mt-8">
                <div className="rounded-[2rem] border border-emerald-500/20 bg-emerald-500/[0.05] p-7 text-center">
                  <div className="text-5xl">✅</div>

                  <h2 className="mt-5 text-2xl font-black">
                    Game complete
                  </h2>

                  <p className="mt-3 text-sm leading-6 text-zinc-500">
                    Online Voting was OFF. Make your guess together, then reveal the answer if you want.
                  </p>

                  {room.imposters_revealed && (
                    <div className="mt-6 rounded-3xl border border-violet-500/20 bg-violet-500/[0.05] p-5">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-300">
                        {
                          revealedImposterPlayers.length ===
                          1
                            ? "The Imposter Was"
                            : "The Imposters Were"
                        }
                      </p>

                      <div className="mt-4 space-y-2">
                        {revealedImposterPlayers.map(
                          (player) => (
                            <p
                              key={
                                player.id
                              }
                              className="text-2xl font-black"
                            >
                              {
                                player.name
                              }
                            </p>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {isHost ? (
                    <div className="mt-6 grid gap-3">
                      {!room.imposters_revealed && (
                        <button
                          onClick={() =>
                            void revealImposters()
                          }
                          disabled={
                            votingBusy
                          }
                          className="w-full rounded-2xl bg-violet-600 py-4 font-black disabled:opacity-30"
                        >
                          Reveal Imposter{room.imposter_count === 1 ? "" : "s"}
                        </button>
                      )}

                      <button
                        onClick={() =>
                          void startNextGame()
                        }
                        disabled={
                          clueBusy ||
                          votingBusy
                        }
                        className="w-full rounded-2xl border border-white/10 py-4 font-black text-zinc-300 disabled:opacity-30"
                      >
                        Play Next Game
                      </button>
                    </div>
                  ) : (
                    <p className="mt-5 text-xs font-bold text-zinc-600">
                      Waiting for the host.
                    </p>
                  )}
                </div>
              </div>
            )}

            {room.game_phase !==
              "preparing" &&
              room.game_phase !==
                "role_reveal" &&
              room.game_phase !==
                "clue" &&
              room.game_phase !==
                "voting" &&
              room.game_phase !==
                "result" &&
              room.game_phase !==
                "finished" && (
              <div className="mt-10 rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 text-center">
                <div className="text-5xl">🎮</div>
                <h2 className="mt-5 text-2xl font-black">
                  Game in progress
                </h2>
                <p className="mt-3 text-sm leading-6 text-zinc-500">
                  Current phase: {room.game_phase}
                </p>
              </div>
            )}

            <div className="mt-auto pt-10">
              <button
                onClick={() =>
                  void leaveRoom()
                }
                disabled={loading}
                className="w-full rounded-2xl border border-white/10 py-4 font-bold text-zinc-400 disabled:opacity-30"
              >
                {
                  isHost
                    ? "Close Room & Leave"
                    : "Leave Game"
                }
              </button>
            </div>

          </section>
        )}

      </div>

    </main>
  );
}