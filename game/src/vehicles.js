// Neon Harbor — car models, arcade driving physics and traffic AI.
// Cars are small box-built models (body, cabin, wheels, lights). Traffic
// follows the avenue grid, picks a lane offset, turns at intersections and
// brakes for the car ahead. The player's car uses bicycle-ish arcade physics:
// throttle / brake / reverse, speed-sensitive steering and a handbrake that
// bleeds grip so the rear steps out (drift).

import { CITY, CAR } from './config.js';
import { clamp, angleLerp, distance2d } from './random.js';
import { collideCircle, roadCentres } from './city.js';

const CAR_COLORS = [0xd64541, 0x3e7cb1, 0xf2b134, 0x7bc47f, 0xe8e8ec, 0x8855bb, 0x22262b, 0xff7f50, 0x4dd0e1];

export function buildCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0xf2f3f5 : color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c1f24 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd4e8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.3), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.5, 2.1), glassMat);
  cabin.position.set(0, 1.05, -0.15);
  g.add(cabin);
  const hoodStripe = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.18, 4.32), darkMat);
  hoodStripe.position.y = 0.3;
  g.add(hoodStripe);

  if (isPolice) {
    const doors = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.4, 1.7), darkMat);
    doors.position.set(0, 0.62, 0.1);
    g.add(doors);
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.4), darkMat);
    barBase.position.set(0, 1.36, -0.15);
    g.add(barBase);
    const redLight = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.36),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    redLight.position.set(-0.34, 1.5, -0.15);
    g.add(redLight);
    const blueLight = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.36),
      new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
    blueLight.position.set(0.34, 1.5, -0.15);
    g.add(blueLight);
    g.userData.barRed = redLight;
    g.userData.barBlue = blueLight;
  }

  // headlights (emissive boxes + two spotlights toggled at night)
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), headMat);
    hl.position.set(s * 0.62, 0.62, -2.16);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xd8242e }));
    tl.position.set(s * 0.62, 0.66, 2.16);
    g.add(tl);
    if (s === 1) g.userData.tailMat = tl.material;
  }
  const beam = new THREE.SpotLight(0xffeeb8, 0, 42, 0.5, 0.55, 1.2);
  beam.position.set(0, 0.8, -2);
  beam.target.position.set(0, 0, -20);
  g.add(beam);
  g.add(beam.target);
  g.userData.beam = beam;

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, -1.45], [0.95, -1.45], [-0.95, 1.45], [0.95, 1.45]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(wx, 0.36, wz);
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}

let nextCarId = 1;

export class Car {
  constructor(scene, opts) {
    this.id = nextCarId++;
    this.isPolice = !!opts.isPolice;
    this.color = opts.color;
    this.mesh = buildCarMesh(opts.color, this.isPolice);
    this.pos = new THREE.Vector3(opts.x, 0, opts.z);
    this.heading = opts.heading || 0;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.occupied = false;       // player inside
    this.stolen = false;
    this.traffic = null;         // AI state when not driven
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    scene.add(this.mesh);
    this._sparkTimer = 0;
  }

  forwardX() { return -Math.sin(this.heading); }
  forwardZ() { return -Math.cos(this.heading); }

  syncMesh() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    const spin = this.speed * 0.09;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    if (this.mesh.userData.beam) {
      // beam intensity set externally by day/night in main loop
    }
  }

  setBeam(on) {
    if (this.mesh.userData.beam) this.mesh.userData.beam.intensity = on ? 1.5 : 0;
  }

  flashBar(t) {
    if (!this.isPolice) return;
    const phase = Math.floor(t * 5) % 2 === 0;
    this.mesh.userData.barRed.material.color.setHex(phase ? 0xff2a2a : 0x661111);
    this.mesh.userData.barBlue.material.color.setHex(phase ? 0x112a66 : 0x2a6bff);
  }
}

// Arcade driving update for the player-driven car.
// input: {throttle -1..1, steer -1..1, handbrake}
// Returns impact speed if a collision happened this frame, else 0.
export function driveCar(car, input, dt, colliders) {
  const accelInput = input.throttle;
  if (accelInput > 0) {
    car.speed += CAR.accel * accelInput * dt * (1 - Math.max(0, car.speed) / (CAR.maxForward * 1.25));
  } else if (accelInput < 0) {
    if (car.speed > 0.6) car.speed -= CAR.brake * dt;                    // braking
    else car.speed -= CAR.accel * 0.55 * dt * (1 - Math.max(0, -car.speed) / (CAR.maxReverse * 1.3)); // reverse
  }
  car.speed -= car.speed * CAR.drag * dt * (input.handbrake ? 1.6 : 1);
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxForward);
  if (Math.abs(car.speed) < 0.04 && accelInput === 0) car.speed = 0;

  const speedRatio = clamp(Math.abs(car.speed) / 14, 0, 1);
  const steerTarget = input.steer * CAR.turnRate * speedRatio;
  car.steer = lerpNum(car.steer, steerTarget, 1 - Math.pow(0.0001, dt));
  const grip = input.handbrake ? 0.45 : 1;
  car.heading -= car.steer * dt * Math.sign(car.speed || 1) * grip * (input.handbrake ? 1.5 : 1);

  const beforeX = car.pos.x;
  const beforeZ = car.pos.z;
  car.pos.x += car.forwardX() * car.speed * dt;
  car.pos.z += car.forwardZ() * car.speed * dt;
  // drift: with handbrake, keep some of the old velocity direction
  const resolved = collideCircle({ x: car.pos.x, z: car.pos.z }, 1.55, colliders);
  let impact = 0;
  if (Math.abs(resolved.x - car.pos.x) > 0.001 || Math.abs(resolved.z - car.pos.z) > 0.001) {
    impact = Math.abs(car.speed);
    car.speed *= 0.25;
  }
  car.pos.x = resolved.x;
  car.pos.z = resolved.z;
  if (Math.abs(car.pos.x - beforeX) + Math.abs(car.pos.z - beforeZ) < 0.001 && Math.abs(car.speed) > 6) {
    impact = Math.abs(car.speed);
    car.speed = 0;
  }
  car.syncMesh();
  return impact;
}

function lerpNum(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }

// ---------------- traffic AI ----------------

export class TrafficSystem {
  constructor(scene, rng, colliders) {
    this.cars = [];
    this.colliders = colliders;
    this.rng = rng;
    const lines = roadCentres();
    for (let i = 0; i < CAR.trafficCount; i++) {
      // spawn on a random avenue, driving along it
      const vertical = rng() < 0.5;
      const line = lines[Math.floor(rng() * lines.length)];
      const along = (rng() * 2 - 1) * (CITY.halfSize - 30);
      const dir = rng() < 0.5 ? 1 : -1;
      const lane = 3.4 * dir;
      const x = vertical ? line + lane : along;
      const z = vertical ? along : line + (vertical ? 0 : lane);
      const heading = vertical ? (dir > 0 ? Math.PI : 0) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      const car = new Car(scene, { x, z, heading, color: CAR_COLORS[i % CAR_COLORS.length] });
      car.traffic = { vertical, dir, line, speed: CAR.trafficSpeed * (0.75 + rng() * 0.4), turnCooldown: 0 };
      this.cars.push(car);
    }
  }

  update(dt, obstacles) {
    const lines = roadCentres();
    for (const car of this.cars) {
      if (car.occupied) continue;
      const ai = car.traffic;
      if (!ai) continue;
      ai.turnCooldown -= dt;
      // desired speed: slow for the obstacle ahead
      let target = ai.speed;
      const fx = car.forwardX();
      const fz = car.forwardZ();
      for (const o of obstacles) {
        if (o === car) continue;
        const dx = o.pos.x - car.pos.x;
        const dz = o.pos.z - car.pos.z;
        const ahead = dx * fx + dz * fz;
        const side = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && ahead < 11 && side < 2.6) { target = Math.min(target, ahead < 5 ? 0 : ai.speed * 0.4); }
      }
      car.speed = lerpNum(car.speed, target, 1 - Math.pow(0.01, dt));
      car.pos.x += fx * car.speed * dt;
      car.pos.z += fz * car.speed * dt;

      // at an intersection, sometimes turn onto the crossing road
      const nearLine = lines.find((c) => Math.abs((ai.vertical ? car.pos.z : car.pos.x) - c) < 1.6);
      if (nearLine !== undefined && ai.turnCooldown <= 0 && this.rng() < 0.4) {
        ai.turnCooldown = 4;
        const turnDir = this.rng() < 0.5 ? 1 : -1;
        ai.vertical = !ai.vertical;
        ai.dir = turnDir;
        ai.line = nearLine;
        if (ai.vertical) car.pos.x = nearLine + 3.4 * turnDir;
        else car.pos.z = nearLine + 3.4 * turnDir;
        car.heading = ai.vertical ? (turnDir > 0 ? Math.PI : 0) : (turnDir > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
      // wrap around the world edge instead of leaving
      if (Math.abs(car.pos.x) > CITY.halfSize + 24 || Math.abs(car.pos.z) > CITY.halfSize + 24) {
        const line = lines[Math.floor(this.rng() * lines.length)];
        ai.line = line;
        if (ai.vertical) { car.pos.x = line + 3.4 * ai.dir; car.pos.z = -Math.sign(car.pos.z) * (CITY.halfSize - 10); }
        else { car.pos.z = line + 3.4 * ai.dir; car.pos.x = -Math.sign(car.pos.x) * (CITY.halfSize - 10); }
      }
      const resolved = collideCircle({ x: car.pos.x, z: car.pos.z }, 1.5, this.colliders);
      car.pos.x = resolved.x;
      car.pos.z = resolved.z;
      car.syncMesh();
    }
  }
}

// Police driving: steer toward a target point, full throttle, ram-friendly.
export function chaseDrive(car, targetPos, dt, colliders, aggression) {
  const dx = targetPos.x - car.pos.x;
  const dz = targetPos.z - car.pos.z;
  const dist = Math.hypot(dx, dz);
  const wantHeading = Math.atan2(-dx, -dz);
  let diff = wantHeading - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.heading += clamp(diff, -2.4 * dt, 2.4 * dt);
  const topSpeed = 30 + (aggression || 0) * 1.6;
  const targetSpeed = dist > 16 ? topSpeed : Math.max(9, dist * 1.1);
  car.speed = lerpNum(car.speed, targetSpeed, 1 - Math.pow(0.02, dt));
  car.pos.x += car.forwardX() * car.speed * dt;
  car.pos.z += car.forwardZ() * car.speed * dt;
  const resolved = collideCircle({ x: car.pos.x, z: car.pos.z }, 1.55, colliders);
  if (Math.abs(resolved.x - car.pos.x) > 0.01 || Math.abs(resolved.z - car.pos.z) > 0.01) car.speed *= 0.4;
  car.pos.x = resolved.x;
  car.pos.z = resolved.z;
  car.syncMesh();
  return dist;
}

export function carDistance(a, b) {
  return distance2d(a.pos.x, a.pos.z, b.pos.x, b.pos.z);
}
