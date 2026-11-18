// Neon Harbor — pedestrians: simple articulated-look figures (body, head,
// swinging arms/legs as boxes) that stroll along sidewalks, panic and flee
// from danger, drop a money bag when punched, and respawn at the city edge.

import { CITY } from './config.js';
import { clamp, distance2d } from './random.js';
import { roadCentres, collideCircle, pointInBuilding } from './city.js';

const SHIRT_COLORS = [0xe74c3c, 0xf1c40f, 0x2ecc71, 0x3498db, 0xfd79a8, 0xe67e22, 0xecf0f1, 0x9b59b6];
const SKIN_COLORS = [0xf2c89b, 0xc68863, 0x8d5524, 0xffdbac];
const MAX_PEDS = 26;

export function buildPedMesh(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)] });
  const skin = new THREE.MeshLambertMaterial({ color: SKIN_COLORS[Math.floor(rng() * SKIN_COLORS.length)] });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.06;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.4), skin);
  head.position.y = 1.66;
  g.add(head);
  const legGeo = new THREE.BoxGeometry(0.2, 0.68, 0.22);
  const legL = new THREE.Mesh(legGeo, pants); legL.position.set(-0.16, 0.36, 0); g.add(legL);
  const legR = new THREE.Mesh(legGeo, pants); legR.position.set(0.16, 0.36, 0); g.add(legR);
  const armGeo = new THREE.BoxGeometry(0.15, 0.6, 0.17);
  const armL = new THREE.Mesh(armGeo, shirt); armL.position.set(-0.4, 1.1, 0); g.add(armL);
  const armR = new THREE.Mesh(armGeo, shirt); armR.position.set(0.4, 1.1, 0); g.add(armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

export class Pedestrian {
  constructor(scene, rng, colliders) {
    this.mesh = buildPedMesh(rng);
    this.rng = rng;
    this.colliders = colliders;
    this.pos = new THREE.Vector3();
    this.heading = rng() * Math.PI * 2;
    this.speed = 1.6 + rng() * 1.1;
    this.state = 'walk';        // walk | flee | down
    this.stateTime = 0;
    this.walkPhase = rng() * 6;
    this.target = null;
    this.health = 2;            // two punches and they drop their bag and run
    this.respawn(scene);
    scene.add(this.mesh);
  }

  respawn() {
    // appear on a sidewalk somewhere not inside a building
    for (let tries = 0; tries < 24; tries++) {
      const lines = roadCentres();
      const line = lines[Math.floor(this.rng() * lines.length)];
      const along = (this.rng() * 2 - 1) * (CITY.halfSize - 24);
      const vertical = this.rng() < 0.5;
      const side = this.rng() < 0.5 ? -1 : 1;
      const off = (CITY.roadWidth / 2 + 2.2) * side;
      const x = vertical ? line + off : along;
      const z = vertical ? along : line + off;
      if (x > CITY.seaX - CITY.beachWidth) continue;
      if (pointInBuilding(x, z, this.colliders, 1)) continue;
      this.pos.set(x, 0, z);
      break;
    }
    this.state = 'walk';
    this.health = 2;
    this.pickTarget();
    this.mesh.visible = true;
  }

  pickTarget() {
    // stroll target: another sidewalk point a block or two away
    const lines = roadCentres();
    const line = lines[Math.floor(this.rng() * lines.length)];
    const along = clamp(this.pos.z + (this.rng() * 2 - 1) * 90, -CITY.halfSize + 16, CITY.halfSize - 16);
    const side = this.rng() < 0.5 ? -1 : 1;
    this.target = { x: line + (CITY.roadWidth / 2 + 2.2) * side, z: along };
    if (this.rng() < 0.5) this.target = { x: along, z: line + (CITY.roadWidth / 2 + 2.2) * side };
  }

  scare(fromX, fromZ) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.stateTime = 2.6 + this.rng() * 1.6;
    const dx = this.pos.x - fromX;
    const dz = this.pos.z - fromZ;
    this.heading = Math.atan2(dx, dz);
  }

  update(dt) {
    this.stateTime -= dt;
    this.walkPhase += dt * (this.state === 'flee' ? 13 : 7) * (this.speed / 2);
    let vx = 0;
    let vz = 0;
    if (this.state === 'flee') {
      vx = Math.sin(this.heading) * 5.4;
      vz = Math.cos(this.heading) * 5.4;
      if (this.stateTime <= 0) { this.state = 'walk'; this.pickTarget(); }
    } else if (this.state === 'walk' && this.target) {
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.6) this.pickTarget();
      else {
        this.heading = Math.atan2(dx, dz);
        vx = (dx / d) * this.speed;
        vz = (dz / d) * this.speed;
      }
    }
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;
    const resolved = collideCircle({ x: this.pos.x, z: this.pos.z }, 0.45, this.colliders);
    this.pos.x = resolved.x;
    this.pos.z = resolved.z;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    // swing limbs while moving
    const swing = Math.sin(this.walkPhase) * 0.5;
    const u = this.mesh.userData;
    if (this.state === 'down') {
      this.mesh.rotation.z = Math.PI / 2;
      this.mesh.position.y = 0.3;
    } else {
      this.mesh.rotation.z = 0;
      this.mesh.position.y = 0;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.8;
      u.armR.rotation.x = swing * 0.8;
    }
    // far from the action and downed peds recycle to keep streets populated
    if (this.state === 'down' && this.stateTime <= 0) this.respawn();
  }
}

export class PedestrianSystem {
  constructor(scene, rng, colliders) {
    this.peds = [];
    for (let i = 0; i < MAX_PEDS; i++) this.peds.push(new Pedestrian(scene, rng, colliders));
    // money bags dropped by punched peds
    this.bags = [];
    this.scene = scene;
    this.bagGeo = new THREE.BoxGeometry(0.5, 0.34, 0.36);
    this.bagMat = new THREE.MeshBasicMaterial({ color: 0x53d769 });
  }

  dropBag(x, z) {
    const mesh = new THREE.Mesh(this.bagGeo, this.bagMat);
    mesh.position.set(x, 0.35, z);
    this.scene.add(mesh);
    this.bags.push({ mesh, x, z, spin: Math.random() * 6 });
  }

  update(dt, playerPos, onPickup) {
    for (const ped of this.peds) ped.update(dt);
    for (let i = this.bags.length - 1; i >= 0; i--) {
      const bag = this.bags[i];
      bag.spin += dt * 3;
      bag.mesh.rotation.y = bag.spin;
      bag.mesh.position.y = 0.35 + Math.sin(bag.spin * 2) * 0.07;
      if (playerPos && distance2d(playerPos.x, playerPos.z, bag.x, bag.z) < 1.6) {
        this.scene.remove(bag.mesh);
        this.bags.splice(i, 1);
        if (onPickup) onPickup();
      }
    }
  }

  nearestWithin(x, z, range) {
    let best = null;
    let bestD = range;
    for (const ped of this.peds) {
      if (ped.state === 'down') continue;
      const d = distance2d(x, z, ped.pos.x, ped.pos.z);
      if (d < bestD) { bestD = d; best = ped; }
    }
    return best;
  }

  scareArea(x, z, radius) {
    for (const ped of this.peds) {
      if (distance2d(x, z, ped.pos.x, ped.pos.z) < radius) ped.scare(x, z);
    }
  }
}
