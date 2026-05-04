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
  
  // Formation-based dealing
  let columns: Card[][] = [];
  let cardsToDeploy = 0;
  let numPiles = 0;

  if (currentRound === 1) {
    // Pyramid: 15 cards (1-2-3-4-5) = 15 cards
    numPiles = 15; 
    cardsToDeploy = 15;
  } else if (currentRound === 2) {
    // Crescent: 18 cards
    numPiles = 9;
    cardsToDeploy = 18;
  } else if (currentRound === 3) {
    // Twin Peaks: 12 cards
    numPiles = 12;
    cardsToDeploy = 12;
  } else if (currentRound === 4) {
    // Star: 16 cards
    numPiles = 8;
    cardsToDeploy = 16;
  } else if (currentRound === 5) {
    // Columns: 20 cards
    numPiles = 5;
    cardsToDeploy = 20; 
  } else {
    // Dynamic
    numPiles = Math.min(10, 5 + Math.floor(currentRound / 2));
    cardsToDeploy = Math.min(30, 15 + currentRound * 2);
  }

  columns = Array.from({ length: numPiles }, () => []);
  
  for (let i = 0; i < cardsToDeploy; i++) {
    const card = deck.pop()!;
    if (!card) break;
    const colIdx = i % numPiles;
    card.isFaceUp = false; // Ensure all are face down initially
    columns[colIdx].push(card);
  }

  // Set face up status based on round
  columns.forEach((pile, pIdx) => {
    if (pile.length > 0) {
      if (currentRound === 1) {
        // Pyramid: Only the bottom row (indices 10 to 14) starts face up
        pile[pile.length - 1].isFaceUp = pIdx >= 10;
      } else {
        // Default: Top card of each stack is face up
        pile[pile.length - 1].isFaceUp = true;
      }
    }
  });

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
