export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  value: number; // A=1, J=11, Q=12, K=13
  isFaceUp: boolean;
  hasKey?: boolean;
  originalIdx?: number;
}

export type GameState = 'menu' | 'playing' | 'round_over' | 'game_over' | 'rankings' | 'slots' | 'lobby' | 'profile';

export interface Player {
  id: string;
  name: string;
  color: string;
  score: number;
  rounds: number[];
  profileIcon?: string;
  isReady?: boolean;
}

export interface ScoreEvent {
  id: string;
  value: number;
  multiplier: number;
  x: number;
  y: number;
  label?: string;
  type: 'score' | 'bonus' | 'penalty';
}

export interface TableState {
  columns: Card[][];
  stock: Card[];
  initialStockLength: number;
  foundations: Card[][];
  currentRound: number;
  totalRounds: number;
  score: number;
  streak: number;
  maxStreak: number;
  cardsRemoved: number;
  slot2Unlocked: boolean;
  keyFound: boolean;
  timer: number;
  scoreEvents: ScoreEvent[];
  opponents: { id: string | number, score: number, color: string, name: string }[];
}
