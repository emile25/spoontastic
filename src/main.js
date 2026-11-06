import './style.css';
import { getAccuracy, getUpgradeCost, purchaseUpgrade, resolvePrediction } from './game-rules.js';
import { loadGameState, saveGameState } from './game-storage.js';
import { SpoonScene } from './spoon-scene.js';

const elements = {
  appShell: document.querySelector('.app-shell'),
  money: document.querySelector('#money-value'),
  reputation: document.querySelector('#reputation-value'),
  accuracy: document.querySelector('#accuracy-value'),
  accuracyDetail: document.querySelector('#accuracy-detail'),
  accuracyTrack: document.querySelector('#accuracy-track'),
  accuracyBar: document.querySelector('#accuracy-bar'),
  predictionCount: document.querySelector('#prediction-count'),
  feedback: document.querySelector('#feedback'),
  sceneMessage: document.querySelector('#scene-message'),
  round: document.querySelector('#round-value'),
  upgradeCost: document.querySelector('#upgrade-cost'),
  upgradeLevel: document.querySelector('#upgrade-level'),
  upgradeButton: document.querySelector('#upgrade-button'),
};

const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
let state = loadGameState();
let phase = 'ready';
let roundNumber = state.totalPredictions + 1;

function render() {
  const accuracy = getAccuracy(state);
  const percent = Math.round(accuracy * 100);
  const upgradeCost = getUpgradeCost(state);
  elements.money.textContent = `$${compactNumber.format(state.money)}`;
  elements.reputation.textContent = compactNumber.format(state.reputation);
  elements.accuracy.textContent = `${percent}%`;
  elements.accuracyDetail.textContent = `${percent}%`;
  elements.accuracyTrack.setAttribute('aria-valuenow', String(percent));
  elements.accuracyBar.style.width = `${percent}%`;
  elements.predictionCount.textContent = `${state.correctPredictions} correct of ${state.totalPredictions} readings`;
  elements.round.textContent = `ROUND ${String(roundNumber).padStart(2, '0')}`;
  elements.upgradeCost.textContent = `$${compactNumber.format(upgradeCost)}`;
  elements.upgradeLevel.innerHTML = `LEVEL ${state.upgradeLevel} <span>·</span> +35% PER LEVEL`;
  elements.upgradeButton.disabled = phase !== 'ready' || state.money < upgradeCost;
}

function submitPrediction(prediction) {
  if (phase !== 'ready') return;

  const actualDirection = Math.random() < 0.5 ? 'left' : 'right';
  const result = resolvePrediction(state, prediction, actualDirection);
  state = result.state;
  phase = 'resolving';
  saveGameState(state);
  render();

  if (result.isCorrect) {
    elements.feedback.textContent = `Correct. The spoon bent ${actualDirection}. +$${result.moneyReward} · +${result.reputationReward} reputation`;
    elements.sceneMessage.textContent = `Correct reading: it bent ${actualDirection}.`;
  } else {
    elements.feedback.textContent = `Wrong reading. The spoon bent ${actualDirection}.`;
    elements.sceneMessage.textContent = `Wrong reading: it bent ${actualDirection}.`;
    elements.appShell.classList.remove('is-shaking');
    void elements.appShell.offsetWidth;
    elements.appShell.classList.add('is-shaking');
  }

  scene.resolvePrediction(actualDirection, result.isCorrect);
}

function finishRound() {
  phase = 'ready';
  roundNumber += 1;
  elements.sceneMessage.textContent = 'The table is listening.';
  render();
}

const scene = await SpoonScene.create(document.querySelector('#game-canvas'), finishRound);
scene.onSwipe = submitPrediction;

elements.upgradeButton.addEventListener('click', () => {
  if (phase !== 'ready') return;
  const purchase = purchaseUpgrade(state);
  if (!purchase.purchased) return;

  state = purchase.state;
  saveGameState(state);
  elements.feedback.textContent = 'Your intuition deepens. Good readings are worth more.';
  render();
});

window.addEventListener('pagehide', () => saveGameState(state));
render();