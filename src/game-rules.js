export const DIRECTIONS = Object.freeze(['left', 'right']);

export function createInitialGameState() {
  return {
    money: 0,
    reputation: 0,
    correctPredictions: 0,
    totalPredictions: 0,
    upgradeLevel: 0,
  };
}

export function getAccuracy(state) {
  if (state.totalPredictions === 0) return 0;
  return state.correctPredictions / state.totalPredictions;
}

export function getRewardMultiplier(state) {
  return 1 + state.upgradeLevel * 0.35;
}

export function getUpgradeCost(state) {
  return Math.ceil(24 * 1.72 ** state.upgradeLevel);
}

export function resolvePrediction(state, prediction, actualDirection) {
  if (!DIRECTIONS.includes(prediction) || !DIRECTIONS.includes(actualDirection)) {
    throw new TypeError('Prediction and actual direction must be left or right.');
  }

  const isCorrect = prediction === actualDirection;
  const multiplier = getRewardMultiplier(state);
  const moneyReward = isCorrect ? Math.round(12 * multiplier) : 0;
  const reputationReward = isCorrect ? Math.round(3 * multiplier) : 0;

  return {
    isCorrect,
    moneyReward,
    reputationReward,
    state: {
      ...state,
      money: state.money + moneyReward,
      reputation: state.reputation + reputationReward,
      correctPredictions: state.correctPredictions + Number(isCorrect),
      totalPredictions: state.totalPredictions + 1,
    },
  };
}

export function purchaseUpgrade(state) {
  const cost = getUpgradeCost(state);
  if (state.money < cost) return { state, purchased: false, cost };

  return {
    state: {
      ...state,
      money: state.money - cost,
      upgradeLevel: state.upgradeLevel + 1,
    },
    purchased: true,
    cost,
  };
}

export function isValidGameState(value) {
  if (!value || typeof value !== 'object') return false;

  const integerFields = [
    'money',
    'reputation',
    'correctPredictions',
    'totalPredictions',
    'upgradeLevel',
  ];

  if (!integerFields.every((field) => Number.isSafeInteger(value[field]) && value[field] >= 0)) {
    return false;
  }

  return value.correctPredictions <= value.totalPredictions;
}

export function normalizeGameState(value) {
  if (!isValidGameState(value)) return createInitialGameState();

  return {
    money: value.money,
    reputation: value.reputation,
    correctPredictions: value.correctPredictions,
    totalPredictions: value.totalPredictions,
    upgradeLevel: value.upgradeLevel,
  };
}