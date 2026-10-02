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

type Room = {
  id: string;
  code: string;
  host_user_id: string;
  status:
    | "lobby"
    | "playing"
    | "finished";
  mode:
    | "default"
    | "custom"
    | "chaos";
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
    return "That room has already started or finished.";
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
    return "Your game session could not be created. Refresh and try again.";
  }

  if (
    message.includes(
      "NOT_HOST"
    )
  ) {
    return "Only the room host can do that.";
  }

  return message;
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

        setView("menu");

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
          console.error(
            playersError
          );

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
              "id, code, host_user_id, status, mode, created_at, updated_at"
            )
            .eq(
              "id",
              roomId
            )
            .maybeSingle();

        if (
          roomError
        ) {
          console.error(
            roomError
          );

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
    BOOTSTRAP AUTH

    Each device gets its own
    anonymous Supabase user.
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
            "Unable to create player session."
          );
        }

        if (cancelled) {
          return;
        }

        setUserId(
          currentUser.id
        );

        /*
          Remember the player's
          preferred multiplayer name.
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
          Reuse names already saved
          in Single Phone mode.
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
          Basic room resume.

          Because anonymous auth
          persists in this browser,
          refreshing the lobby does
          not immediately lose it.
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
                    "id, code, host_user_id, status, mode, created_at, updated_at"
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
        console.error(
          bootstrapError
        );

        const message =
          bootstrapError instanceof
          Error
            ? bootstrapError.message
            : "Unable to connect to multiplayer.";

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
    REALTIME LOBBY
  */

  useEffect(() => {
    if (!room) {
      return;
    }

    void loadRoomPlayers(
      room.id
    );

    const channel =
      supabase
        .channel(
          `imposter-room-${room.id}`
        )

        /*
          Players joining /
          changing /
          leaving.
        */

        .on(
          "postgres_changes",
          {
            event: "*",
            schema:
              "public",
            table:
              "room_players",
            filter:
              `room_id=eq.${room.id}`,
          },
          () => {
            void loadRoomPlayers(
              room.id
            );
          }
        )

        /*
          Room status changes
          or host closing room.
        */

        .on(
          "postgres_changes",
          {
            event: "*",
            schema:
              "public",
            table:
              "rooms",
            filter:
              `id=eq.${room.id}`,
          },
          () => {
            void refreshRoom(
              room.id
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
      Small fallback refresh.

      Realtime remains the main
      system. This simply helps
      recover if a browser sleeps
      or temporarily loses signal.
    */

    const refreshTimer =
      window.setInterval(
        () => {
          void refreshRoom(
            room.id
          );

          void loadRoomPlayers(
            room.id
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
          "id, code, host_user_id, status, mode, created_at, updated_at"
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
      console.error(
        createRoomError
      );

      const message =
        createRoomError instanceof
        Error
          ? createRoomError.message
          : "Unable to create room.";

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
      console.error(
        joinRoomError
      );

      const message =
        joinRoomError instanceof
        Error
          ? joinRoomError.message
          : "Unable to join room.";

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
      console.error(
        leaveRoomError
      );

      const message =
        leaveRoomError instanceof
        Error
          ? leaveRoomError.message
          : "Unable to leave room.";

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
    HOST REMOVE PLAYER
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
      console.error(
        removePlayerError
      );

      const message =
        removePlayerError instanceof
        Error
          ? removePlayerError.message
          : "Unable to remove player.";

      setError(
        getFriendlyError(
          message
        )
      );
    } finally {
      setLoading(false);
    }
  }

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
    INITIAL CONNECTION
  */

  if (!authReady) {
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

        {/* TOP BAR */}

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

            {/* CODE */}

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
                    Everyone in the room updates automatically.
                  </p>

                </div>

                <span className="rounded-full bg-white/5 px-3 py-2 text-xs font-black text-zinc-400">
                  {
                    roomPlayers.length
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
                    Player syncing works first. Game start, roles and voting are the next phase.
                  </p>

                </>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">

                  <p className="font-bold">
                    Waiting for the host
                  </p>

                  <p className="mt-2 text-sm text-zinc-500">
                    The game will begin when the host starts it.
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