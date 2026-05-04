import { Card, Suit, Rank, TableState } from '../types';
import { SUITS, RANKS, GAME_SETTINGS } from '../constants';

// Seeded random for fair multiplayer/competition
const seededRandom = (seed: number) => {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
};

export const createDeck = (): Card[] => {
  const deck: Card[] = [];
  SUITS.forEach((suit) => {
    RANKS.forEach((rank, index) => {
      deck.push({
        id: `${suit}-${rank}`,
        suit,
        rank,
        value: index + 1,
        isFaceUp: false,
      });
    });
  });
  return deck;
};

export const shuffle = (deck: Card[], seed?: number): Card[] => {
  const newDeck = [...deck];
  const useSeed = seed !== undefined;
  let randomFunc = useSeed ? () => seededRandom(seed++) : Math.random;

  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(randomFunc() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

export const deal = (currentRound: number = 1, seed?: number) => {
  const deck = shuffle(createDeck(), seed);
  
  // Complexity increases with rounds
  // We'll define layouts based on round
  let columns: Card[][] = [];
  let cardsToDeploy = 0;

  if (currentRound <= 3) {
    // 3 Pyramids of 6 cards each = 18 cards
    columns = Array.from({ length: 3 }, () => []);
    cardsToDeploy = 18;
    for (let p = 0; p < 3; p++) {
      for (let i = 0; i < 6; i++) {
        const card = deck.pop()!;
        card.isFaceUp = i >= 3; // Bottom row face up
        (card as any).originalIdx = i;
        columns[p].push(card);
      }
    }
  } else if (currentRound <= 6) {
    // 5 Columns of 5 cards each = 25 cards (capped at 24 for layout plus foundation if needed, but let's stick to logic)
    // Actually user said deck max 24. But usually Golf has 35 on board. 
    // Let's use 24 total for board + stock? User said "max card in deck limited on 24". 
    // Usually "deck" means the stock. Let's limit stock to 24.
    columns = Array.from({ length: 5 }, () => []);
    cardsToDeploy = 20; 
    for (let i = 0; i < cardsToDeploy; i++) {
      const card = deck.pop()!;
      const colIdx = i % 5;
      card.isFaceUp = i >= cardsToDeploy - 5;
      columns[colIdx].push(card);
    }
  } else if (currentRound <= 9) {
    // 7 Columns
    columns = Array.from({ length: 7 }, () => []);
    cardsToDeploy = 21;
    for (let i = 0; i < cardsToDeploy; i++) {
      const card = deck.pop()!;
      const colIdx = i % 7;
      card.isFaceUp = i >= cardsToDeploy - 7;
      columns[colIdx].push(card);
    }
  } else {
    // Master Round: 8 Columns
    columns = Array.from({ length: 8 }, () => []);
    cardsToDeploy = 24; // Reduce from 32 to fit 52 card limit (24 board + 24 stock + 1 foundation = 49)
    for (let i = 0; i < cardsToDeploy; i++) {
      const card = deck.pop()!;
      if (!card) break;
      const colIdx = i % 8;
      card.isFaceUp = i >= cardsToDeploy - 8;
      columns[colIdx].push(card);
    }
  }

  const foundationCard = deck.pop()!;
  foundationCard.isFaceUp = true;
  
  const foundations = [[foundationCard], []];
  
  // LIMIT STOCK TO 24
  const stock = deck.slice(0, 24);

  return { columns, stock, foundations };
};

export const canMoveToFoundation = (card: Card, foundationTop: Card): boolean => {
  const v1 = card.value;
  const v2 = foundationTop.value;
  
  const diff = Math.abs(v1 - v2);
  if (diff === 1) return true;
  if ((v1 === 1 && v2 === 13) || (v1 === 13 && v2 === 1)) return true;
  
  return false;
};

export const calculateRoundScore = (state: TableState): number => {
  let score = state.score;
  const remainingCards = state.columns.reduce((acc, col) => acc + col.length, 0);
  
  // Penalty for cards left on board
  const penalty = remainingCards * 50; 
  score = Math.max(0, score - penalty);
  
  return score;
};
