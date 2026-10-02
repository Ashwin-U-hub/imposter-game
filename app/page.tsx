"use client";

import { useEffect, useMemo, useState } from "react";
import { getNextSecretWord } from "@/lib/word-engine";

type Screen =
  | "home"
  | "device"
  | "mode"
  | "setup"
  | "reveal"
  | "round"
  | "vote-pass"
  | "vote"
  | "group-vote"
  | "vote-result"
  | "result"
  | "winner";

type GameMode = "default" | "custom";

type Role = "player" | "imposter";

type Winner = "players" | "imposters" | null;

type RoundResultType =
  | "normal-eliminated"
  | "imposter-eliminated"
  | "wrong-guess"
  | null;

type GamePlayer = {
  id: number;
  name: string;
  role: Role;
};

const SAVED_PLAYERS_KEY =
  "imposter-saved-players-v1";

const SELECTED_PLAYERS_KEY =
  "imposter-selected-players-v1";

function randomInt(maxExclusive: number) {
  if (maxExclusive <= 1) {
    return 0;
  }

  const values = new Uint32Array(1);

  crypto.getRandomValues(values);

  return values[0] % maxExclusive;
}

function shuffle<T>(
  items: T[]
): T[] {
  const result = [...items];

  for (
    let i = result.length - 1;
    i > 0;
    i--
  ) {
    const randomIndex =
      randomInt(i + 1);

    [
      result[i],
      result[randomIndex],
    ] = [
      result[randomIndex],
      result[i],
    ];
  }

  return result;
}

function getMaxImposters(
  playerCount: number
) {
  if (playerCount < 3) {
    return 1;
  }

  return Math.max(
    1,
    Math.floor(
      (playerCount - 1) / 2
    )
  );
}

function getRecommendedImposters(
  playerCount: number
) {
  const max =
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
    max
  );
}

function cleanName(
  value: string
) {
  return value
    .trim()
    .replace(/\s+/g, " ");
}

function uniqueNames(
  names: string[]
) {
  const seen =
    new Set<string>();

  const result: string[] =
    [];

  for (
    const rawName of names
  ) {
    const name =
      cleanName(rawName);

    if (!name) {
      continue;
    }

    const key =
      name.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    result.push(name);
  }

  return result;
}

function parseRosterValue(
  value: string
): string[] {
  const text =
    value.trim();

  if (!text) {
    return [];
  }

  function parseJsonArray(
    raw: string
  ) {
    const parsed =
      JSON.parse(raw);

    if (
      !Array.isArray(parsed)
    ) {
      return [];
    }

    return uniqueNames(
      parsed.map(
        (item) =>
          String(item)
      )
    );
  }

  try {
    const url =
      new URL(text);

    const roster =
      url.searchParams.get(
        "roster"
      );

    if (roster) {
      return parseJsonArray(
        roster
      );
    }
  } catch {
    // Not a direct URL.
  }

  const urlMatch =
    text.match(
      /https?:\/\/\S+/i
    );

  if (urlMatch) {
    try {
      const url =
        new URL(
          urlMatch[0]
        );

      const roster =
        url.searchParams.get(
          "roster"
        );

      if (roster) {
        return parseJsonArray(
          roster
        );
      }
    } catch {
      // Continue.
    }
  }

  try {
    return parseJsonArray(
      text
    );
  } catch {
    return [];
  }
}

export default function Home() {
  const [
    screen,
    setScreen,
  ] =
    useState<Screen>(
      "home"
    );

  const [
    gameMode,
    setGameMode,
  ] =
    useState<GameMode>(
      "default"
    );

  /*
    SAVED PLAYER SYSTEM
  */

  const [
    savedPlayers,
    setSavedPlayers,
  ] =
    useState<string[]>([]);

  const [
    players,
    setPlayers,
  ] =
    useState<string[]>([]);

  const [
    rosterLoaded,
    setRosterLoaded,
  ] =
    useState(false);

  const [
    newPlayerName,
    setNewPlayerName,
  ] =
    useState("");

  const [
    managePlayers,
    setManagePlayers,
  ] =
    useState(false);

  const [
    rosterMessage,
    setRosterMessage,
  ] =
    useState("");

  const [
    showImportBox,
    setShowImportBox,
  ] =
    useState(false);

  const [
    importText,
    setImportText,
  ] =
    useState("");

  const [
    incomingSharedPlayers,
    setIncomingSharedPlayers,
  ] =
    useState<string[]>([]);

  /*
    COMMON SETTINGS
  */

  const [
    imposterCount,
    setImposterCount,
  ] =
    useState(1);

  const [
    eliminationMode,
    setEliminationMode,
  ] =
    useState(true);

  const [
    privatePhoneVoting,
    setPrivatePhoneVoting,
  ] =
    useState(false);

  /*
    CUSTOM SETTINGS
  */

  const [
    randomClueOrder,
    setRandomClueOrder,
  ] =
    useState(true);

  const [
    allowSelfVote,
    setAllowSelfVote,
  ] =
    useState(false);

  const [
    customVotingLimitEnabled,
    setCustomVotingLimitEnabled,
  ] =
    useState(false);

  const [
    customVotingLimit,
    setCustomVotingLimit,
  ] =
    useState(1);

  /*
    CURRENT GAME
  */

  const [
    gamePlayers,
    setGamePlayers,
  ] =
    useState<
      GamePlayer[]
    >([]);

  const [
    secretWord,
    setSecretWord,
  ] =
    useState("");

  const [
    alivePlayerIds,
    setAlivePlayerIds,
  ] =
    useState<number[]>([]);

  const [
    spectatorIds,
    setSpectatorIds,
  ] =
    useState<number[]>([]);

  /*
    ROLE REVEAL
  */

  const [
    revealIndex,
    setRevealIndex,
  ] =
    useState(0);

  const [
    roleVisible,
    setRoleVisible,
  ] =
    useState(false);

  /*
    ROUND
  */

  const [
    roundNumber,
    setRoundNumber,
  ] =
    useState(1);

  const [
    votingRoundsUsed,
    setVotingRoundsUsed,
  ] =
    useState(0);

  const [
    maxVotingRounds,
    setMaxVotingRounds,
  ] =
    useState(1);

  const [
    clueOrder,
    setClueOrder,
  ] =
    useState<
      GamePlayer[]
    >([]);

  /*
    VOTING
  */

  const [
    voteOrder,
    setVoteOrder,
  ] =
    useState<
      GamePlayer[]
    >([]);

  const [
    voteIndex,
    setVoteIndex,
  ] =
    useState(0);

  const [
    selectedVoteId,
    setSelectedVoteId,
  ] =
    useState<
      number | null
    >(null);

  const [
    votes,
    setVotes,
  ] =
    useState<
      Record<
        number,
        number
      >
    >({});

  const [
    voteCandidates,
    setVoteCandidates,
  ] =
    useState<number[]>([]);

  const [
    isRevote,
    setIsRevote,
  ] =
    useState(false);

  /*
    RESULTS
  */

  const [
    roundResultPlayer,
    setRoundResultPlayer,
  ] =
    useState<
      GamePlayer | null
    >(null);

  const [
    roundResultType,
    setRoundResultType,
  ] =
    useState<
      RoundResultType
    >(null);

  const [
    winner,
    setWinner,
  ] =
    useState<Winner>(
      null
    );

  const [
    isStarting,
    setIsStarting,
  ] =
    useState(false);

  const [
    startError,
    setStartError,
  ] =
    useState("");

  /*
    LOAD SAVED PLAYERS
  */

  useEffect(() => {
    try {
      const storedSaved =
        localStorage.getItem(
          SAVED_PLAYERS_KEY
        );

      const storedSelected =
        localStorage.getItem(
          SELECTED_PLAYERS_KEY
        );

      let saved: string[] =
        [];

      let selected: string[] =
        [];

      if (storedSaved) {
        const parsed =
          JSON.parse(
            storedSaved
          );

        if (
          Array.isArray(
            parsed
          )
        ) {
          saved =
            uniqueNames(
              parsed.map(
                (item) =>
                  String(
                    item
                  )
              )
            );
        }
      }

      if (
        storedSelected
      ) {
        const parsed =
          JSON.parse(
            storedSelected
          );

        if (
          Array.isArray(
            parsed
          )
        ) {
          selected =
            uniqueNames(
              parsed.map(
                (item) =>
                  String(
                    item
                  )
              )
            );
        }
      }

      selected =
        selected.filter(
          (
            selectedName
          ) =>
            saved.some(
              (
                savedName
              ) =>
                savedName.toLowerCase() ===
                selectedName.toLowerCase()
            )
        );

      setSavedPlayers(
        saved
      );

      setPlayers(
        selected
      );

      const params =
        new URLSearchParams(
          window.location
            .search
        );

      const sharedRoster =
        params.get(
          "roster"
        );

      if (
        sharedRoster
      ) {
        try {
          const parsed =
            JSON.parse(
              sharedRoster
            );

          if (
            Array.isArray(
              parsed
            )
          ) {
            setIncomingSharedPlayers(
              uniqueNames(
                parsed.map(
                  (
                    item
                  ) =>
                    String(
                      item
                    )
                )
              )
            );
          }
        } catch {
          // Ignore bad roster.
        }
      }
    } catch {
      setSavedPlayers(
        []
      );

      setPlayers([]);
    } finally {
      setRosterLoaded(
        true
      );
    }
  }, []);

  /*
    SAVE ROSTER
  */

  useEffect(() => {
    if (
      !rosterLoaded
    ) {
      return;
    }

    try {
      localStorage.setItem(
        SAVED_PLAYERS_KEY,
        JSON.stringify(
          savedPlayers
        )
      );
    } catch {
      // Ignore.
    }
  }, [
    savedPlayers,
    rosterLoaded,
  ]);

  /*
    SAVE CURRENT SELECTION
  */

  useEffect(() => {
    if (
      !rosterLoaded
    ) {
      return;
    }

    try {
      localStorage.setItem(
        SELECTED_PLAYERS_KEY,
        JSON.stringify(
          players
        )
      );
    } catch {
      // Ignore.
    }
  }, [
    players,
    rosterLoaded,
  ]);

  const maxImposters =
    useMemo(
      () =>
        getMaxImposters(
          players.length
        ),
      [players.length]
    );

  const recommendedImposters =
    useMemo(
      () =>
        getRecommendedImposters(
          players.length
        ),
      [players.length]
    );

  const spectatorPlayers =
    useMemo(
      () =>
        gamePlayers.filter(
          (player) =>
            spectatorIds.includes(
              player.id
            )
        ),
      [
        gamePlayers,
        spectatorIds,
      ]
    );

  const currentRevealPlayer =
    gamePlayers[
      revealIndex
    ];

  const currentVoter =
    voteOrder[
      voteIndex
    ];

  function buildClueOrder(
    source: GamePlayer[]
  ) {
    if (
      randomClueOrder
    ) {
      return shuffle(
        source
      );
    }

    return [
      ...source,
    ].sort(
      (a, b) =>
        a.id - b.id
    );
  }

  function syncImposterCount(
    selectedCount: number
  ) {
    const newMaximum =
      getMaxImposters(
        selectedCount
      );

    const nextCount =
      Math.min(
        imposterCount,
        newMaximum
      );

    setImposterCount(
      nextCount
    );

    setCustomVotingLimit(
      (current) =>
        Math.max(
          current,
          nextCount
        )
    );
  }

  /*
    MODE SELECTION
  */

  function chooseMode(
    mode: GameMode
  ) {
    setGameMode(mode);

    /*
      Advanced settings do
      not affect Default.
    */

    if (
      mode === "default"
    ) {
      setRandomClueOrder(
        true
      );

      setAllowSelfVote(
        false
      );

      setCustomVotingLimitEnabled(
        false
      );
    }

    setScreen("setup");
  }

  function goBack() {
    if (
      screen ===
      "device"
    ) {
      setScreen("home");
    } else if (
      screen ===
      "mode"
    ) {
      setScreen(
        "device"
      );
    } else if (
      screen ===
      "setup"
    ) {
      setScreen(
        "mode"
      );
    }
  }

  /*
    SAVED PLAYERS
  */

  function addSavedPlayer() {
    const name =
      cleanName(
        newPlayerName
      );

    setRosterMessage("");

    if (!name) {
      return;
    }

    const alreadyExists =
      savedPlayers.some(
        (player) =>
          player.toLowerCase() ===
          name.toLowerCase()
      );

    if (
      alreadyExists
    ) {
      setRosterMessage(
        "That name is already saved."
      );

      return;
    }

    const updatedSaved = [
      ...savedPlayers,
      name,
    ];

    const updatedSelected =
      [
        ...players,
        name,
      ];

    setSavedPlayers(
      updatedSaved
    );

    setPlayers(
      updatedSelected
    );

    syncImposterCount(
      updatedSelected.length
    );

    setNewPlayerName("");

    setRosterMessage(
      `${name} saved and selected.`
    );
  }

  function toggleSavedPlayer(
    name: string
  ) {
    const selected =
      players.some(
        (player) =>
          player.toLowerCase() ===
          name.toLowerCase()
      );

    const updated =
      selected
        ? players.filter(
            (player) =>
              player.toLowerCase() !==
              name.toLowerCase()
          )
        : [
            ...players,
            name,
          ];

    setPlayers(updated);

    syncImposterCount(
      updated.length
    );
  }

  function deleteSavedPlayer(
    name: string
  ) {
    const updatedSaved =
      savedPlayers.filter(
        (player) =>
          player.toLowerCase() !==
          name.toLowerCase()
      );

    const updatedSelected =
      players.filter(
        (player) =>
          player.toLowerCase() !==
          name.toLowerCase()
      );

    setSavedPlayers(
      updatedSaved
    );

    setPlayers(
      updatedSelected
    );

    syncImposterCount(
      updatedSelected.length
    );

    setRosterMessage(
      `${name} deleted from this device.`
    );
  }

  function clearSelectedPlayers() {
    setPlayers([]);

    setImposterCount(1);

    setCustomVotingLimit(
      1
    );
  }

  /*
    SHARE ROSTER
  */

  async function shareRoster() {
    setRosterMessage("");

    if (
      savedPlayers.length ===
      0
    ) {
      setRosterMessage(
        "Add at least one saved player before sharing."
      );

      return;
    }

    const url =
      new URL(
        window.location.href
      );

    url.search = "";
    url.hash = "";

    url.searchParams.set(
      "roster",
      JSON.stringify(
        savedPlayers
      )
    );

    try {
      if (
        navigator.share
      ) {
        await navigator.share({
          title:
            "Imposter Player Roster",

          text:
            `Import my ${savedPlayers.length} saved players into Imposter.`,

          url:
            url.toString(),
        });

        setRosterMessage(
          "Roster share opened."
        );
      } else {
        await navigator.clipboard.writeText(
          url.toString()
        );

        setRosterMessage(
          "Roster link copied. Send it to your friend."
        );
      }
    } catch (error) {
      if (
        error instanceof
          DOMException &&
        error.name ===
          "AbortError"
      ) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          url.toString()
        );

        setRosterMessage(
          "Roster link copied. Send it to your friend."
        );
      } catch {
        setRosterMessage(
          "Could not share automatically. Try again in your browser."
        );
      }
    }
  }

  /*
    IMPORT ROSTER
  */

  function mergeImportedRoster(
    names: string[]
  ) {
    const cleanIncoming =
      uniqueNames(names);

    if (
      cleanIncoming.length ===
      0
    ) {
      setRosterMessage(
        "No valid player names were found."
      );

      return;
    }

    const before =
      savedPlayers.length;

    const merged =
      uniqueNames([
        ...savedPlayers,
        ...cleanIncoming,
      ]);

    const added =
      merged.length -
      before;

    setSavedPlayers(
      merged
    );

    setRosterMessage(
      added > 0
        ? `${added} new ${
            added === 1
              ? "player"
              : "players"
          } imported.`
        : "All shared players are already saved on this device."
    );

    setIncomingSharedPlayers(
      []
    );

    setImportText("");

    setShowImportBox(
      false
    );

    const url =
      new URL(
        window.location.href
      );

    url.searchParams.delete(
      "roster"
    );

    window.history.replaceState(
      {},
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
  }

  function importRosterFromText() {
    const parsed =
      parseRosterValue(
        importText
      );

    mergeImportedRoster(
      parsed
    );
  }

  /*
    IMPOSTER COUNT
  */

  function increaseImposters() {
    const next =
      Math.min(
        imposterCount + 1,
        maxImposters
      );

    setImposterCount(
      next
    );

    setCustomVotingLimit(
      (current) =>
        Math.max(
          current,
          next
        )
    );
  }

  function decreaseImposters() {
    setImposterCount(
      Math.max(
        1,
        imposterCount - 1
      )
    );
  }

  /*
    CUSTOM VOTING LIMIT
  */

  const maximumCustomVotingRounds =
    Math.max(
      20,
      players.length
    );

  function increaseCustomVotingLimit() {
    setCustomVotingLimit(
      (current) =>
        Math.min(
          maximumCustomVotingRounds,
          current + 1
        )
    );
  }

  function decreaseCustomVotingLimit() {
    setCustomVotingLimit(
      (current) =>
        Math.max(
          imposterCount,
          current - 1
        )
    );
  }

  /*
    START GAME
  */

  async function startGame() {
    if (
      isStarting ||
      players.length < 3
    ) {
      return;
    }

    setIsStarting(true);

    setStartError("");

    try {
      const cleanedPlayers =
        uniqueNames(
          players
        );

      if (
        cleanedPlayers.length <
        3
      ) {
        setStartError(
          "Select at least 3 different players."
        );

        return;
      }

      const safeImposterCount =
        Math.min(
          imposterCount,
          getMaxImposters(
            cleanedPlayers.length
          )
        );

      const playerIds =
        cleanedPlayers.map(
          (_, index) =>
            index
        );

      const selectedImposters =
        shuffle(
          playerIds
        ).slice(
          0,
          safeImposterCount
        );

      const selectedWord =
        await getNextSecretWord();

      const assignedPlayers:
        GamePlayer[] =
        cleanedPlayers.map(
          (
            name,
            index
          ) => ({
            id: index,

            name,

            role:
              selectedImposters.includes(
                index
              )
                ? "imposter"
                : "player",
          })
        );

      const chosenVotingLimit =
        gameMode ===
          "custom" &&
        !eliminationMode &&
        customVotingLimitEnabled
          ? Math.max(
              safeImposterCount,
              customVotingLimit
            )
          : safeImposterCount;

      setPlayers(
        cleanedPlayers
      );

      setImposterCount(
        safeImposterCount
      );

      setCustomVotingLimit(
        (current) =>
          Math.max(
            current,
            safeImposterCount
          )
      );

      setGamePlayers(
        assignedPlayers
      );

      setAlivePlayerIds(
        assignedPlayers.map(
          (player) =>
            player.id
        )
      );

      setSpectatorIds([]);

      setSecretWord(
        selectedWord
      );

      setRevealIndex(0);

      setRoleVisible(false);

      setRoundNumber(1);

      setVotingRoundsUsed(
        0
      );

      setMaxVotingRounds(
        chosenVotingLimit
      );

      setClueOrder([]);

      setVoteOrder([]);

      setVoteIndex(0);

      setVotes({});

      setVoteCandidates([]);

      setSelectedVoteId(
        null
      );

      setIsRevote(false);

      setRoundResultPlayer(
        null
      );

      setRoundResultType(
        null
      );

      setWinner(null);

      setScreen("reveal");
    } catch (error) {
      console.error(error);

      setStartError(
        "The word bank could not be loaded. Please refresh and try again."
      );
    } finally {
      setIsStarting(false);
    }
  }

  /*
    ROLE REVEAL
  */

  function finishRoleReveal() {
    setRoleVisible(false);

    const isLastPlayer =
      revealIndex ===
      gamePlayers.length -
        1;

    if (
      !isLastPlayer
    ) {
      setRevealIndex(
        (current) =>
          current + 1
      );

      return;
    }

    setClueOrder(
      buildClueOrder(
        gamePlayers
      )
    );

    setScreen("round");
  }

  /*
    VOTING
  */

  function startVoting() {
    const activePlayers =
      gamePlayers.filter(
        (player) =>
          alivePlayerIds.includes(
            player.id
          )
      );

    const candidateIds =
      activePlayers.map(
        (player) =>
          player.id
      );

    setVoteCandidates(
      candidateIds
    );

    setSelectedVoteId(
      null
    );

    setVotes({});

    setIsRevote(false);

    if (
      privatePhoneVoting
    ) {
      setVoteOrder(
        shuffle(
          activePlayers
        )
      );

      setVoteIndex(0);

      setScreen(
        "vote-pass"
      );
    } else {
      setScreen(
        "group-vote"
      );
    }
  }

  function openPrivateVote() {
    setSelectedVoteId(
      null
    );

    setScreen("vote");
  }

  function submitPrivateVote() {
    if (
      selectedVoteId ===
        null ||
      !currentVoter
    ) {
      return;
    }

    const updatedVotes = {
      ...votes,

      [currentVoter.id]:
        selectedVoteId,
    };

    setVotes(
      updatedVotes
    );

    const isLastVoter =
      voteIndex ===
      voteOrder.length - 1;

    if (
      !isLastVoter
    ) {
      setSelectedVoteId(
        null
      );

      setVoteIndex(
        (current) =>
          current + 1
      );

      setScreen(
        "vote-pass"
      );

      return;
    }

    calculatePrivateVoteResult(
      updatedVotes
    );
  }

  function calculatePrivateVoteResult(
    finalVotes: Record<
      number,
      number
    >
  ) {
    const counts:
      Record<
        number,
        number
      > = {};

    Object.values(
      finalVotes
    ).forEach(
      (candidateId) => {
        counts[candidateId] =
          (
            counts[
              candidateId
            ] ?? 0
          ) + 1;
      }
    );

    const voteTotals =
      Object.values(
        counts
      );

    if (
      voteTotals.length ===
      0
    ) {
      return;
    }

    const highestVoteCount =
      Math.max(
        ...voteTotals
      );

    const topCandidates =
      Object.entries(
        counts
      )
        .filter(
          ([
            ,
            count,
          ]) =>
            count ===
            highestVoteCount
        )
        .map(
          ([id]) =>
            Number(id)
        );

    if (
      topCandidates.length >
      1
    ) {
      setVoteCandidates(
        topCandidates
      );

      setIsRevote(true);

      setScreen(
        "vote-result"
      );

      return;
    }

    resolveChosenPlayer(
      topCandidates[0]
    );
  }

  /*
    TIE BREAK
  */

  function startRevote() {
    const activePlayers =
      gamePlayers.filter(
        (player) =>
          alivePlayerIds.includes(
            player.id
          )
      );

    setVoteOrder(
      shuffle(
        activePlayers
      )
    );

    setVoteIndex(0);

    setVotes({});

    setSelectedVoteId(
      null
    );

    setScreen(
      "vote-pass"
    );
  }

  /*
    GROUP VOTE
  */

  function submitGroupVote() {
    if (
      selectedVoteId ===
      null
    ) {
      return;
    }

    resolveChosenPlayer(
      selectedVoteId
    );
  }

  /*
    RESOLVE VOTE
  */

  function resolveChosenPlayer(
    playerId: number
  ) {
    const selectedPlayer =
      gamePlayers.find(
        (player) =>
          player.id ===
          playerId
      );

    if (
      !selectedPlayer
    ) {
      return;
    }

    /*
      ELIMINATION MODE ON
    */

    if (
      eliminationMode
    ) {
      const updatedAliveIds =
        alivePlayerIds.filter(
          (id) =>
            id !==
            playerId
        );

      setAlivePlayerIds(
        updatedAliveIds
      );

      setSpectatorIds(
        (current) => [
          ...new Set([
            ...current,
            playerId,
          ]),
        ]
      );

      setRoundResultPlayer(
        selectedPlayer
      );

      setRoundResultType(
        selectedPlayer.role ===
          "imposter"
          ? "imposter-eliminated"
          : "normal-eliminated"
      );

      const playersAfterVote =
        gamePlayers.filter(
          (player) =>
            updatedAliveIds.includes(
              player.id
            )
        );

      const remainingImposters =
        playersAfterVote.filter(
          (player) =>
            player.role ===
            "imposter"
        ).length;

      const remainingNormalPlayers =
        playersAfterVote.filter(
          (player) =>
            player.role ===
            "player"
        ).length;

      if (
        remainingImposters ===
        0
      ) {
        setWinner(
          "players"
        );
      } else if (
        remainingImposters ===
          1 &&
        remainingNormalPlayers <=
          1
      ) {
        /*
          1 Imposter + 1 normal
          = Imposter wins.
        */

        setWinner(
          "imposters"
        );
      } else if (
        remainingImposters >
          1 &&
        remainingNormalPlayers <=
          2
      ) {
        /*
          Multiple Imposters +
          only 2 normal players
          = Imposters win.
        */

        setWinner(
          "imposters"
        );
      } else {
        setWinner(null);
      }

      setScreen("result");

      return;
    }

    /*
      ELIMINATION MODE OFF
    */

    const nextRoundsUsed =
      votingRoundsUsed + 1;

    setVotingRoundsUsed(
      nextRoundsUsed
    );

    if (
      selectedPlayer.role ===
      "imposter"
    ) {
      const updatedAliveIds =
        alivePlayerIds.filter(
          (id) =>
            id !==
            playerId
        );

      setAlivePlayerIds(
        updatedAliveIds
      );

      setSpectatorIds(
        (current) => [
          ...new Set([
            ...current,
            playerId,
          ]),
        ]
      );

      setRoundResultPlayer(
        selectedPlayer
      );

      setRoundResultType(
        "imposter-eliminated"
      );

      const remainingImposters =
        gamePlayers.filter(
          (player) =>
            updatedAliveIds.includes(
              player.id
            ) &&
            player.role ===
              "imposter"
        ).length;

      if (
        remainingImposters ===
        0
      ) {
        setWinner(
          "players"
        );
      } else if (
        nextRoundsUsed >=
        maxVotingRounds
      ) {
        setWinner(
          "imposters"
        );
      } else {
        setWinner(null);
      }
    } else {
      setRoundResultPlayer(
        selectedPlayer
      );

      setRoundResultType(
        "wrong-guess"
      );

      if (
        nextRoundsUsed >=
        maxVotingRounds
      ) {
        setWinner(
          "imposters"
        );
      } else {
        setWinner(null);
      }
    }

    setScreen("result");
  }

  /*
    NEXT ROUND
  */

  function continueAfterResult() {
    if (winner) {
      setScreen("winner");

      return;
    }

    const remainingPlayers =
      gamePlayers.filter(
        (player) =>
          alivePlayerIds.includes(
            player.id
          )
      );

    setRoundNumber(
      (current) =>
        current + 1
    );

    setClueOrder(
      buildClueOrder(
        remainingPlayers
      )
    );

    setVoteOrder([]);

    setVoteIndex(0);

    setVotes({});

    setSelectedVoteId(
      null
    );

    setVoteCandidates([]);

    setIsRevote(false);

    setRoundResultPlayer(
      null
    );

    setRoundResultType(
      null
    );

    setScreen("round");
  }

  /*
    PLAY AGAIN
  */

  function playAgainSamePlayers() {
    setGamePlayers([]);

    setSecretWord("");

    setAlivePlayerIds([]);

    setSpectatorIds([]);

    setRevealIndex(0);

    setRoleVisible(false);

    setRoundNumber(1);

    setVotingRoundsUsed(
      0
    );

    setClueOrder([]);

    setVoteOrder([]);

    setVoteIndex(0);

    setVotes({});

    setSelectedVoteId(
      null
    );

    setVoteCandidates([]);

    setIsRevote(false);

    setRoundResultPlayer(
      null
    );

    setRoundResultType(
      null
    );

    setWinner(null);

    setScreen("setup");
  }

  function returnHome() {
    setGamePlayers([]);

    setSecretWord("");

    setAlivePlayerIds([]);

    setSpectatorIds([]);

    setWinner(null);

    setScreen("home");
  }

  /*
    PRIVATE VOTE CANDIDATES

    Custom Mode can enable
    self-voting.
  */

  const availablePrivateVoteCandidates =
    currentVoter
      ? gamePlayers.filter(
          (player) =>
            alivePlayerIds.includes(
              player.id
            ) &&
            voteCandidates.includes(
              player.id
            ) &&
            (
              allowSelfVote ||
              player.id !==
                currentVoter.id
            )
        )
      : [];

  const availableGroupCandidates =
    gamePlayers.filter(
      (player) =>
        alivePlayerIds.includes(
          player.id
        ) &&
        voteCandidates.includes(
          player.id
        )
    );

  const remainingImposterCount =
    gamePlayers.filter(
      (player) =>
        alivePlayerIds.includes(
          player.id
        ) &&
        player.role ===
          "imposter"
    ).length;

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

              <p className="mt-5 text-lg leading-7 text-zinc-400">
                Everyone knows the secret word.
                <br />
                Except the Imposters.
              </p>

              <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.03] p-5">

                <div className="flex gap-4">

                  <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-violet-500/10 text-xl">
                    👀
                  </div>

                  <div>

                    <h2 className="font-bold">
                      Find the Imposters
                    </h2>

                    <p className="mt-1 text-sm leading-6 text-zinc-500">
                      Give clues, discuss and discover who doesn&apos;t know the word.
                    </p>

                  </div>

                </div>

              </div>

            </div>

            <div>

              <button
                onClick={() =>
                  setScreen(
                    "device"
                  )
                }
                className="w-full rounded-2xl bg-violet-600 py-5 text-lg font-black"
              >
                Play
              </button>

              <p className="mt-4 text-center text-xs text-zinc-600">
                No login • No account • Just play
              </p>

            </div>

          </section>
        )}

        {/* DEVICE */}

        {screen === "device" && (
          <section>

            <button
              onClick={goBack}
              className="mb-10 text-sm font-semibold text-zinc-400"
            >
              ← Back
            </button>

            <p className="text-xs font-bold tracking-[0.2em] text-violet-400">
              STEP 1
            </p>

            <h1 className="mt-3 text-4xl font-black">
              How are you playing?
            </h1>

            <div className="mt-10 space-y-4">

              <button
                onClick={() =>
                  setScreen(
                    "mode"
                  )
                }
                className="w-full rounded-3xl border border-violet-500/40 bg-violet-500/10 p-6 text-left"
              >

                <div className="text-3xl">
                  📱
                </div>

                <h2 className="mt-5 text-xl font-black">
                  Single Phone
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Pass one phone for role reveals. Voting can be private or group-based.
                </p>

              </button>

              <div className="rounded-3xl border border-white/10 p-6 opacity-40">

                <div className="text-3xl">
                  📲
                </div>

                <h2 className="mt-5 text-xl font-black">
                  Multiple Phones
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Online rooms, spectators and optional voice chat will come later.
                </p>

              </div>

            </div>

          </section>
        )}

        {/* MODE */}

        {screen === "mode" && (
          <section>

            <button
              onClick={goBack}
              className="mb-10 text-sm font-semibold text-zinc-400"
            >
              ← Back
            </button>

            <p className="text-xs font-bold tracking-[0.2em] text-violet-400">
              STEP 2
            </p>

            <h1 className="mt-3 text-4xl font-black">
              Choose game mode
            </h1>

            <div className="mt-10 space-y-4">

              <button
                onClick={() =>
                  chooseMode(
                    "default"
                  )
                }
                className="w-full rounded-3xl border border-violet-500/40 bg-violet-500/10 p-6 text-left"
              >

                <div className="flex items-start justify-between gap-3">

                  <div className="text-3xl">
                    ⚡
                  </div>

                  <span className="rounded-full bg-violet-500 px-3 py-1 text-[10px] font-black">
                    QUICK
                  </span>

                </div>

                <h2 className="mt-5 text-xl font-black">
                  Default
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Fast setup with the important game options.
                </p>

              </button>

              <button
                onClick={() =>
                  chooseMode(
                    "custom"
                  )
                }
                className="w-full rounded-3xl border border-white/15 bg-white/[0.03] p-6 text-left transition hover:border-violet-500/30"
              >

                <div className="flex items-start justify-between gap-3">

                  <div className="text-3xl">
                    ⚙️
                  </div>

                  <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-black text-zinc-400">
                    AVAILABLE
                  </span>

                </div>

                <h2 className="mt-5 text-xl font-black">
                  Custom
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Control clue order, self-voting and quick-mode voting limits.
                </p>

              </button>

              <div className="rounded-3xl border border-white/10 p-6 opacity-40">

                <div className="text-3xl">
                  🎲
                </div>

                <h2 className="mt-4 text-xl font-black">
                  Chaos
                </h2>

                <p className="mt-2 text-sm text-zinc-500">
                  Random rules every match.
                </p>

              </div>

            </div>

          </section>
        )}

        {/* SETUP */}

        {screen === "setup" && (
          <section className="pb-5">

            <button
              onClick={goBack}
              className="mb-8 text-sm font-semibold text-zinc-400"
            >
              ← Back
            </button>

            <p className="text-xs font-bold tracking-[0.2em] text-violet-400">
              {
                gameMode ===
                "custom"
                  ? "CUSTOM MODE"
                  : "DEFAULT MODE"
              }
            </p>

            <h1 className="mt-3 text-4xl font-black">
              Who&apos;s playing?
            </h1>

            <p className="mt-3 text-sm leading-6 text-zinc-500">
              Save names once, then tap only the people who are playing today.
            </p>

            {/* SHARED ROSTER */}

            {incomingSharedPlayers.length >
              0 && (
              <div className="mt-6 rounded-3xl border border-violet-500/30 bg-violet-500/10 p-5">

                <p className="text-xs font-bold uppercase tracking-[0.15em] text-violet-300">
                  Shared Roster Found
                </p>

                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  This link contains{" "}
                  {
                    incomingSharedPlayers.length
                  }{" "}
                  saved{" "}
                  {
                    incomingSharedPlayers.length ===
                    1
                      ? "player"
                      : "players"
                  }
                  .
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3">

                  <button
                    onClick={() =>
                      setIncomingSharedPlayers(
                        []
                      )
                    }
                    className="rounded-2xl border border-white/10 py-3 text-sm font-bold text-zinc-400"
                  >
                    Ignore
                  </button>

                  <button
                    onClick={() =>
                      mergeImportedRoster(
                        incomingSharedPlayers
                      )
                    }
                    className="rounded-2xl bg-violet-600 py-3 text-sm font-black"
                  >
                    Import Roster
                  </button>

                </div>

              </div>
            )}

            {/* PLAYER ROSTER */}

            <div className="mt-7 rounded-3xl border border-white/10 bg-white/[0.025] p-4">

              <div className="flex items-start justify-between gap-3">

                <div>

                  <h2 className="text-lg font-black">
                    Saved Players
                  </h2>

                  <p className="mt-1 text-xs text-zinc-500">
                    {
                      players.length
                    }{" "}
                    selected •{" "}
                    {
                      savedPlayers.length
                    }{" "}
                    saved
                  </p>

                </div>

                <button
                  onClick={() =>
                    setManagePlayers(
                      (current) =>
                        !current
                    )
                  }
                  disabled={
                    savedPlayers.length ===
                    0
                  }
                  className={`rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-30 ${
                    managePlayers
                      ? "border-red-500/30 bg-red-500/10 text-red-300"
                      : "border-white/10 text-zinc-400"
                  }`}
                >
                  {
                    managePlayers
                      ? "Done"
                      : "Manage"
                  }
                </button>

              </div>

              {savedPlayers.length ===
              0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center">

                  <div className="text-3xl">
                    👥
                  </div>

                  <p className="mt-3 font-bold">
                    No saved players yet
                  </p>

                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    Add your friends once. Their names stay on this device until you delete them.
                  </p>

                </div>
              ) : (
                <div className="mt-4 max-h-72 overflow-y-auto rounded-2xl border border-white/5 bg-black/20 p-2">

                  <div className="grid grid-cols-4 gap-2">

                    {savedPlayers.map(
                      (name) => {
                        const selected =
                          players.some(
                            (
                              player
                            ) =>
                              player.toLowerCase() ===
                              name.toLowerCase()
                          );

                        return (
                          <button
                            key={
                              name
                            }
                            title={
                              name
                            }
                            onClick={() =>
                              managePlayers
                                ? deleteSavedPlayer(
                                    name
                                  )
                                : toggleSavedPlayer(
                                    name
                                  )
                            }
                            className={`relative min-h-16 rounded-2xl border px-2 py-3 text-center transition ${
                              managePlayers
                                ? "border-red-500/20 bg-red-500/5 text-zinc-300"
                                : selected
                                  ? "border-violet-500 bg-violet-500/15 text-violet-200"
                                  : "border-white/10 bg-white/[0.03] text-zinc-400"
                            }`}
                          >

                            {managePlayers && (
                              <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20 text-xs text-red-300">
                                ×
                              </span>
                            )}

                            {!managePlayers &&
                              selected && (
                                <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-[10px] font-black text-white">
                                  ✓
                                </span>
                              )}

                            <span className="block truncate text-xs font-bold">
                              {
                                name
                              }
                            </span>

                          </button>
                        );
                      }
                    )}

                  </div>

                </div>
              )}

              {!managePlayers &&
                savedPlayers.length >
                  0 && (
                  <div className="mt-3 flex items-center justify-between gap-3">

                    <p className="text-xs text-zinc-600">
                      Tap names to select or unselect.
                    </p>

                    {players.length >
                      0 && (
                      <button
                        onClick={
                          clearSelectedPlayers
                        }
                        className="text-xs font-bold text-zinc-400"
                      >
                        Clear
                      </button>
                    )}

                  </div>
                )}

              {managePlayers &&
                savedPlayers.length >
                  0 && (
                  <div className="mt-3 rounded-2xl border border-red-500/10 bg-red-500/5 p-3">

                    <p className="text-xs leading-5 text-red-300">
                      Manage is ON. Tap a name to permanently delete it from this device.
                    </p>

                  </div>
                )}

              {/* ADD PLAYER */}

              <div className="mt-5 flex gap-2">

                <input
                  value={
                    newPlayerName
                  }
                  maxLength={
                    24
                  }
                  placeholder="Enter player name"
                  onChange={(
                    event
                  ) => {
                    setNewPlayerName(
                      event.target.value
                    );

                    setRosterMessage(
                      ""
                    );
                  }}
                  onKeyDown={(
                    event
                  ) => {
                    if (
                      event.key ===
                      "Enter"
                    ) {
                      event.preventDefault();

                      addSavedPlayer();
                    }
                  }}
                  className="h-12 min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 font-semibold outline-none placeholder:text-zinc-700 focus:border-violet-500"
                />

                <button
                  onClick={
                    addSavedPlayer
                  }
                  disabled={
                    !newPlayerName.trim()
                  }
                  className="h-12 rounded-2xl bg-violet-600 px-5 font-black disabled:opacity-30"
                >
                  Add
                </button>

              </div>

              {/* SHARE IMPORT */}

              <div className="mt-4 grid grid-cols-2 gap-3">

                <button
                  onClick={
                    shareRoster
                  }
                  disabled={
                    savedPlayers.length ===
                    0
                  }
                  className="rounded-2xl border border-violet-500/30 bg-violet-500/10 py-3 text-sm font-bold text-violet-200 disabled:opacity-30"
                >
                  Share Roster
                </button>

                <button
                  onClick={() =>
                    setShowImportBox(
                      (current) =>
                        !current
                    )
                  }
                  className="rounded-2xl border border-white/10 py-3 text-sm font-bold text-zinc-300"
                >
                  Import Roster
                </button>

              </div>

              {showImportBox && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">

                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-500">
                    Paste Shared Roster Link
                  </p>

                  <textarea
                    value={
                      importText
                    }
                    onChange={(
                      event
                    ) =>
                      setImportText(
                        event.target.value
                      )
                    }
                    placeholder="Paste the roster link your friend sent"
                    rows={
                      3
                    }
                    className="mt-3 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm outline-none placeholder:text-zinc-700 focus:border-violet-500"
                  />

                  <button
                    onClick={
                      importRosterFromText
                    }
                    disabled={
                      !importText.trim()
                    }
                    className="mt-3 w-full rounded-2xl bg-white py-3 font-black text-black disabled:opacity-30"
                  >
                    Import Names
                  </button>

                </div>
              )}

              {rosterMessage && (
                <p className="mt-3 text-xs leading-5 text-violet-300">
                  {
                    rosterMessage
                  }
                </p>
              )}

            </div>

            {players.length <
              3 && (
              <div className="mt-5 rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4">

                <p className="text-sm text-amber-200">
                  Select at least 3 players to start.
                </p>

              </div>
            )}

            {/* IMPOSTER COUNT */}

            <div className="mt-10">

              <div className="flex items-end justify-between gap-3">

                <div>

                  <h2 className="text-lg font-black">
                    Number of Imposters
                  </h2>

                  <p className="mt-1 text-xs text-zinc-500">
                    Recommended for this group:{" "}
                    {
                      recommendedImposters
                    }
                  </p>

                </div>

                <p className="text-xs text-zinc-600">
                  Max{" "}
                  {
                    maxImposters
                  }
                </p>

              </div>

              <div className="mt-5 flex items-center justify-between rounded-3xl border border-white/10 bg-white/[0.03] p-4">

                <button
                  onClick={
                    decreaseImposters
                  }
                  disabled={
                    imposterCount <=
                    1
                  }
                  className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 text-3xl disabled:opacity-20"
                >
                  −
                </button>

                <div className="text-center">

                  <p className="text-4xl font-black">
                    {
                      imposterCount
                    }
                  </p>

                  <p className="mt-1 text-xs text-zinc-500">
                    {
                      imposterCount ===
                      1
                        ? "Imposter"
                        : "Imposters"
                    }
                  </p>

                </div>

                <button
                  onClick={
                    increaseImposters
                  }
                  disabled={
                    imposterCount >=
                    maxImposters
                  }
                  className="flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-500/10 text-3xl text-violet-300 disabled:opacity-20"
                >
                  +
                </button>

              </div>

            </div>

            {/* ELIMINATION */}

            <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.03] p-5">

              <div className="flex items-center justify-between gap-5">

                <div>

                  <div className="flex items-center gap-2">

                    <h2 className="font-black">
                      Elimination Mode
                    </h2>

                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-black ${
                        eliminationMode
                          ? "bg-violet-500/20 text-violet-200"
                          : "bg-white/5 text-zinc-500"
                      }`}
                    >
                      {
                        eliminationMode
                          ? "ON"
                          : "OFF"
                      }
                    </span>

                  </div>

                  <p className="mt-1 text-sm leading-5 text-zinc-500">
                    Remove the voted player and continue the match.
                  </p>

                </div>

                <button
                  onClick={() =>
                    setEliminationMode(
                      (current) =>
                        !current
                    )
                  }
                  className={`relative h-8 w-14 flex-none rounded-full transition ${
                    eliminationMode
                      ? "bg-violet-600"
                      : "bg-zinc-700"
                  }`}
                >

                  <span
                    className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
                      eliminationMode
                        ? "left-7"
                        : "left-1"
                    }`}
                  />

                </button>

              </div>

              <div className="mt-4 rounded-2xl bg-black/20 p-4 text-xs leading-5 text-zinc-500">

                {eliminationMode ? (
                  <>
                    Every voted player is eliminated and becomes a spectator. With 1 surviving Imposter, the game continues until only 1 normal player remains. With 2+ surviving Imposters, it continues while at least 3 normal players remain.
                  </>
                ) : (
                  <>
                    Quick mode: wrong guesses use a voting round but do not eliminate normal players. Catch every Imposter before the voting rounds run out.
                  </>
                )}

              </div>

            </div>

            {/* PRIVATE VOTING */}

            <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">

              <div className="flex items-center justify-between gap-5">

                <div>

                  <div className="flex items-center gap-2">

                    <h2 className="font-black">
                      Private Phone Voting
                    </h2>

                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-black ${
                        privatePhoneVoting
                          ? "bg-violet-500/20 text-violet-200"
                          : "bg-white/5 text-zinc-500"
                      }`}
                    >
                      {
                        privatePhoneVoting
                          ? "ON"
                          : "OFF"
                      }
                    </span>

                  </div>

                  <p className="mt-1 text-sm leading-5 text-zinc-500">
                    Pass the phone privately for every player&apos;s vote.
                  </p>

                </div>

                <button
                  onClick={() =>
                    setPrivatePhoneVoting(
                      (current) =>
                        !current
                    )
                  }
                  className={`relative h-8 w-14 flex-none rounded-full transition ${
                    privatePhoneVoting
                      ? "bg-violet-600"
                      : "bg-zinc-700"
                  }`}
                >

                  <span
                    className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
                      privatePhoneVoting
                        ? "left-7"
                        : "left-1"
                    }`}
                  />

                </button>

              </div>

              <div className="mt-4 rounded-2xl bg-black/20 p-4 text-xs leading-5 text-zinc-500">

                {
                  privatePhoneVoting
                    ? "Everyone votes secretly by passing the phone."
                    : "Vote normally together, then record the group's final choice once on the phone."
                }

              </div>

            </div>

            {/* CUSTOM RULES */}

            {gameMode ===
              "custom" && (
              <div className="mt-6 rounded-3xl border border-violet-500/20 bg-violet-500/[0.05] p-5">

                <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-300">
                  Custom Rules
                </p>

                <h2 className="mt-2 text-xl font-black">
                  Advanced controls
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  These settings only affect Custom Mode.
                </p>

                {/* RANDOM CLUE ORDER */}

                <div className="mt-6 border-t border-white/10 pt-5">

                  <div className="flex items-center justify-between gap-4">

                    <div>

                      <h3 className="font-bold">
                        Random Clue Order
                      </h3>

                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        Shuffle the speaking order every round.
                      </p>

                    </div>

                    <button
                      onClick={() =>
                        setRandomClueOrder(
                          (current) =>
                            !current
                        )
                      }
                      className={`relative h-8 w-14 flex-none rounded-full transition ${
                        randomClueOrder
                          ? "bg-violet-600"
                          : "bg-zinc-700"
                      }`}
                    >

                      <span
                        className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
                          randomClueOrder
                            ? "left-7"
                            : "left-1"
                        }`}
                      />

                    </button>

                  </div>

                </div>

                {/* SELF VOTE */}

                {privatePhoneVoting && (
                  <div className="mt-5 border-t border-white/10 pt-5">

                    <div className="flex items-center justify-between gap-4">

                      <div>

                        <h3 className="font-bold">
                          Allow Self Vote
                        </h3>

                        <p className="mt-1 text-xs leading-5 text-zinc-500">
                          Let a player vote for themselves during private voting.
                        </p>

                      </div>

                      <button
                        onClick={() =>
                          setAllowSelfVote(
                            (current) =>
                              !current
                          )
                        }
                        className={`relative h-8 w-14 flex-none rounded-full transition ${
                          allowSelfVote
                            ? "bg-violet-600"
                            : "bg-zinc-700"
                        }`}
                      >

                        <span
                          className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
                            allowSelfVote
                              ? "left-7"
                              : "left-1"
                          }`}
                        />

                      </button>

                    </div>

                  </div>
                )}

                {/* CUSTOM VOTING ROUNDS */}

                {!eliminationMode && (
                  <div className="mt-5 border-t border-white/10 pt-5">

                    <div className="flex items-center justify-between gap-4">

                      <div>

                        <h3 className="font-bold">
                          Custom Voting Rounds
                        </h3>

                        <p className="mt-1 text-xs leading-5 text-zinc-500">
                          OFF automatically uses the number of Imposters.
                        </p>

                      </div>

                      <button
                        onClick={() => {
                          setCustomVotingLimitEnabled(
                            (current) =>
                              !current
                          );

                          setCustomVotingLimit(
                            (current) =>
                              Math.max(
                                current,
                                imposterCount
                              )
                          );
                        }}
                        className={`relative h-8 w-14 flex-none rounded-full transition ${
                          customVotingLimitEnabled
                            ? "bg-violet-600"
                            : "bg-zinc-700"
                        }`}
                      >

                        <span
                          className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
                            customVotingLimitEnabled
                              ? "left-7"
                              : "left-1"
                          }`}
                        />

                      </button>

                    </div>

                    {customVotingLimitEnabled && (
                      <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 p-4">

                        <button
                          onClick={
                            decreaseCustomVotingLimit
                          }
                          disabled={
                            customVotingLimit <=
                            imposterCount
                          }
                          className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 text-2xl disabled:opacity-20"
                        >
                          −
                        </button>

                        <div className="text-center">

                          <p className="text-3xl font-black">
                            {
                              Math.max(
                                customVotingLimit,
                                imposterCount
                              )
                            }
                          </p>

                          <p className="mt-1 text-xs text-zinc-500">
                            Voting rounds
                          </p>

                        </div>

                        <button
                          onClick={
                            increaseCustomVotingLimit
                          }
                          disabled={
                            customVotingLimit >=
                            maximumCustomVotingRounds
                          }
                          className="flex h-12 w-12 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-2xl text-violet-300 disabled:opacity-20"
                        >
                          +
                        </button>

                      </div>
                    )}

                  </div>
                )}

              </div>
            )}

            {startError && (
              <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
                {
                  startError
                }
              </div>
            )}

            <button
              onClick={
                startGame
              }
              disabled={
                isStarting ||
                players.length <
                  3
              }
              className="mt-8 w-full rounded-2xl bg-violet-600 py-5 text-lg font-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {
                isStarting
                  ? "Preparing Game..."
                  : `Start ${
                      gameMode ===
                      "custom"
                        ? "Custom "
                        : ""
                    }Game`
              }
            </button>

          </section>
        )}

        {/* ROLE REVEAL */}

        {screen === "reveal" &&
          currentRevealPlayer && (
            <section className="flex flex-1 flex-col">

              {!roleVisible ? (
                <>

                  <div className="flex flex-1 flex-col items-center justify-center text-center">

                    <div className="text-5xl">
                      👤
                    </div>

                    <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-zinc-600">
                      Pass the phone to
                    </p>

                    <h1 className="mt-3 text-4xl font-black">
                      {
                        currentRevealPlayer.name
                      }
                    </h1>

                    <p className="mt-4 text-sm text-zinc-500">
                      Make sure nobody else can see the screen.
                    </p>

                    <p className="mt-6 text-xs text-zinc-700">
                      Player{" "}
                      {
                        revealIndex +
                        1
                      }{" "}
                      of{" "}
                      {
                        gamePlayers.length
                      }
                    </p>

                  </div>

                  <button
                    onClick={() =>
                      setRoleVisible(
                        true
                      )
                    }
                    className="w-full rounded-2xl bg-violet-600 py-5 text-lg font-black"
                  >
                    Reveal My Role
                  </button>

                </>
              ) : (
                <>

                  <div className="flex flex-1 items-center">

                    <div className="w-full rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 text-center">

                      {currentRevealPlayer.role ===
                      "imposter" ? (
                        <>

                          <div className="text-5xl">
                            🕵️
                          </div>

                          <h1 className="mt-6 text-4xl font-black">
                            Imposter
                          </h1>

                          <p className="mt-7 text-sm text-zinc-500">
                            Secret word
                          </p>

                          <p className="mt-2 text-3xl font-black">
                            ???
                          </p>

                        </>
                      ) : (
                        <>

                          <div className="text-5xl">
                            👀
                          </div>

                          <h1 className="mt-6 text-4xl font-black">
                            Player
                          </h1>

                          <p className="mt-7 text-sm text-zinc-500">
                            Secret word
                          </p>

                          <p className="mt-2 break-words text-3xl font-black">
                            {
                              secretWord
                            }
                          </p>

                        </>
                      )}

                    </div>

                  </div>

                  <button
                    onClick={
                      finishRoleReveal
                    }
                    className="w-full rounded-2xl bg-white py-5 text-lg font-black text-black"
                  >
                    {
                      revealIndex ===
                      gamePlayers.length -
                        1
                        ? "Hide & Start Game"
                        : "Hide & Pass Phone"
                    }
                  </button>

                </>
              )}

            </section>
          )}

        {/* ROUND */}

        {screen === "round" && (
          <section className="pb-5">

            <div className="flex items-center justify-between">

              <p className="text-xs font-bold tracking-[0.2em] text-violet-400">
                ROUND{" "}
                {
                  roundNumber
                }
              </p>

              {!eliminationMode && (
                <p className="text-xs font-bold text-amber-300">
                  Votes{" "}
                  {
                    votingRoundsUsed
                  }
                  /
                  {
                    maxVotingRounds
                  }
                </p>
              )}

            </div>

            <h1 className="mt-3 text-4xl font-black">
              Give your clues
            </h1>

            <p className="mt-3 text-sm leading-6 text-zinc-500">
              Each active player gives one clue. Discuss after everyone has spoken.
            </p>

            <div className="mt-7 space-y-3">

              {clueOrder.map(
                (
                  player,
                  index
                ) => (
                  <div
                    key={
                      player.id
                    }
                    className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                  >

                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 font-black text-violet-300">
                      {
                        index +
                        1
                      }
                    </div>

                    <p className="font-bold">
                      {
                        player.name
                      }
                    </p>

                  </div>
                )
              )}

            </div>

            {spectatorPlayers.length >
              0 && (
              <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.02] p-5">

                <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-600">
                  Spectators
                </p>

                <div className="mt-3 flex flex-wrap gap-2">

                  {spectatorPlayers.map(
                    (player) => (
                      <span
                        key={
                          player.id
                        }
                        className="rounded-full bg-white/5 px-3 py-2 text-xs text-zinc-500"
                      >
                        👁{" "}
                        {
                          player.name
                        }
                      </span>
                    )
                  )}

                </div>

              </div>
            )}

            <button
              onClick={
                startVoting
              }
              className="mt-8 w-full rounded-2xl bg-violet-600 py-5 text-lg font-black"
            >
              Start Voting
            </button>

          </section>
        )}

        {/* PRIVATE VOTE PASS */}

        {screen ===
          "vote-pass" &&
          currentVoter && (
            <section className="flex flex-1 flex-col">

              <div className="flex flex-1 flex-col items-center justify-center text-center">

                <div className="text-5xl">
                  🗳️
                </div>

                <p className="mt-8 text-xs uppercase tracking-[0.2em] text-zinc-600">
                  Pass the phone to
                </p>

                <h1 className="mt-3 text-4xl font-black">
                  {
                    currentVoter.name
                  }
                </h1>

                {isRevote && (
                  <p className="mt-4 font-bold text-amber-300">
                    Tie-break vote
                  </p>
                )}

              </div>

              <button
                onClick={
                  openPrivateVote
                }
                className="w-full rounded-2xl bg-violet-600 py-5 text-lg font-black"
              >
                Vote Privately
              </button>

            </section>
          )}

        {/* PRIVATE VOTE */}

        {screen === "vote" &&
          currentVoter && (
            <section>

              <p className="text-xs font-bold tracking-[0.2em] text-violet-400">
                {
                  isRevote
                    ? "TIE-BREAK"
                    : "PRIVATE VOTE"
                }
              </p>

              <h1 className="mt-3 text-3xl font-black">
                Who is an Imposter?
              </h1>

              <p className="mt-3 text-sm text-zinc-500">
                {
                  currentVoter.name
                }
                , choose one player.
              </p>

              <div className="mt-7 space-y-3">

                {availablePrivateVoteCandidates.map(
                  (player) => (
                    <button
                      key={
                        player.id
                      }
                      onClick={() =>
                        setSelectedVoteId(
                          player.id
                        )
                      }
                      className={`w-full rounded-2xl border p-5 text-left font-bold ${
                        selectedVoteId ===
                        player.id
                          ? "border-violet-500 bg-violet-500/15"
                          : "border-white/10 bg-white/[0.03]"
                      }`}
                    >
                      {
                        player.name
                      }
                    </button>
                  )
                )}

              </div>

              <button
                onClick={
                  submitPrivateVote
                }
                disabled={
                  selectedVoteId ===
                  null
                }
                className="mt-8 w-full rounded-2xl bg-white py-5 text-lg font-black text-black disabled:opacity-30"
              >
                Confirm Vote
              </button>

            </section>
          )}

        {/* GROUP VOTE */}

        {screen ===
          "group-vote" && (
          <section>

            <p className="text-xs font-bold tracking-[0.2em] text-violet-400">
              GROUP VOTE
            </p>

            <h1 className="mt-3 text-3xl font-black">
              Who did the group vote for?
            </h1>

            <p className="mt-3 text-sm leading-6 text-zinc-500">
              Vote together normally, then record the group&apos;s final choice here.
            </p>

            <div className="mt-7 space-y-3">

              {availableGroupCandidates.map(
                (player) => (
                  <button
                    key={
                      player.id
                    }
                    onClick={() =>
                      setSelectedVoteId(
                        player.id
                      )
                    }
                    className={`w-full rounded-2xl border p-5 text-left font-bold ${
                      selectedVoteId ===
                      player.id
                        ? "border-violet-500 bg-violet-500/15"
                        : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    {
                      player.name
                    }
                  </button>
                )
              )}

            </div>

            <button
              onClick={
                submitGroupVote
              }
              disabled={
                selectedVoteId ===
                null
              }
              className="mt-8 w-full rounded-2xl bg-violet-600 py-5 text-lg font-black disabled:opacity-30"
            >
              Confirm Group Vote
            </button>

          </section>
        )}

        {/* TIE */}

        {screen ===
          "vote-result" &&
          isRevote && (
            <section className="flex flex-1 flex-col">

              <div className="flex flex-1 flex-col items-center justify-center text-center">

                <div className="text-5xl">
                  ⚖️
                </div>

                <h1 className="mt-6 text-4xl font-black">
                  It&apos;s a tie
                </h1>

                <p className="mt-3 text-sm text-zinc-500">
                  Vote again between the tied players.
                </p>

                <div className="mt-7 w-full space-y-3">

                  {gamePlayers
                    .filter(
                      (
                        player
                      ) =>
                        voteCandidates.includes(
                          player.id
                        )
                    )
                    .map(
                      (
                        player
                      ) => (
                        <div
                          key={
                            player.id
                          }
                          className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 font-bold"
                        >
                          {
                            player.name
                          }
                        </div>
                      )
                    )}

                </div>

              </div>

              <button
                onClick={
                  startRevote
                }
                className="w-full rounded-2xl bg-violet-600 py-5 text-lg font-black"
              >
                Start Tie-Break
              </button>

            </section>
          )}

        {/* RESULT */}

        {screen === "result" &&
          roundResultPlayer && (
            <section className="flex flex-1 flex-col">

              <div className="flex flex-1 flex-col items-center justify-center text-center">

                {roundResultType ===
                "wrong-guess" ? (
                  <>

                    <div className="text-6xl">
                      ❌
                    </div>

                    <p className="mt-7 text-xs font-bold uppercase tracking-[0.2em] text-red-400">
                      WRONG GUESS
                    </p>

                    <h1 className="mt-3 text-4xl font-black">
                      {
                        roundResultPlayer.name
                      }
                    </h1>

                    <p className="mt-4 text-zinc-500">
                      was not an Imposter.
                    </p>

                    <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.03] p-5">

                      <p className="text-sm text-zinc-400">
                        Voting rounds used
                      </p>

                      <p className="mt-2 text-3xl font-black">
                        {
                          votingRoundsUsed
                        }
                        /
                        {
                          maxVotingRounds
                        }
                      </p>

                    </div>

                  </>
                ) : (
                  <>

                    <div className="text-6xl">
                      {
                        roundResultPlayer.role ===
                        "imposter"
                          ? "🕵️"
                          : "😬"
                      }
                    </div>

                    <p className="mt-7 text-xs font-bold uppercase tracking-[0.2em] text-zinc-600">
                      {
                        eliminationMode
                          ? "ELIMINATED"
                          : "CAUGHT"
                      }
                    </p>

                    <h1 className="mt-3 text-4xl font-black">
                      {
                        roundResultPlayer.name
                      }
                    </h1>

                    <p className="mt-5 text-xl font-bold">
                      {
                        roundResultPlayer.role ===
                        "imposter"
                          ? "Was an Imposter"
                          : "Was not an Imposter"
                      }
                    </p>

                  </>
                )}

                {!winner &&
                  remainingImposterCount >
                    0 && (
                    <div className="mt-8 rounded-2xl border border-violet-500/20 bg-violet-500/5 px-6 py-4">

                      <p className="text-sm text-violet-200">
                        {
                          remainingImposterCount
                        }{" "}
                        {
                          remainingImposterCount ===
                          1
                            ? "Imposter remains"
                            : "Imposters remain"
                        }
                      </p>

                    </div>
                  )}

              </div>

              <button
                onClick={
                  continueAfterResult
                }
                className="w-full rounded-2xl bg-violet-600 py-5 text-lg font-black"
              >
                {
                  winner
                    ? "See Result"
                    : "Continue Game"
                }
              </button>

            </section>
          )}

        {/* WINNER */}

        {screen === "winner" &&
          winner && (
            <section className="flex flex-1 flex-col">

              <div className="flex flex-1 flex-col items-center justify-center text-center">

                <div className="text-6xl">
                  {
                    winner ===
                    "players"
                      ? "🏆"
                      : "🕵️"
                  }
                </div>

                <p className="mt-7 text-xs font-bold tracking-[0.2em] text-violet-400">
                  GAME OVER
                </p>

                <h1 className="mt-4 text-5xl font-black">
                  {
                    winner ===
                    "players"
                      ? "Players Win!"
                      : "Imposters Win!"
                  }
                </h1>

                <div className="mt-9 w-full rounded-3xl border border-white/10 bg-white/[0.03] p-6">

                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">
                    Secret Word
                  </p>

                  <p className="mt-3 break-words text-3xl font-black">
                    {
                      secretWord
                    }
                  </p>

                  <div className="mt-6 border-t border-white/10 pt-6">

                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">
                      Imposters
                    </p>

                    <div className="mt-3 space-y-2">

                      {gamePlayers
                        .filter(
                          (
                            player
                          ) =>
                            player.role ===
                            "imposter"
                        )
                        .map(
                          (
                            player
                          ) => (
                            <p
                              key={
                                player.id
                              }
                              className="font-bold text-violet-300"
                            >
                              {
                                player.name
                              }
                            </p>
                          )
                        )}

                    </div>

                  </div>

                </div>

              </div>

              <div className="space-y-3">

                <button
                  onClick={
                    playAgainSamePlayers
                  }
                  className="w-full rounded-2xl bg-violet-600 py-5 text-lg font-black"
                >
                  Play Again
                </button>

                <button
                  onClick={
                    returnHome
                  }
                  className="w-full rounded-2xl border border-white/10 py-4 font-bold text-zinc-400"
                >
                  Home
                </button>

              </div>

            </section>
          )}

      </div>

    </main>
  );
}