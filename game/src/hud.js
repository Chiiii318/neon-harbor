// Neon Harbor — HUD refresh and the canvas minimap.
// Minimap draws the road grid, beach, player arrow, traffic (grey), police
// (alternating red/blue), pedestrians (dots) and the mission marker (gold).

import { CITY } from './config.js';
import { clamp, formatMoney } from './random.js';
import { roadCentres } from './city.js';

export class Hud {
  constructor() {
    this.cashEl = document.getElementById('hud-cash');
    this.starsEl = document.getElementById('hud-stars');
    this.healthEl = document.getElementById('hud-health-fill');
    this.speedEl = document.getElementById('hud-speed');
    this.objectiveEl = document.getElementById('hud-objective');
    this.objectiveTitleEl = document.getElementById('hud-objective-title');
    this.objectiveTimeEl = document.getElementById('hud-objective-time');
    this.promptEl = document.getElementById('hud-prompt');
    this.toastEl = document.getElementById('hud-toast');
    this.bustWrap = document.getElementById('hud-bust');
    this.bustFill = document.getElementById('hud-bust-fill');
    this.wantedFlashEl = document.getElementById('hud-wanted-label');
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map ? this.map.getContext('2d') : null;
    this._toastTimer = null;
    this._lastStars = -1;
  }

  setCash(amount) {
    if (this.cashEl) this.cashEl.textContent = formatMoney(amount);
  }

  setStars(stars, hidden) {
    if (!this.starsEl) return;
    if (stars !== this._lastStars) {
      this._lastStars = stars;
      this.starsEl.textContent = '★★★★★'.slice(0, stars) + '☆☆☆☆☆'.slice(0, 5 - stars);
      this.starsEl.classList.toggle('has-stars', stars > 0);
    }
    this.starsEl.style.opacity = hidden && stars > 0 ? (0.35 + 0.3 * Math.sin(performance.now() * 0.012)) : 1;
    if (this.wantedFlashEl) this.wantedFlashEl.style.visibility = stars > 0 ? 'visible' : 'hidden';
  }

  setHealth(ratio) {
    if (this.healthEl) this.healthEl.style.width = (clamp(ratio, 0, 1) * 100).toFixed(0) + '%';
  }

  setSpeed(kmh, driving) {
    if (!this.speedEl) return;
    this.speedEl.style.visibility = driving ? 'visible' : 'hidden';
    if (driving) this.speedEl.textContent = Math.round(kmh) + ' km/h';
  }

  setObjective(obj) {
    if (!obj) return;
    if (this.objectiveTitleEl) this.objectiveTitleEl.textContent = obj.title || '';
    if (this.objectiveEl) this.objectiveEl.textContent = obj.detail || '';
    if (this.objectiveTimeEl) this.objectiveTimeEl.textContent = obj.time ? '⏱ ' + obj.time : '';
  }

  setPrompt(text) {
    if (!this.promptEl) return;
    this.promptEl.textContent = text || '';
    this.promptEl.style.visibility = text ? 'visible' : 'hidden';
  }

  setBust(ratio) {
    if (!this.bustWrap) return;
    this.bustWrap.style.visibility = ratio > 0.02 ? 'visible' : 'hidden';
    if (this.bustFill) this.bustFill.style.width = (clamp(ratio, 0, 1) * 100).toFixed(0) + '%';
  }

  toast(text, ms) {
    if (!this.toastEl) return;
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms || 2600);
  }

  drawMinimap(state) {
    const ctx = this.mapCtx;
    if (!ctx) return;
    const W = this.map.width;
    const H = this.map.height;
    const world = CITY.halfSize + 26;
    const toMap = (x, z) => ({ x: ((x + world) / (world * 2)) * W, y: ((z + world) / (world * 2)) * H });
    ctx.fillStyle = '#20303a';
    ctx.fillRect(0, 0, W, H);
    // sea + beach
    const seaStart = toMap(CITY.seaX - CITY.beachWidth, 0);
    ctx.fillStyle = '#c9b078';
    ctx.fillRect(seaStart.x, 0, 10, H);
    ctx.fillStyle = '#1d6f8e';
    ctx.fillRect(seaStart.x + 10, 0, W - seaStart.x, H);
    // roads
    ctx.strokeStyle = '#5b6a72';
    ctx.lineWidth = 3;
    for (const c of roadCentres()) {
      const v = toMap(c, 0);
      ctx.beginPath(); ctx.moveTo(v.x, 0); ctx.lineTo(v.x, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, v.y); ctx.lineTo(W, v.y); ctx.stroke();
    }
    const dot = (x, z, r, color) => {
      const p = toMap(x, z);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const ped of state.peds || []) dot(ped.pos.x, ped.pos.z, 1.4, '#cfd8dc');
    for (const car of state.traffic || []) dot(car.pos.x, car.pos.z, 2.2, '#90a4ae');
    const blink = Math.floor(performance.now() / 280) % 2 === 0;
    for (const unit of state.police || []) dot(unit.pos.x, unit.pos.z, 3, blink ? '#ff3b30' : '#2a6bff');
    if (state.marker) {
      const mp = toMap(state.marker.x, state.marker.z);
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, 4.4 + Math.sin(performance.now() * 0.006) * 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff3b0';
      ctx.stroke();
    }
    // player arrow
    const pp = toMap(state.player.pos.x, state.player.pos.z);
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.rotate(-state.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(0, 2.4);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
