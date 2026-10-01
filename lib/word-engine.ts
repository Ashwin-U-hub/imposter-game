export type WordBank = {
  version: number;
  count: number;
  words: string[];
};

type StoredDeck = {
  bankVersion: number;
  bankSize: number;
  order: number[];
  cursor: number;
  lastIndex: number | null;
};

const STORAGE_KEY = "imposter-word-deck-v1";

let cachedWordBank: WordBank | null = null;

function getSecureRandomInt(maxExclusive: number) {
  if (maxExclusive <= 0) {
    return 0;
  }

  const values = new Uint32Array(1);
  crypto.getRandomValues(values);

  return values[0] % maxExclusive;
}

function createShuffledOrder(size: number) {
  const order = Array.from(
    { length: size },
    (_, index) => index
  );

  for (let i = order.length - 1; i > 0; i--) {
    const randomIndex = getSecureRandomInt(i + 1);

    [order[i], order[randomIndex]] = [
      order[randomIndex],
      order[i],
    ];
  }

  return order;
}

function createFreshDeck(
  bank: WordBank,
  previousLastIndex: number | null = null
): StoredDeck {
  const order = createShuffledOrder(bank.words.length);

  // When starting a brand-new cycle, prevent the first word
  // from being the same as the final word of the previous cycle.
  if (
    previousLastIndex !== null &&
    order.length > 1 &&
    order[0] === previousLastIndex
  ) {
    [order[0], order[1]] = [
      order[1],
      order[0],
    ];
  }

  return {
    bankVersion: bank.version,
    bankSize: bank.words.length,
    order,
    cursor: 0,
    lastIndex: previousLastIndex,
  };
}

function saveDeck(deck: StoredDeck) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(deck)
    );
  } catch {
    // If browser storage is unavailable, the game can
    // still continue during the current session.
  }
}

function loadStoredDeck(bank: WordBank): StoredDeck | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredDeck;

    if (
      parsed.bankVersion !== bank.version ||
      parsed.bankSize !== bank.words.length ||
      !Array.isArray(parsed.order) ||
      parsed.order.length !== bank.words.length ||
      typeof parsed.cursor !== "number"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function loadWordBank(): Promise<WordBank> {
  if (cachedWordBank) {
    return cachedWordBank;
  }

  const response = await fetch(
    "/data/word-bank.json",
    {
      cache: "force-cache",
    }
  );

  if (!response.ok) {
    throw new Error(
      "Unable to load the Imposter word bank."
    );
  }

  const data = (await response.json()) as WordBank;

  if (
    !data ||
    !Array.isArray(data.words) ||
    data.words.length === 0
  ) {
    throw new Error(
      "The Imposter word bank is empty or invalid."
    );
  }

  cachedWordBank = {
    version: data.version,
    count: data.words.length,
    words: data.words,
  };

  return cachedWordBank;
}

export async function getNextSecretWord() {
  const bank = await loadWordBank();

  let deck = loadStoredDeck(bank);

  if (!deck) {
    deck = createFreshDeck(bank);
  }

  if (deck.cursor >= deck.order.length) {
    deck = createFreshDeck(
      bank,
      deck.lastIndex
    );
  }

  const selectedIndex =
    deck.order[deck.cursor];

  const selectedWord =
    bank.words[selectedIndex];

  deck.cursor += 1;
  deck.lastIndex = selectedIndex;

  saveDeck(deck);

  return selectedWord;
}

export async function getWordBankStatus() {
  const bank = await loadWordBank();

  const deck =
    loadStoredDeck(bank) ??
    createFreshDeck(bank);

  return {
    totalWords: bank.words.length,
    usedWords: deck.cursor,
    remainingWords:
      bank.words.length - deck.cursor,
  };
}

export function resetWordHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore unavailable browser storage.
  }
}