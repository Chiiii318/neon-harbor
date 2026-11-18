// Neon Harbor — the player character (dock kid turned courier, "Marina Vale")
// and the on-foot / driving state machine. On foot: camera-relative WASD
// movement with mouse-drag yaw and a short punch. In a car: delegates to the
// arcade driving physics in vehicles.js.

import { PLAYER, CITY } from './config.js';
import { clamp } from './random.js';
import { collideCircle } from './city.js';
import { driveCar } from './vehicles.js';

export function buildPlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xff5a3c });
  const skin = new THREE.MeshLambertMaterial({ color: 0xf2c89b });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x27364f });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.76, 0.36), jacket);
  torso.position.y = 1.08;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.42), skin);
  head.position.y = 1.7;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.48),
    new THREE.MeshLambertMaterial({ color: 0x14304d }));
  cap.position.y = 1.95;
  g.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x14304d }));
  brim.position.set(0, 1.9, -0.36);
  g.add(brim);
  const legGeo = new THREE.BoxGeometry(0.21, 0.7, 0.23);
  const legL = new THREE.Mesh(legGeo, jeans); legL.position.set(-0.17, 0.37, 0); g.add(legL);
  const legR = new THREE.Mesh(legGeo, jeans); legR.position.set(0.17, 0.37, 0); g.add(legR);
  const armGeo = new THREE.BoxGeometry(0.16, 0.62, 0.18);
  const armL = new THREE.Mesh(armGeo, jacket); armL.position.set(-0.42, 1.12, 0); g.add(armL);
  const armR = new THREE.Mesh(armGeo, jacket); armR.position.set(0.42, 1.12, 0); g.add(armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

export class Player {
  constructor(scene, startPos) {
    this.mesh = buildPlayerMesh();
    this.pos = new THREE.Vector3(startPos.x, 0, startPos.z);
    this.heading = Math.PI; // facing the sea avenue
    this.health = PLAYER.maxHealth;
    this.mode = 'foot';     // foot | driving
    this.car = null;
    this.walkPhase = 0;
    this.punchTimer = 0;
    this.punchAnim = 0;
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  get speedNow() {
    return this.mode === 'driving' && this.car ? this.car.speed : 0;
  }

  enterCar(car) {
    this.mode = 'driving';
    this.car = car;
    car.occupied = true;
    this.mesh.visible = false;
  }

  exitCar() {
    if (!this.car) return null;
    const car = this.car;
    car.occupied = false;
    // step out on the left side of the car
    const sideX = Math.cos(car.heading);
    const sideZ = -Math.sin(car.heading);
    this.pos.set(car.pos.x + sideX * 2.1, 0, car.pos.z + sideZ * 2.1);
    this.mode = 'foot';
    this.car = null;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
    return car;
  }

  updateOnFoot(dt, input, camYaw, colliders) {
    const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    // camera-relative movement: forward on screen is -moveZ input
    const fwdX = -sin;
    const fwdZ = -cos;
    const rightX = cos;
    const rightZ = -sin;
    let mx = fwdX * (-input.moveZ) + rightX * input.moveX;
    let mz = fwdZ * (-input.moveZ) + rightZ * input.moveX;
    const len = Math.hypot(mx, mz);
    if (len > 0.05) {
      mx /= Math.max(1, len);
      mz /= Math.max(1, len);
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
      this.heading = Math.atan2(mx, mz);
      this.walkPhase += dt * (input.run ? 12 : 8.5);
    } else {
      this.walkPhase = 0;
    }
    const resolved = collideCircle({ x: this.pos.x, z: this.pos.z }, PLAYER.radius, colliders);
    this.pos.x = resolved.x;
    this.pos.z = resolved.z;
    if (this.pos.x > CITY.seaX - 2) this.pos.x = CITY.seaX - 2; // wading limit
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    // limb swing + punch animation
    const swing = Math.sin(this.walkPhase) * (len > 0.05 ? 0.55 : 0);
    const u = this.mesh.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.8;
    this.punchTimer -= dt;
    if (this.punchAnim > 0) {
      this.punchAnim -= dt * 5;
      u.armR.rotation.x = -Math.sin(Math.max(0, this.punchAnim) * Math.PI) * 1.7;
    } else {
      u.armR.rotation.x = swing * 0.8;
    }
    this.health = clamp(this.health + dt * 1.2, 0, PLAYER.maxHealth); // slow regen out of trouble
  }

  tryPunch() {
    if (this.punchTimer > 0 || this.mode !== 'foot') return false;
    this.punchTimer = PLAYER.punchCooldown;
    this.punchAnim = 1;
    return true;
  }

  punchPoint() {
    return {
      x: this.pos.x + Math.sin(this.heading) * PLAYER.punchRange * 0.7,
      z: this.pos.z + Math.cos(this.heading) * PLAYER.punchRange * 0.7,
    };
  }

  updateDriving(dt, input, colliders) {
    if (!this.car) return 0;
    const throttle = -input.moveZ; // W = -1 in moveZ terms = forward
    const steer = input.moveX;
    const impact = driveCar(this.car, { throttle, steer, handbrake: input.brake }, dt, colliders);
    this.pos.copy(this.car.pos);
    return impact;
  }
}
