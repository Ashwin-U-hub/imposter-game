"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  supabase,
} from "@/lib/supabase";

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

        setRoom(null);

        setRoomPlayers([]);

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
      []
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
    SELECT MODE
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

          private_phone_voting:
            false,

          random_clue_order:
            true,

          allow_self_vote:
            false,

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

    const nextPrivateVoting =
      randomBoolean();

    const nextRandomOrder =
      randomBoolean();

    const nextSelfVote =
      nextPrivateVoting
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
        nextPrivateVoting,

      random_clue_order:
        nextRandomOrder,

      allow_self_vote:
        nextSelfVote,

      voting_round_limit:
        nextVotingLimit,
    });
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
              className="mt-8 h-20 w-full rounded-3xl border border-white/10 bg-white/[0.04] px-4 text-center text-4xl font-black uppercase tracking-[0.2em] outline-none placeholder:text-zinc-800 focus:border-violet-500"
            />

            {savedNames.length >
              0 && (
              <div className="mt-7">

                <p className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-600">
                  Your name
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
                  void joinRoom();
                }
              }}
              placeholder="Your name"
              className="mt-5 h-14 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 font-bold outline-none placeholder:text-zinc-700 focus:border-violet-500"
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
          room && (
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

              <button
                onClick={() =>
                  void copyRoomCode()
                }
                className="mt-5 rounded-xl border border-violet-500/30 bg-black/20 px-4 py-2 text-xs font-bold text-violet-200"
              >
                {
                  codeCopied
                    ? "✓ Copied"
                    : "Copy Code"
                }
              </button>

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

                <span className="rounded-full bg-white/5 px-3 py-2 text-xs font-black text-zinc-400">
                  {
                    activePlayerCount
                  }
                </span>

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

                {/* PRIVATE VOTE */}

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">

                  <div className="flex items-center justify-between gap-4">

                    <div>

                      <h3 className="font-black">
                        Private Voting
                      </h3>

                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        Everyone votes privately from their own phone.
                      </p>

                    </div>

                    {isHost &&
                    room.mode !==
                      "chaos" ? (
                      <button
                        onClick={() =>
                          void updateRoomSettings({
                            private_phone_voting:
                              !room.private_phone_voting,
                          })
                        }
                        disabled={
                          settingsSaving
                        }
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
                      <span
                        className={`rounded-full px-3 py-2 text-xs font-black ${
                          room.private_phone_voting
                            ? "bg-violet-500/10 text-violet-300"
                            : "bg-white/5 text-zinc-500"
                        }`}
                      >
                        {
                          room.private_phone_voting
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

            {/* START AREA */}

            <div className="mt-auto pt-10">

              {isHost ? (
                <>

                  <button
                    disabled
                    className="w-full rounded-2xl bg-violet-600 py-5 text-lg font-black opacity-40"
                  >
                    Start Game
                  </button>

                  <p className="mt-3 text-center text-xs leading-5 text-zinc-600">
                    Settings synchronization is ready. Secure role assignment is the next phase.
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

      </div>

    </main>
  );
}