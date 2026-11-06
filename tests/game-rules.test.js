import { describe, expect, it } from 'vitest';
import {
  createInitialGameState,
  getAccuracy,
  getRewardMultiplier,
  getUpgradeCost,
  purchaseUpgrade,
  resolvePrediction,
} from '../src/game-rules.js';
import { loadGameState, saveGameState } from '../src/game-storage.js';

function createMemoryStorage(initialValue = null) {
  let value = initialValue;
  return {
    getItem: () => value,
    setItem: (_key, nextValue) => { value = nextValue; },
  };
}

describe('game rules', () => {
  it('awards money and reputation for a correct prediction', () => {
    const result = resolvePrediction(createInitialGameState(), 'left', 'left');

    expect(result.isCorrect).toBe(true);
    expect(result.moneyReward).toBe(12);
    expect(result.reputationReward).toBe(3);
    expect(result.state).toMatchObject({ money: 12, reputation: 3, correctPredictions: 1, totalPredictions: 1 });
  });

  it('counts an incorrect prediction without awarding a reward', () => {
    const result = resolvePrediction(createInitialGameState(), 'left', 'right');

    expect(result.isCorrect).toBe(false);
    expect(result.moneyReward).toBe(0);
    expect(result.reputationReward).toBe(0);
    expect(result.state).toMatchObject({ correctPredictions: 0, totalPredictions: 1 });
  });

  it('calculates accuracy for empty and completed runs', () => {
    expect(getAccuracy(createInitialGameState())).toBe(0);
    expect(getAccuracy({ correctPredictions: 2, totalPredictions: 3 })).toBeCloseTo(2 / 3);
  });

  it('increases rewards after buying an upgrade and rejects unaffordable purchases', () => {
    const state = { ...createInitialGameState(), money: 24 };
    const purchase = purchaseUpgrade(state);
    const reward = resolvePrediction(purchase.state, 'right', 'right');

    expect(purchase.purchased).toBe(true);
    expect(purchase.state.money).toBe(0);
    expect(getRewardMultiplier(purchase.state)).toBe(1.35);
    expect(reward.moneyReward).toBe(16);
    expect(getUpgradeCost(purchase.state)).toBe(42);
    expect(purchaseUpgrade(purchase.state).purchased).toBe(false);
  });

  it('saves and restores progress, while invalid data starts a fresh run', () => {
    const storage = createMemoryStorage();
    const state = { ...createInitialGameState(), money: 40, totalPredictions: 3, correctPredictions: 2 };

    expect(saveGameState(state, storage)).toBe(true);
    expect(loadGameState(storage)).toEqual(state);

    const invalidStorage = createMemoryStorage('{not json');
    expect(loadGameState(invalidStorage)).toEqual(createInitialGameState());
  });
});