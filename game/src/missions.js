// Neon Harbor — mission definitions and runner.
// Story chain: Marina Vale owes the harbour dispatcher "Big Sal" a favour, so
// she runs his errands. Three mission kinds rotate: timed delivery,
// checkpoint ring race, and recovering a stolen car. Each shows a glowing
// beacon + minimap marker, pays cash, and chains into the next offer.

import { CITY } from './config.js';
import { distance2d, formatClock } from './random.js';
import { nearestIntersection } from './city.js';

export const MISSION_DEFS = [
  {
    id: 'delivery',
    title: 'Hot Crate Delivery',
    giver: 'Big Sal (Harbour Dispatch)',
    brief: 'Take the crate across town before the timer runs out. Any car, any route — just be fast.',
    pay: 220,
    timeLimit: 75,
    needCar: false,
  },
  {
    id: 'ring',
    title: 'Harbour Ring Run',
    giver: 'Big Sal (Harbour Dispatch)',
    brief: 'Hit every checkpoint around the ring in order. A car is strongly recommended.',
    pay: 300,
    timeLimit: 110,
    needCar: true,
  },
  {
    id: 'recovery',
    title: 'Stolen Wheels',
    giver: 'Big Sal (Harbour Dispatch)',
    brief: 'A joyrider dumped the harbour runabout. Reach it, get in, and bring it back to the depot.',
    pay: 260,
    timeLimit: 120,
    needCar: false,
  },
];

function farPoint(rng, from, minDist) {
  for (let i = 0; i < 30; i++) {
    const spot = nearestIntersection(
      (rng() * 2 - 1) * (CITY.halfSize - 40),
      (rng() * 2 - 1) * (CITY.halfSize - 40)
    );
    if (spot.x > CITY.seaX - 40) continue;
    if (distance2d(spot.x, spot.z, from.x, from.z) >= minDist) return spot;
  }
  return { x: -150, z: -150 };
}

export class MissionRunner {
  constructor(scene, rng) {
    this.rng = rng;
    this.scene = scene;
    this.offerIndex = 0;       // which def is currently offered
    this.active = null;        // running mission state
    this.completed = 0;
    // glowing beacon: cylinder + point sprite column
    const geo = new THREE.CylinderGeometry(1.6, 1.6, 26, 14, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd23e, transparent: true, opacity: 0.34,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.position.y = 13;
    this.beacon.visible = false;
    scene.add(this.beacon);
    const ringGeo = new THREE.TorusGeometry(1.9, 0.14, 8, 26);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.25;
    this.ring.visible = false;
    scene.add(this.ring);
  }

  currentOffer() {
    return MISSION_DEFS[this.offerIndex % MISSION_DEFS.length];
  }

  offerPoint(playerPos) {
    // the offer marker sits at the harbour depot near spawn until accepted
    return { x: 24, z: 96 };
  }

  start(playerPos) {
    const def = this.currentOffer();
    const a = {
      def,
      stage: 0,
      timeLeft: def.timeLimit,
      target: null,
      checkpoints: [],
      stolenCar: null,
    };
    if (def.id === 'delivery') {
      a.target = farPoint(this.rng, playerPos, 130);
    } else if (def.id === 'ring') {
      const corners = [
        nearestIntersection(-150, -150), nearestIntersection(140, -150),
        nearestIntersection(140, 140), nearestIntersection(-150, 140),
      ];
      a.checkpoints = corners;
      a.target = corners[0];
    } else if (def.id === 'recovery') {
      a.target = farPoint(this.rng, playerPos, 120);
      a.stage = 0; // 0 reach the car, 1 drive it back to depot
    }
    this.active = a;
    this._showBeacon(a.target);
    return a;
  }

  _showBeacon(point) {
    if (!point) { this.beacon.visible = false; this.ring.visible = false; return; }
    this.beacon.position.x = point.x;
    this.beacon.position.z = point.z;
    this.beacon.visible = true;
    this.ring.position.x = point.x;
    this.ring.position.z = point.z;
    this.ring.visible = true;
  }

  hideBeacon() {
    this.beacon.visible = false;
    this.ring.visible = false;
  }

  // Called when the recovery mission's stolen car has been placed by main.
  attachStolenCar(car) {
    if (this.active && this.active.def.id === 'recovery') this.active.stolenCar = car;
  }

  // Per-frame update. events: {playerPos, inStolenCar, playerInAnyCar}
  // Returns a result object when something notable happens.
  update(dt, events) {
    const a = this.active;
    if (!a) return null;
    a.timeLeft -= dt;
    this.beacon.rotation.y += dt * 0.7;
    if (a.timeLeft <= 0) {
      this.active = null;
      this.hideBeacon();
      return { type: 'failed', def: a.def };
    }
    const d = a.target ? distance2d(events.playerPos.x, events.playerPos.z, a.target.x, a.target.z) : 999;
    if (a.def.id === 'delivery') {
      if (d < 5) return this._complete();
    } else if (a.def.id === 'ring') {
      if (d < 8) {
        a.stage++;
        if (a.stage >= a.checkpoints.length) return this._complete();
        a.target = a.checkpoints[a.stage];
        this._showBeacon(a.target);
        return { type: 'checkpoint', def: a.def, stage: a.stage, total: a.checkpoints.length };
      }
    } else if (a.def.id === 'recovery') {
      if (a.stage === 0 && d < 4.5) {
        a.stage = 1;
        a.target = this.offerPoint(events.playerPos); // back to the depot
        this._showBeacon(a.target);
        return { type: 'stage', def: a.def, message: 'Got it! Bring the car back to the depot marker.' };
      }
      if (a.stage === 1 && d < 6 && events.inStolenCar) {
        return this._complete();
      }
    }
    return null;
  }

  _complete() {
    const a = this.active;
    this.active = null;
    this.completed++;
    this.offerIndex++;
    this.hideBeacon();
    return { type: 'complete', def: a.def, pay: a.def.pay };
  }

  failActive() {
    if (!this.active) return;
    this.active = null;
    this.hideBeacon();
  }

  objectiveText() {
    const a = this.active;
    if (!a) {
      const offer = this.currentOffer();
      return { title: 'Next job: ' + offer.title, detail: 'Reach the gold marker to accept — ' + offer.giver, time: null };
    }
    let detail = a.def.brief;
    if (a.def.id === 'ring') detail = `Checkpoint ${a.stage + 1} of ${a.checkpoints.length} — follow the gold marker.`;
    if (a.def.id === 'recovery' && a.stage === 1) detail = 'Drive the recovered car back to the depot marker.';
    return { title: a.def.title, detail, time: formatClock(a.timeLeft) };
  }

  markerPoint(playerPos) {
    if (this.active && this.active.target) return this.active.target;
    if (!this.active) return this.offerPoint(playerPos);
    return null;
  }
}
