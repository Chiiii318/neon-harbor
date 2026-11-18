// Neon Harbor — entry point: builds the world, wires every system together
// and runs the main loop (day/night cycle, third-person camera, crime
// detection, bust flow, autosave).
//
// Story: Marina Vale, a dock kid from the Neon Harbor marina, owes the
// harbour dispatcher Big Sal for the loan on her runabout. She takes his
// driving jobs, dodges the Harbour Patrol, and works the debt off one
// gold marker at a time.

import { CITY, COLORS, DAY } from './config.js';
import { createRng, clamp, lerp, distance2d } from './random.js';
import { buildCity } from './city.js';
import { Car, TrafficSystem } from './vehicles.js';
import { PedestrianSystem } from './pedestrians.js';
import { Player } from './player.js';
import { PoliceSystem } from './police.js';
import { MissionRunner } from './missions.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { SoundEngine } from './audio.js';
import { loadSave, writeSave, clearSave, freshState } from './save.js';
import { readShotRequest, applyShotScene } from './shots.js';

const shotRequest = readShotRequest();
const seed = shotRequest ? shotRequest.seed : 7;
const rng = createRng(seed * 1000 + 42);

// ---------- renderer / scene ----------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.skyDusk);
scene.fog = new THREE.Fog(COLORS.fogDay, 120, 420);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 6, 14);

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x54503c, 0.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe3b3, 1.05);
sun.position.set(80, 120, 40);
scene.add(sun);
const amb = new THREE.AmbientLight(0x404860, 0.35);
scene.add(amb);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- world ----------
const city = buildCity(scene, seed);
const traffic = new TrafficSystem(scene, rng, city.colliders);
const peds = new PedestrianSystem(scene, rng, city.colliders);
const player = new Player(scene, { x: 16, z: 88 });
const police = new PoliceSystem(scene, city.colliders);
const missions = new MissionRunner(scene, rng);
const hud = new Hud();
const input = new Input(canvas);
const sound = new SoundEngine();

// player's own starter car, parked by the depot
const playerCar = new Car(scene, { x: 9, z: 82, heading: Math.PI / 2, color: 0xff8c42 });
let lastDrivenCar = playerCar;
let stolenCar = null;

// ---------- game state ----------
const state = {
  running: false,
  paused: false,
  frozen: false,           // screenshot scenes freeze gameplay updates
  caught: false,
  cash: 240,
  dayPhase: DAY.startPhase,
  camYaw: Math.PI,
  camMode: 'follow',       // follow | shot
  shotCam: null,
  crimeCooldown: 0,
  punchCrimeCooldown: 0,
  saveClock: 0,
  elapsed: 0,
  startedWithSave: false,
};

// ---------- tiny spark particle pool for crashes ----------
const sparkPool = [];
{
  const geo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffc44d });
  for (let i = 0; i < 28; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    scene.add(m);
    sparkPool.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0 });
  }
}
function burstSparks(x, y, z, count) {
  let made = 0;
  for (const s of sparkPool) {
    if (s.life > 0) continue;
    s.life = 0.4 + Math.random() * 0.3;
    s.mesh.visible = true;
    s.mesh.position.set(x, y, z);
    s.vx = (Math.random() - 0.5) * 9;
    s.vy = Math.random() * 6 + 2;
    s.vz = (Math.random() - 0.5) * 9;
    if (++made >= count) break;
  }
}
function updateSparks(dt) {
  for (const s of sparkPool) {
    if (s.life <= 0) continue;
    s.life -= dt;
    if (s.life <= 0) { s.mesh.visible = false; continue; }
    s.vy -= 18 * dt;
    s.mesh.position.x += s.vx * dt;
    s.mesh.position.y += s.vy * dt;
    s.mesh.position.z += s.vz * dt;
    if (s.mesh.position.y < 0.05) s.mesh.position.y = 0.05;
  }
}

// ---------- day / night ----------
const skyDay = new THREE.Color(COLORS.skyDay);
const skyDusk = new THREE.Color(COLORS.skyDusk);
const skyNight = new THREE.Color(COLORS.skyNight);
const fogDay = new THREE.Color(COLORS.fogDay);
const fogNight = new THREE.Color(COLORS.fogNight);
const tmpColor = new THREE.Color();

function applyDayNight() {
  const p = state.dayPhase % 1;
  const sunElev = Math.sin(p * Math.PI * 2); // 0 sunrise, .25 noon, .5 sunset, .75 midnight
  const daylight = clamp(sunElev * 1.7 + 0.22, 0, 1);
  const duskness = clamp(1 - Math.abs(sunElev) * 2.4, 0, 1) * (sunElev > -0.35 ? 1 : 0);
  tmpColor.copy(skyNight).lerp(skyDay, daylight).lerp(skyDusk, duskness * 0.65);
  scene.background.copy(tmpColor);
  scene.fog.color.copy(fogNight).lerp(fogDay, daylight);
  sun.intensity = 0.08 + daylight * 1.0;
  sun.color.setHex(0xffe3b3).lerp(new THREE.Color(0xff8c4a), duskness);
  const ang = p * Math.PI * 2;
  sun.position.set(Math.cos(ang) * 160, Math.max(8, sunElev * 180), 70);
  hemi.intensity = 0.22 + daylight * 0.55;
  amb.intensity = 0.3 + (1 - daylight) * 0.12;
  const night = 1 - daylight;
  city.windowMat.opacity = clamp(night * 1.15 - 0.08, 0, 0.95);
  city.headMat.opacity = clamp(night * 1.2 - 0.1, 0, 1);
  // street point lights gather around the player at night
  city.nightLights.forEach((pl, i) => {
    pl.intensity = night > 0.45 ? 0.85 : 0;
    const lp = city.lampPositions[(Math.floor(player.pos.x / 38) + i * 3 + city.lampPositions.length) % city.lampPositions.length];
    if (lp) pl.position.set(lp.x, 6, lp.z);
  });
  const beamsOn = night > 0.4;
  for (const c of traffic.cars) c.setBeam(beamsOn);
  playerCar.setBeam(beamsOn);
  if (stolenCar) stolenCar.setBeam(beamsOn);
  for (const u of police.units) u.setBeam(beamsOn);
  return { daylight, night };
}

// ---------- crime + interaction helpers ----------
function nearestCarTo(pos, maxDist) {
  let best = null;
  let bestD = maxDist;
  const all = [playerCar, ...traffic.cars, ...police.units];
  if (stolenCar) all.push(stolenCar);
  for (const c of all) {
    const d = distance2d(pos.x, pos.z, c.pos.x, c.pos.z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function witnessCrime(points, pos) {
  // crimes only raise stars when a patrol unit or the victim can "report" it:
  // a unit within 55 m, or any crime in the busy centre counts double-checked
  const nearUnit = police.nearestDistance(pos) < 55;
  if (nearUnit || points >= 2) police.reportCrime(points, pos);
  else if (Math.random() < 0.5) police.reportCrime(points, pos);
}

function doPunch() {
  if (!player.tryPunch()) return;
  sound.playPunch();
  const pt = player.punchPoint();
  const ped = peds.nearestWithin(pt.x, pt.z, 1.9);
  if (ped) {
    ped.health -= 1;
    ped.scare(player.pos.x, player.pos.z);
    peds.scareArea(player.pos.x, player.pos.z, 7);
    if (ped.health <= 0) {
      ped.state = 'down';
      ped.stateTime = 5;
      peds.dropBag(ped.pos.x, ped.pos.z);
      hud.toast('They dropped a money bag — grab it!');
    }
    if (state.punchCrimeCooldown <= 0) {
      witnessCrime(1, player.pos);
      state.punchCrimeCooldown = 2.5;
    }
  }
}

function startMission() {
  const a = missions.start(player.pos);
  hud.toast('Job started: ' + a.def.title + ' — $' + a.def.pay + ' on delivery');
  if (a.def.id === 'recovery' && a.target) {
    stolenCar = new Car(scene, { x: a.target.x + 2, z: a.target.z + 1, heading: 0.7, color: 0x26c6da });
    missions.attachStolenCar(stolenCar);
  }
  sound.playCheckpoint();
}

function onMissionResult(res) {
  if (!res) return;
  if (res.type === 'complete') {
    state.cash += res.pay;
    missions.completedCount = missions.completed;
    sound.playMissionSuccess();
    hud.toast('Job done! +$' + res.pay + ' — ' + res.def.title);
    saveNow();
  } else if (res.type === 'failed') {
    sound.playMissionFail();
    hud.toast('Out of time — job failed: ' + res.def.title);
    if (stolenCar) { scene.remove(stolenCar.mesh); stolenCar = null; }
  } else if (res.type === 'checkpoint') {
    sound.playCheckpoint();
    hud.toast('Checkpoint ' + res.stage + ' / ' + res.total);
  } else if (res.type === 'stage') {
    sound.playCheckpoint();
    hud.toast(res.message);
  }
}

function saveNow() {
  writeSave({
    cash: state.cash,
    missionsDone: missions.completed,
    wantedPeak: police.peakStars,
    playerPos: { x: player.pos.x, z: player.pos.z },
    carPos: { x: playerCar.pos.x, z: playerCar.pos.z, heading: playerCar.heading },
  });
}

function showCaught(fine) {
  state.caught = true;
  state.running = false;
  sound.playBusted();
  document.getElementById('caught-fine').textContent = 'Fine paid: $' + fine + ' · Dropped at Harbour Patrol HQ';
  document.getElementById('caught-screen').classList.add('show');
}

function respawnAtStation() {
  police.clearWanted();
  player.health = 100;
  if (player.mode === 'driving') player.exitCar();
  player.pos.set(city.stationPos.x + 4, 0, city.stationPos.z - 16);
  player.mesh.position.copy(player.pos);
  state.caught = false;
  state.running = true;
  document.getElementById('caught-screen').classList.remove('show');
  saveNow();
}

// ---------- start / pause wiring ----------
const startScreen = document.getElementById('start-screen');
const continueBtn = document.getElementById('btn-continue');
const existingSave = loadSave();
if (existingSave && continueBtn) continueBtn.style.display = 'inline-block';

function beginGame(useSave) {
  sound.start();
  sound.resume();
  if (useSave && existingSave) {
    state.cash = existingSave.cash;
    missions.completed = existingSave.missionsDone || 0;
    missions.offerIndex = missions.completed % 3;
    if (existingSave.playerPos) {
      player.pos.set(existingSave.playerPos.x, 0, existingSave.playerPos.z);
      player.mesh.position.copy(player.pos);
    }
    if (existingSave.carPos) {
      playerCar.pos.set(existingSave.carPos.x, 0, existingSave.carPos.z);
      playerCar.heading = existingSave.carPos.heading || 0;
      playerCar.syncMesh();
    }
    state.startedWithSave = true;
  }
  startScreen.classList.add('hidden');
  state.running = true;
  hud.toast(state.startedWithSave ? 'Welcome back to Neon Harbor' : 'Welcome to Neon Harbor — follow the gold marker for work');
}

document.getElementById('btn-start').addEventListener('click', () => beginGame(false));
if (continueBtn) continueBtn.addEventListener('click', () => beginGame(true));
document.getElementById('btn-respawn').addEventListener('click', respawnAtStation);
document.getElementById('btn-resume').addEventListener('click', () => setPaused(false));

function setPaused(on) {
  if (!state.running && on) return;
  state.paused = on;
  document.getElementById('pause-screen').classList.toggle('show', on);
}

// handle for shots.js
const gameHandle = {
  player, police, missions, traffic, hud,
  setDayPhase: (p) => { state.dayPhase = p; },
  setCash: (v) => { state.cash = v; },
  setPaused,
  setFrozen: (v) => { state.frozen = v; },
  setCameraMode: (mode, cam) => { state.camMode = mode; state.shotCam = cam; },
};

if (shotRequest) {
  // Screenshot mode: skip the menu, arrange the composed scene.
  startScreen.classList.add('hidden');
  state.running = true;
  applyShotScene(shotRequest.name, gameHandle);
  window.__nhShotReady = shotRequest.name;
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let fpsGuard = 0;

function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  state.elapsed += dt;

  if (!shotRequest) state.dayPhase = (state.dayPhase + dt / DAY.cycleSeconds) % 1;
  const { night } = applyDayNight();

  if (state.running && !state.paused && !state.caught && !state.frozen) {
    input.poll();
    state.crimeCooldown -= dt;
    state.punchCrimeCooldown -= dt;

    // pause keys
    if (input.consume('Escape') || input.consume('KeyP')) setPaused(true);

    // ----- player -----
    let impact = 0;
    if (player.mode === 'foot') {
      state.camYaw -= input.takeLookDX() * 0.005;
      player.updateOnFoot(dt, input, state.camYaw, city.colliders);
      if (input.consume('KeyF')) doPunch();
      // accept mission at the depot marker
      const offer = missions.markerPoint(player.pos);
      const nearOffer = !missions.active && offer && distance2d(player.pos.x, player.pos.z, offer.x, offer.z) < 4.5;
      const nearCar = nearestCarTo(player.pos, 3.6);
      if (input.consume('KeyE')) {
        if (nearOffer) startMission();
        else if (nearCar) {
          const wasStolenTarget = stolenCar && nearCar === stolenCar;
          player.enterCar(nearCar);
          lastDrivenCar = nearCar;
          sound.playDoor();
          if (nearCar !== playerCar && !wasStolenTarget) {
            hud.toast('Borrowed a ride… the owner might complain');
            witnessCrime(1, player.pos);
            nearCar.stolen = true;
          }
          if (wasStolenTarget) hud.toast('Recovered the runabout — take it back to the depot');
        }
      }
      hud.setPrompt(nearOffer ? 'E — Accept job: ' + missions.currentOffer().title
        : nearCar ? 'E — Get in car' : '');
    } else {
      impact = player.updateDriving(dt, input, city.colliders);
      hud.setPrompt('');
      if (input.consume('KeyE')) {
        player.exitCar();
        sound.playDoor();
      }
      if (impact > 7) {
        sound.playCrash(impact);
        burstSparks(player.pos.x, 1, player.pos.z, 7);
        player.health -= impact * 0.55;
        peds.scareArea(player.pos.x, player.pos.z, 13);
        if (state.crimeCooldown <= 0) {
          witnessCrime(1, player.pos);
          state.crimeCooldown = 3;
        }
      }
    }

    // ----- traffic + car-on-car bumps -----
    const obstacles = [...traffic.cars, ...police.units, playerCar];
    if (stolenCar) obstacles.push(stolenCar);
    traffic.update(dt, obstacles);
    if (player.mode === 'driving' && player.car) {
      for (const other of traffic.cars) {
        if (other === player.car) continue;
        const d = distance2d(player.pos.x, player.pos.z, other.pos.x, other.pos.z);
        if (d < 3.3 && d > 0.01) {
          const push = (3.3 - d) / 2;
          other.pos.x += (other.pos.x - player.pos.x) / d * push;
          other.pos.z += (other.pos.z - player.pos.z) / d * push;
          if (Math.abs(player.car.speed) > 8 && state.crimeCooldown <= 0) {
            sound.playCrash(Math.abs(player.car.speed));
            burstSparks(other.pos.x, 0.8, other.pos.z, 6);
            witnessCrime(1, player.pos);
            state.crimeCooldown = 3;
            player.car.speed *= 0.55;
          }
        }
      }
      // running down a pedestrian is a serious crime
      for (const ped of peds.peds) {
        if (ped.state === 'down') continue;
        if (Math.abs(player.car.speed) > 4 && distance2d(player.pos.x, player.pos.z, ped.pos.x, ped.pos.z) < 1.9) {
          ped.state = 'down';
          ped.stateTime = 6;
          peds.dropBag(ped.pos.x, ped.pos.z);
          sound.playCrash(6);
          witnessCrime(2, player.pos);
          player.health -= 3;
        }
      }
    }

    // ----- pedestrians / pickups -----
    peds.update(dt, player.pos, () => {
      const loot = 12 + Math.floor(Math.random() * 16);
      state.cash += loot;
      sound.playCoin();
      hud.toast('Picked up $' + loot);
    });

    // ----- police -----
    const bustResult = police.update(dt, player, state.elapsed);
    if (bustResult === 'busted') {
      const fine = Math.min(state.cash, 150 + police.stars * 25);
      state.cash -= fine;
      showCaught(fine);
    }

    // ----- missions -----
    const mRes = missions.update(dt, {
      playerPos: player.pos,
      inStolenCar: !!(stolenCar && player.mode === 'driving' && player.car === stolenCar),
      playerInAnyCar: player.mode === 'driving',
    });
    onMissionResult(mRes);
    if (!missions.active && stolenCar && !(player.mode === 'driving' && player.car === stolenCar)) {
      // recovery failed/ended: leave the car in the world as a normal ride
      stolenCar = null;
    }

    // ----- health / death -----
    if (player.health <= 0) {
      const fine = Math.min(state.cash, 100);
      state.cash -= fine;
      showCaught(fine);
    }

    // ----- autosave -----
    state.saveClock -= dt;
    if (state.saveClock <= 0) { state.saveClock = 6; saveNow(); }

    // ----- audio -----
    const speedRatio = clamp(Math.abs(player.speedNow) / 34, 0, 1);
    sound.update(dt, speedRatio, player.mode === 'driving', police.stars, police.nearestDistance(player.pos));
  }

  updateSparks(dt);

  // ---------- camera ----------
  if (state.camMode === 'shot' && state.shotCam) {
    const c = state.shotCam;
    camera.position.set(c.x, c.y, c.z);
    camera.lookAt(c.lookX, c.lookY, c.lookZ);
  } else if (player.mode === 'driving' && player.car) {
    const car = player.car;
    const back = 9.5 + Math.abs(car.speed) * 0.14;
    const tx = car.pos.x - car.forwardX() * -back * -1; // behind = opposite of forward
    const bx = car.pos.x + Math.sin(car.heading) * -back * -1;
    // behind the car: pos - forward*back  (forward = -sin,-cos)
    const px = car.pos.x - car.forwardX() * back;
    const pz = car.pos.z - car.forwardZ() * back;
    camera.position.x = lerp(camera.position.x, px, 1 - Math.pow(0.001, dt));
    camera.position.z = lerp(camera.position.z, pz, 1 - Math.pow(0.001, dt));
    camera.position.y = lerp(camera.position.y, 3.6 + Math.abs(car.speed) * 0.02, 1 - Math.pow(0.001, dt));
    camera.lookAt(car.pos.x + car.forwardX() * 8, 1.4, car.pos.z + car.forwardZ() * 8);
  } else {
    const dist = 8.5;
    const px = player.pos.x + Math.sin(state.camYaw) * dist;
    const pz = player.pos.z + Math.cos(state.camYaw) * dist;
    camera.position.x = lerp(camera.position.x, px, 1 - Math.pow(0.0005, dt));
    camera.position.z = lerp(camera.position.z, pz, 1 - Math.pow(0.0005, dt));
    camera.position.y = lerp(camera.position.y, 4.4, 1 - Math.pow(0.0005, dt));
    camera.lookAt(player.pos.x, 1.5, player.pos.z);
  }

  // ---------- HUD ----------
  hud.setCash(state.cash);
  hud.setStars(police.stars, police.hiddenTime > 2 && police.stars > 0);
  hud.setHealth(player.health / 100);
  hud.setSpeed(Math.abs(player.speedNow) * 3.6, player.mode === 'driving');
  hud.setBust(police.bustMeter);
  hud.setObjective(missions.objectiveText());
  hud.drawMinimap({
    player,
    traffic: traffic.cars,
    police: police.units,
    peds: peds.peds,
    marker: missions.markerPoint(player.pos),
  });

  renderer.render(scene, camera);
  fpsGuard++;
}

frame();
