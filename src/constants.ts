import { Suit, Rank } from './types';

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const PLAYER_COLORS = [
  '#3b82f6', // 1: Blue
  '#ef4444', // 2: Red
  '#10b981', // 3: Green
  '#8b5cf6', // 4: Purple
  '#ec4899', // 5: Pink
  '#eab308', // 6: Yellow
];

export const GAME_SETTINGS = {
  TOTAL_ROUNDS: 10,
  CARDS_PER_COLUMN: 5,
  COLUMNS: 7,
  BASE_SCORE: 1000,
  PENALTY_SCORE: -2500,
  STREAK_BONUS_FACTOR: 50, // Base multiplier for streaks
  COMBO_BONUS: 2.0, // Multiplier for rapid moves
  CLEAR_BONUS: 100000,
  PERFECT_CLEAR_BONUS: 500000, // No stock used
  TIME_BONUS_FACTOR: 100, // Score per second remaining
  INITIAL_ROUND_TIME: 150,
  ROUND_TIME_REDUCTION: 10,
  STREAK_GIFT_THRESHOLD: 3,
};
