// Neon Harbor — wanted system and police pursuit director.
// Crimes raise the star level (1-5). The director keeps roughly `stars + 1`
// patrol cars in play (capped), spawns them on roads near — but not on top
// of — the player, and has them chase, ram and box in the target. If the
// player breaks line of sight, a hidden timer decays the stars. A slow or
// stopped player with a police car alongside fills the bust meter; full
// meter = CAUGHT.

import { POLICE, CITY } from './config.js';
import { clamp, distance2d } from './random.js';
import { roadCentres, nearestIntersection } from './city.js';
import { Car, chaseDrive } from './vehicles.js';

export class PoliceSystem {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.stars = 0;
    this.units = [];
    this.hiddenTime = 0;     // seconds since any unit last saw the player
    this.decayClock = 0;
    this.bustMeter = 0;      // 0..1
    this.peakStars = 0;
    this.spawnClock = 0;
    this.enabled = true;
  }

  get wanted() { return this.stars > 0; }

  reportCrime(points, witnessPos) {
    if (!this.enabled) return;
    const before = this.stars;
    this.stars = clamp(this.stars + points, 0, 5);
    if (this.stars > before) {
      this.hiddenTime = 0;
      this.decayClock = 0;
    }
    this.peakStars = Math.max(this.peakStars, this.stars);
  }

  clearWanted() {
    this.stars = 0;
    this.bustMeter = 0;
    this.hiddenTime = 0;
    for (const u of this.units) this.scene.remove(u.mesh);
    this.units = [];
  }

  desiredUnits() {
    if (this.stars <= 0) return 0;
    return Math.min(POLICE.maxUnits, this.stars + 1);
  }

  spawnUnit(playerPos) {
    // spawn at an intersection 55-85 m away, on a road, out of immediate sight
    const spot = nearestIntersection(
      playerPos.x + (Math.random() - 0.5) * 150,
      playerPos.z + (Math.random() - 0.5) * 150
    );
    spot.x = clamp(spot.x, -CITY.halfSize + 10, CITY.seaX - 30);
    spot.z = clamp(spot.z, -CITY.halfSize + 10, CITY.halfSize - 10);
    if (distance2d(spot.x, spot.z, playerPos.x, playerPos.z) < 34) spot.x -= 60;
    const car = new Car(this.scene, { x: spot.x, z: spot.z, heading: Math.random() * 6.28, isPolice: true, color: 0xffffff });
    this.units.push(car);
    return car;
  }

  // Returns 'busted' when the bust meter fills, otherwise null.
  update(dt, player, timeNow) {
    if (this.stars <= 0) {
      // lingering units drive off and despawn
      for (let i = this.units.length - 1; i >= 0; i--) {
        const u = this.units[i];
        u.pos.x += u.forwardX() * 8 * dt;
        u.pos.z += u.forwardZ() * 8 * dt;
        u.syncMesh();
        if (Math.abs(u.pos.x) > CITY.halfSize + 40 || Math.abs(u.pos.z) > CITY.halfSize + 40) {
          this.scene.remove(u.mesh);
          this.units.splice(i, 1);
        }
      }
      this.bustMeter = 0;
      return null;
    }

    this.spawnClock -= dt;
    if (this.units.length < this.desiredUnits() && this.spawnClock <= 0) {
      this.spawnUnit(player.pos);
      this.spawnClock = 1.6;
    }
    // trim excess units far away when stars drop
    while (this.units.length > this.desiredUnits() + 1) {
      let farIdx = 0;
      let farD = -1;
      this.units.forEach((u, i) => {
        const d = distance2d(u.pos.x, u.pos.z, player.pos.x, player.pos.z);
        if (d > farD) { farD = d; farIdx = i; }
      });
      this.scene.remove(this.units[farIdx].mesh);
      this.units.splice(farIdx, 1);
    }

    let anySees = false;
    let nearestDist = 999;
    const playerSpeed = Math.abs(player.speedNow || 0);
    const playerStill = player.mode === 'foot' || playerSpeed < 3.2;

    this.units.forEach((unit, idx) => {
      // pursuit target: player position, wing units aim at flanking offsets
      const flank = idx === 0 ? { x: 0, z: 0 } : {
        x: Math.cos(idx * 2.4) * 7,
        z: Math.sin(idx * 2.4) * 7,
      };
      const target = { x: player.pos.x + flank.x, z: player.pos.z + flank.z };
      const dist = chaseDrive(unit, target, dt, this.colliders, this.stars);
      unit.flashBar(timeNow);
      nearestDist = Math.min(nearestDist, dist);
      if (dist < 46) anySees = true;
      // police cars shove each other apart gently so they can box in
      for (const other of this.units) {
        if (other === unit) continue;
        const d = distance2d(unit.pos.x, unit.pos.z, other.pos.x, other.pos.z);
        if (d > 0.01 && d < 3.4) {
          unit.pos.x += (unit.pos.x - other.pos.x) / d * (3.4 - d) * 0.4;
          unit.pos.z += (unit.pos.z - other.pos.z) / d * (3.4 - d) * 0.4;
        }
      }
    });

    // line of sight bookkeeping for star decay
    if (anySees) {
      this.hiddenTime = 0;
      this.decayClock = 0;
    } else {
      this.hiddenTime += dt;
      if (this.hiddenTime > POLICE.loseSightTime) {
        this.decayClock += dt;
        if (this.decayClock >= POLICE.starDecayStep) {
          this.decayClock = 0;
          this.stars = Math.max(0, this.stars - 1);
          if (this.stars === 0) this.bustMeter = 0;
        }
      }
    }

    // bust meter: a unit alongside a slow/stopped player
    if (nearestDist < POLICE.bustRange && playerStill) {
      this.bustMeter += dt / POLICE.bustFillTime;
    } else {
      this.bustMeter = Math.max(0, this.bustMeter - dt * 0.7);
    }
    if (this.bustMeter >= 1) {
      this.bustMeter = 0;
      return 'busted';
    }
    return null;
  }

  nearestDistance(playerPos) {
    let best = 999;
    for (const u of this.units) best = Math.min(best, distance2d(u.pos.x, u.pos.z, playerPos.x, playerPos.z));
    return best;
  }
}
