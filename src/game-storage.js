import { createInitialGameState, normalizeGameState } from './game-rules.js';

const STORAGE_KEY = 'spoontastic.save.v1';

function getBrowserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function loadGameState(storage = getBrowserStorage()) {
  if (!storage) return createInitialGameState();

  try {
    const savedValue = storage.getItem(STORAGE_KEY);
    return savedValue ? normalizeGameState(JSON.parse(savedValue)) : createInitialGameState();
  } catch {
    return createInitialGameState();
  }
}

export function saveGameState(state, storage = getBrowserStorage()) {
  if (!storage) return false;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}