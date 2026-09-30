"use client";

import { useState } from "react";

type Screen = "home" | "device" | "mode" | "setup";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");

  const [players, setPlayers] = useState<string[]>([
    "Player 1",
    "Player 2",
    "Player 3",
    "Player 4",
  ]);

  const [imposterCount, setImposterCount] = useState(1);

  function goBack() {
    if (screen === "device") {
      setScreen("home");
    } else if (screen === "mode") {
      setScreen("device");
    } else if (screen === "setup") {
      setScreen("mode");
    }
  }

  function addPlayer() {
    if (players.length >= 12) return;

    setPlayers((currentPlayers) => [
      ...currentPlayers,
      `Player ${currentPlayers.length + 1}`,
    ]);
  }

  function removePlayer(index: number) {
    if (players.length <= 3) return;

    const updatedPlayers = players.filter(
      (_, playerIndex) => playerIndex !== index
    );

    setPlayers(updatedPlayers);

    if (updatedPlayers.length < 6 && imposterCount === 2) {
      setImposterCount(1);
    }
  }

  function updatePlayer(index: number, value: string) {
    setPlayers((currentPlayers) =>
      currentPlayers.map((player, playerIndex) =>
        playerIndex === index ? value : player
      )
    );
  }

  return (
    <main className="min-h-screen bg-[#08080b] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 py-8">
        {/* HOME */}
        {screen === "home" && (
          <section className="flex flex-1 flex-col justify-between">
            <div className="pt-10">
              <div className="inline-flex rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-bold tracking-[0.2em] text-violet-300">
                PARTY GAME
              </div>

              <h1 className="mt-6 text-6xl font-black tracking-[-0.06em] sm:text-7xl">
                IMPOSTER
              </h1>

              <p className="mt-5 max-w-sm text-lg leading-7 text-zinc-400">
                Everyone knows the secret word.
                <br />
                Except one.
              </p>

              <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-violet-500/10 text-xl">
                    👀
                  </div>

                  <div>
                    <h2 className="font-bold">Find the Imposter</h2>

                    <p className="mt-1 text-sm leading-6 text-zinc-500">
                      Give clues, listen carefully and discover who
                      doesn&apos;t know the secret word.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pb-3 pt-12">
              <button
                onClick={() => setScreen("device")}
                className="w-full rounded-2xl bg-violet-600 px-6 py-5 text-lg font-black transition hover:bg-violet-500 active:scale-[0.98]"
              >
                Play
              </button>

              <p className="mt-4 text-center text-xs text-zinc-600">
                No login • No account • Just play
              </p>
            </div>
          </section>
        )}

        {/* DEVICE SELECTION */}
        {screen === "device" && (
          <section className="flex flex-1 flex-col">
            <button
              onClick={goBack}
              className="mb-10 flex w-fit items-center gap-2 text-sm font-semibold text-zinc-400 transition hover:text-white"
            >
              ← Back
            </button>

            <div>
              <p className="text-xs font-bold tracking-[0.2em] text-violet-400">
                STEP 1
              </p>

              <h1 className="mt-3 text-4xl font-black tracking-tight">
                How are you playing?
              </h1>

              <p className="mt-3 text-base leading-7 text-zinc-500">
                Choose how your group wants to play the game.
              </p>
            </div>

            <div className="mt-10 space-y-4">
              <button
                onClick={() => setScreen("mode")}
                className="w-full rounded-3xl border border-violet-500/40 bg-violet-500/10 p-6 text-left transition hover:border-violet-400 active:scale-[0.99]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 text-2xl">
                    📱
                  </div>

                  <span className="rounded-full bg-violet-500 px-3 py-1 text-[10px] font-black tracking-wider">
                    AVAILABLE
                  </span>
                </div>

                <h2 className="mt-5 text-xl font-black">Single Phone</h2>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Pass one phone between everyone. Each player privately
                  checks their role before passing it to the next person.
                </p>

                <div className="mt-5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-violet-300">
                    Best for quick games
                  </span>

                  <span className="text-xl text-violet-300">→</span>
                </div>
              </button>

              <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 opacity-50">
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-2xl">
                    📲
                  </div>

                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black tracking-wider text-zinc-500">
                    COMING NEXT
                  </span>
                </div>

                <h2 className="mt-5 text-xl font-black">
                  Multiple Phones
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Create a room and let everyone join using their own
                  phones with a room code.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* MODE SELECTION */}
        {screen === "mode" && (
          <section className="flex flex-1 flex-col">
            <button
              onClick={goBack}
              className="mb-10 flex w-fit items-center gap-2 text-sm font-semibold text-zinc-400 transition hover:text-white"
            >
              ← Back
            </button>

            <div>
              <p className="text-xs font-bold tracking-[0.2em] text-violet-400">
                STEP 2
              </p>

              <h1 className="mt-3 text-4xl font-black tracking-tight">
                Choose game mode
              </h1>

              <p className="mt-3 text-base leading-7 text-zinc-500">
                Pick how simple or unpredictable you want the game to be.
              </p>
            </div>

            <div className="mt-10 space-y-4">
              {/* DEFAULT */}
              <button
                onClick={() => setScreen("setup")}
                className="w-full rounded-3xl border border-violet-500/40 bg-violet-500/10 p-6 text-left transition hover:border-violet-400 active:scale-[0.99]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 text-2xl">
                    ⚡
                  </div>

                  <span className="rounded-full bg-violet-500 px-3 py-1 text-[10px] font-black tracking-wider">
                    RECOMMENDED
                  </span>
                </div>

                <h2 className="mt-5 text-xl font-black">Default</h2>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Add players, choose the number of imposters and start
                  immediately.
                </p>

                <div className="mt-5 space-y-2 text-xs text-zinc-400">
                  <p>• No timers</p>
                  <p>• No penalties</p>
                  <p>• No complicated settings</p>
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <span className="text-xs font-semibold text-violet-300">
                    Quick & simple
                  </span>

                  <span className="text-xl text-violet-300">→</span>
                </div>
              </button>

              {/* CUSTOM */}
              <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 opacity-50">
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-2xl">
                    ⚙️
                  </div>

                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black tracking-wider text-zinc-500">
                    LATER
                  </span>
                </div>

                <h2 className="mt-5 text-xl font-black">Custom</h2>

                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Control timers, clues, voting rules and advanced game
                  settings.
                </p>
              </div>

              {/* CHAOS */}
              <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 opacity-50">
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-2xl">
                    🎲
                  </div>

                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black tracking-wider text-zinc-500">
                    LATER
                  </span>
                </div>

                <h2 className="mt-5 text-xl font-black">Chaos</h2>

                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  The game automatically creates random rules and surprises
                  for every match.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* PLAYER SETUP */}
        {screen === "setup" && (
          <section className="flex flex-1 flex-col pb-4">
            <button
              onClick={goBack}
              className="mb-8 flex w-fit items-center gap-2 text-sm font-semibold text-zinc-400 transition hover:text-white"
            >
              ← Back
            </button>

            <div>
              <p className="text-xs font-bold tracking-[0.2em] text-violet-400">
                DEFAULT MODE
              </p>

              <h1 className="mt-3 text-4xl font-black tracking-tight">
                Who&apos;s playing?
              </h1>

              <p className="mt-3 text-sm leading-6 text-zinc-500">
                Add everyone playing on this phone.
              </p>
            </div>

            {/* PLAYER COUNT */}
            <div className="mt-7 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Players
                </p>

                <p className="mt-1 text-xl font-black">
                  {players.length}
                </p>
              </div>

              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Imposters
                </p>

                <p className="mt-1 text-xl font-black">
                  {imposterCount}
                </p>
              </div>
            </div>

            {/* PLAYER LIST */}
            <div className="mt-7 space-y-3">
              {players.map((player, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3"
                >
                  <div className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-violet-500/10 text-sm font-black text-violet-300">
                    {index + 1}
                  </div>

                  <input
                    type="text"
                    value={player}
                    maxLength={18}
                    onChange={(event) =>
                      updatePlayer(index, event.target.value)
                    }
                    className="h-12 min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-violet-500"
                  />

                  <button
                    type="button"
                    onClick={() => removePlayer(index)}
                    disabled={players.length <= 3}
                    className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] text-xl text-zinc-500 transition hover:border-red-500/40 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-20"
                    aria-label={`Remove ${player}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* ADD PLAYER */}
            <button
              type="button"
              onClick={addPlayer}
              disabled={players.length >= 12}
              className="mt-4 w-full rounded-2xl border border-dashed border-white/20 py-4 text-sm font-bold text-zinc-400 transition hover:border-violet-500/50 hover:bg-violet-500/5 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-30"
            >
              + Add Player
            </button>

            <p className="mt-3 text-center text-xs text-zinc-600">
              Minimum 3 • Maximum 12 players
            </p>

            {/* IMPOSTER COUNT */}
            <div className="mt-10">
              <h2 className="text-lg font-black">
                Number of Imposters
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Choose how many players will secretly be imposters.
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setImposterCount(1)}
                  className={`rounded-2xl border px-4 py-5 text-center transition ${
                    imposterCount === 1
                      ? "border-violet-500 bg-violet-500/15"
                      : "border-white/10 bg-white/[0.02]"
                  }`}
                >
                  <p
                    className={`text-2xl font-black ${
                      imposterCount === 1
                        ? "text-violet-300"
                        : "text-white"
                    }`}
                  >
                    1
                  </p>

                  <p className="mt-1 text-xs text-zinc-500">
                    Imposter
                  </p>
                </button>

                <button
                  type="button"
                  disabled={players.length < 6}
                  onClick={() => setImposterCount(2)}
                  className={`rounded-2xl border px-4 py-5 text-center transition disabled:cursor-not-allowed disabled:opacity-25 ${
                    imposterCount === 2
                      ? "border-violet-500 bg-violet-500/15"
                      : "border-white/10 bg-white/[0.02]"
                  }`}
                >
                  <p
                    className={`text-2xl font-black ${
                      imposterCount === 2
                        ? "text-violet-300"
                        : "text-white"
                    }`}
                  >
                    2
                  </p>

                  <p className="mt-1 text-xs text-zinc-500">
                    Imposters
                  </p>
                </button>
              </div>

              {players.length < 6 && (
                <p className="mt-3 text-xs text-zinc-600">
                  Add at least 6 players to enable 2 imposters.
                </p>
              )}
            </div>

            {/* START */}
            <div className="mt-10">
              <button
                type="button"
                className="w-full rounded-2xl bg-violet-600 px-6 py-5 text-lg font-black transition hover:bg-violet-500 active:scale-[0.98]"
              >
                Start Game
              </button>

              <p className="mt-3 text-center text-xs text-zinc-600">
                Roles will be assigned randomly.
              </p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}