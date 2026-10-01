"use client";

import {
  KeyboardEvent,
  useEffect,
  useState,
} from "react";

const PLAYER_POOL_KEY =
  "imposter-saved-players-v1";

const SELECTED_PLAYERS_KEY =
  "imposter-selected-players-v1";

type PlayerRosterProps = {
  selectedPlayers: string[];

  onSelectedPlayersChange: (
    players: string[]
  ) => void;
};

function cleanName(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ");
}

function removeDuplicates(
  names: string[]
) {
  const seen = new Set<string>();

  return names.filter((name) => {
    const key = name.toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export default function PlayerRoster({
  selectedPlayers,
  onSelectedPlayersChange,
}: PlayerRosterProps) {
  const [savedPlayers, setSavedPlayers] =
    useState<string[]>([]);

  const [
    newPlayerName,
    setNewPlayerName,
  ] = useState("");

  const [manageMode, setManageMode] =
    useState(false);

  const [loaded, setLoaded] =
    useState(false);

  const [message, setMessage] =
    useState("");

  useEffect(() => {
    try {
      const storedPlayers =
        localStorage.getItem(
          PLAYER_POOL_KEY
        );

      const storedSelected =
        localStorage.getItem(
          SELECTED_PLAYERS_KEY
        );

      let pool: string[] = [];
      let selected: string[] = [];

      if (storedPlayers) {
        const parsed =
          JSON.parse(storedPlayers);

        if (Array.isArray(parsed)) {
          pool = removeDuplicates(
            parsed
              .map((name) =>
                cleanName(String(name))
              )
              .filter(Boolean)
          );
        }
      }

      if (storedSelected) {
        const parsed =
          JSON.parse(storedSelected);

        if (Array.isArray(parsed)) {
          selected = removeDuplicates(
            parsed
              .map((name) =>
                cleanName(String(name))
              )
              .filter(Boolean)
          );
        }
      }

      selected = selected.filter(
        (selectedName) =>
          pool.some(
            (savedName) =>
              savedName.toLowerCase() ===
              selectedName.toLowerCase()
          )
      );

      setSavedPlayers(pool);

      onSelectedPlayersChange(
        selected
      );
    } catch {
      setSavedPlayers([]);

      onSelectedPlayersChange([]);
    }

    setLoaded(true);
  }, [onSelectedPlayersChange]);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    try {
      localStorage.setItem(
        PLAYER_POOL_KEY,
        JSON.stringify(savedPlayers)
      );
    } catch {
      // Continue even if storage
      // is unavailable.
    }
  }, [savedPlayers, loaded]);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    try {
      localStorage.setItem(
        SELECTED_PLAYERS_KEY,
        JSON.stringify(
          selectedPlayers
        )
      );
    } catch {
      // Continue even if storage
      // is unavailable.
    }
  }, [selectedPlayers, loaded]);

  function addPlayer() {
    const name =
      cleanName(newPlayerName);

    setMessage("");

    if (!name) {
      return;
    }

    const alreadyExists =
      savedPlayers.some(
        (player) =>
          player.toLowerCase() ===
          name.toLowerCase()
      );

    if (alreadyExists) {
      setMessage(
        "That player is already saved."
      );

      return;
    }

    setSavedPlayers(
      (current) => [
        ...current,
        name,
      ]
    );

    /*
      Automatically select newly
      created players for the current game.
    */
    onSelectedPlayersChange([
      ...selectedPlayers,
      name,
    ]);

    setNewPlayerName("");
  }

  function handleInputKeyDown(
    event: KeyboardEvent<HTMLInputElement>
  ) {
    if (event.key === "Enter") {
      event.preventDefault();
      addPlayer();
    }
  }

  function togglePlayer(
    name: string
  ) {
    const isSelected =
      selectedPlayers.includes(name);

    if (isSelected) {
      onSelectedPlayersChange(
        selectedPlayers.filter(
          (player) =>
            player !== name
        )
      );
    } else {
      onSelectedPlayersChange([
        ...selectedPlayers,
        name,
      ]);
    }
  }

  function deletePlayer(
    name: string
  ) {
    setSavedPlayers(
      (current) =>
        current.filter(
          (player) =>
            player !== name
        )
    );

    onSelectedPlayersChange(
      selectedPlayers.filter(
        (player) =>
          player !== name
      )
    );
  }

  function clearSelection() {
    onSelectedPlayersChange([]);
  }

  return (
    <div className="mt-7">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black">
            Saved Players
          </h2>

          <p className="mt-1 text-xs text-zinc-500">
            {selectedPlayers.length} selected
            {" • "}
            {savedPlayers.length} saved
          </p>
        </div>

        {savedPlayers.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setManageMode(
                (current) =>
                  !current
              )
            }
            className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
              manageMode
                ? "border-red-500/40 bg-red-500/10 text-red-300"
                : "border-white/10 text-zinc-400"
            }`}
          >
            {manageMode
              ? "Done"
              : "Manage"}
          </button>
        )}
      </div>

      {savedPlayers.length === 0 ? (
        <div className="mt-4 rounded-3xl border border-dashed border-white/15 bg-white/[0.02] px-5 py-8 text-center">
          <div className="text-3xl">
            👥
          </div>

          <p className="mt-4 font-bold">
            No saved players yet
          </p>

          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Add your friends once.
            They&apos;ll stay here for
            future games.
          </p>
        </div>
      ) : (
        <div className="mt-4 max-h-64 overflow-y-auto rounded-3xl border border-white/10 bg-white/[0.025] p-3">
          <div className="grid grid-cols-4 gap-2">
            {savedPlayers.map(
              (name) => {
                const selected =
                  selectedPlayers.includes(
                    name
                  );

                return (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    onClick={() => {
                      if (manageMode) {
                        deletePlayer(
                          name
                        );
                      } else {
                        togglePlayer(
                          name
                        );
                      }
                    }}
                    className={`relative min-h-16 rounded-2xl border px-2 py-3 text-center transition ${
                      manageMode
                        ? "border-red-500/20 bg-red-500/5 text-zinc-300"
                        : selected
                          ? "border-violet-500 bg-violet-500/15 text-violet-200"
                          : "border-white/10 bg-white/[0.03] text-zinc-400"
                    }`}
                  >
                    {manageMode && (
                      <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20 text-xs text-red-300">
                        ×
                      </span>
                    )}

                    {!manageMode &&
                      selected && (
                        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-[10px] font-black text-white">
                          ✓
                        </span>
                      )}

                    <span className="block truncate text-xs font-bold">
                      {name}
                    </span>
                  </button>
                );
              }
            )}
          </div>
        </div>
      )}

      {savedPlayers.length > 0 &&
        !manageMode && (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-zinc-600">
              Tap names to select or
              unselect them.
            </p>

            {selectedPlayers.length >
              0 && (
              <button
                type="button"
                onClick={
                  clearSelection
                }
                className="text-xs font-bold text-zinc-400"
              >
                Clear
              </button>
            )}
          </div>
        )}

      {manageMode && (
        <div className="mt-3 rounded-2xl border border-red-500/10 bg-red-500/5 p-3">
          <p className="text-xs leading-5 text-red-300">
            Tap a player to permanently
            delete their name.
          </p>
        </div>
      )}

      <div className="mt-6">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-600">
          Add New Player
        </p>

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newPlayerName}
            maxLength={24}
            placeholder="Enter name"
            onChange={(event) => {
              setNewPlayerName(
                event.target.value
              );

              setMessage("");
            }}
            onKeyDown={
              handleInputKeyDown
            }
            className="h-12 min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 font-semibold text-white outline-none placeholder:text-zinc-700 focus:border-violet-500"
          />

          <button
            type="button"
            onClick={addPlayer}
            disabled={
              !newPlayerName.trim()
            }
            className="h-12 rounded-2xl bg-violet-600 px-5 font-black disabled:opacity-30"
          >
            Add
          </button>
        </div>

        {message && (
          <p className="mt-2 text-xs text-amber-300">
            {message}
          </p>
        )}
      </div>

      {selectedPlayers.length <
        3 && (
        <div className="mt-5 rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-200">
            Select at least 3 players
            to start a game.
          </p>
        </div>
      )}
    </div>
  );
}