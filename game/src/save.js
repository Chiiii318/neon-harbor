// Neon Harbor — localStorage save game: cash, finished missions, position.
import { SAVE_KEY, ECONOMY } from './config.js';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number') return null;
    return data;
  } catch (err) {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function writeSave(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: Math.floor(state.cash),
      missionsDone: state.missionsDone || 0,
      wantedPeak: state.wantedPeak || 0,
      playerPos: state.playerPos || null,
      carPos: state.carPos || null,
    }));
  } catch (err) {
    // Storage can be unavailable (private mode); the game simply runs unsaved.
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* ignore */ }
}

export function freshState() {
  return { cash: ECONOMY.startCash, missionsDone: 0, wantedPeak: 0, playerPos: null, carPos: null };
}
