// Neon Harbor — deterministic screenshot scenes.
// Open the game with ?shot=<name>&seed=1 and the world is arranged into a
// composed, reproducible scene for the store screenshots. The scenes only
// position things the real game systems own (player, cars, police, mission);
// rendering and HUD stay exactly the shipping ones. Gameplay updates are
// frozen so the composition holds still for the capture.

export function readShotRequest() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (!shot) return null;
  const seed = parseInt(params.get('seed') || '1', 10) || 1;
  return { name: shot, seed };
}

// game: the assembled world from main.js. Scenes run once at startup.
export function applyShotScene(name, game) {
  const { player, police, missions, traffic } = game;
  game.setPaused(false);
  game.setFrozen(true);

  if (name === 'cover') {
    // Golden hour: Marina drives the coast avenue north, skyline behind her,
    // beach and sea to her right, camera low at the kerb.
    game.setDayPhase(0.475);
    const car = traffic.cars[0];
    car.pos.set(152, 0, 58);
    car.heading = 0; // north, toward -z
    car.speed = 17;
    car.syncMesh();
    player.enterCar(car);
    game.setCash(1860);
    police.stars = 2;
    police.peakStars = 2;
    game.setCameraMode('shot', { x: 164, y: 2.7, z: 78, lookX: 151, lookY: 1.5, lookZ: 56 });
    game.hud.toast('Cruising the Neon Harbor coast strip', 6000);
    return;
  }

  if (name === 'chase') {
    // Four stars: Harbour Patrol boxes Marina's car in on a downtown avenue,
    // two units ahead facing her, two closing from behind.
    game.setDayPhase(0.44);
    const car = traffic.cars[1];
    car.pos.set(4, 0, -24);
    car.heading = Math.PI; // south, toward +z
    car.speed = 19;
    car.syncMesh();
    player.enterCar(car);
    game.setCash(2430);
    police.stars = 4;
    police.peakStars = 4;
    const spots = [
      { x: -3.5, z: -9, h: 0 },            // ahead-left, facing the player
      { x: 10, z: -11, h: 0.15 },          // ahead-right, facing the player
      { x: -4, z: -41, h: Math.PI },       // behind-left, closing in
      { x: 11, z: -44, h: Math.PI * 0.95 },// behind-right, closing in
    ];
    for (const s of spots) {
      const unit = police.spawnUnit({ x: s.x + 400, z: s.z + 400 });
      unit.pos.set(s.x, 0, s.z);
      unit.heading = s.h;
      unit.speed = 18;
      unit.syncMesh();
    }
    missions.start(player.pos);
    if (missions.active) missions.active.timeLeft = 75;
    game.setCameraMode('shot', { x: -8, y: 4.4, z: -49, lookX: 4, lookY: 1.2, lookZ: -21 });
    game.hud.toast('Harbour Patrol is boxing you in!', 6000);
    return;
  }

  if (name === 'mission') {
    // On foot beside the glowing gold beacon at a street corner, objective
    // text and countdown on the HUD, character readable in near shot.
    game.setDayPhase(0.3);
    missions.start(player.pos);
    if (missions.active) {
      missions.active.timeLeft = 64;
      missions.active.target = { x: 7, z: 83 };
      missions._showBeacon(missions.active.target);
    }
    player.pos.set(3.4, 0, 79.6);
    player.heading = Math.PI * 0.72;
    player.mesh.position.copy(player.pos);
    player.mesh.rotation.y = player.heading;
    game.setCash(640);
    game.setCameraMode('shot', { x: -4.5, y: 2.5, z: 72.5, lookX: 6, lookY: 1.7, lookZ: 81.5 });
    return;
  }

  if (name === 'night') {
    // Deep night: neon-dark avenue, lit windows, lamp glow, headlights on.
    game.setDayPhase(0.78);
    const car = traffic.cars[2];
    car.pos.set(-70, 0, 8);
    car.heading = Math.PI / 2; // west along the avenue
    car.speed = 13;
    car.syncMesh();
    car.setBeam(true);
    player.enterCar(car);
    game.setCash(3120);
    police.stars = 1;
    game.setCameraMode('shot', { x: -48, y: 3.6, z: 25, lookX: -71, lookY: 1.5, lookZ: 7 });
    return;
  }

  // Unknown shot name: fall back to a cover-style scene.
  applyShotScene('cover', game);
}
