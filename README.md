# Neon Harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Chiiii318/neon-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Chiiii318/neon-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Neon Harbor** is a small open-world harbour crime game that runs entirely in the
browser. You are **Marina Vale**, a dock kid from the Neon Harbor marina who owes the
harbour dispatcher **Big Sal** for the loan on her runabout. Sal collects in favours,
not cash: run his driving jobs across a palm-lined coastal city, keep the Harbour
Patrol off your tail, and work the debt off one gold marker at a time.

The city is procedurally generated from a seed: an avenue grid with dozens of
towers (windows light up at night), palm trees, street lamps, benches, beach
umbrellas, a sandy beach and the sea. A slow day/night cycle moves the sun from
golden afternoon through dusk into a neon-lit night and back.

## Features

- **Open world on foot and behind the wheel** — walk, run, punch, hop into any
  car (yours, traffic's, even a patrol car) and drive with arcade physics:
  acceleration, braking, reverse, and a handbrake that steps the rear out.
- **Living traffic** — AI cars follow the avenue grid, turn at intersections,
  brake for the car ahead and wrap around the city edge.
- **Pedestrians** — 26 walkers stroll the sidewalks, panic and flee from danger,
  and drop a money bag when punched (walk over it to collect).
- **Wanted system (1–5 stars)** — hit cars or people, or commit crimes in front
  of a patrol unit, and the Harbour Patrol sends reinforcements that chase, ram
  and box you in. Break line of sight and hide to cool the stars down. Get
  pinned at low speed and the bust meter fills: **CAUGHT** — fined and dropped
  at Patrol HQ.
- **Three chained jobs from Big Sal** — *Hot Crate Delivery* (timed point to
  point), *Harbour Ring Run* (checkpoint circuit), *Stolen Wheels* (reach a
  dumped runabout and drive it back to the depot). Gold beacon + minimap marker,
  on-screen objective and countdown, cash payout on completion.
- **HUD** — canvas minimap (roads, beach, traffic, blinking red/blue patrol
  dots, gold mission marker), cash, wanted stars, health bar, speedometer,
  bust meter, prompts and toasts.
- **Procedural audio** — WebAudio only, no files: engine pitch follows speed,
  patrol sirens swell as units close in, crash thuds, punch smacks, coin and
  mission jingles, sea-breeze room tone. Audio starts on the START button.
- **Save game** — cash, finished jobs, peak wanted level and positions persist
  in `localStorage`; CONTINUE appears on the title screen when a save exists.
- **Touch controls** — on touch devices a virtual joystick plus E / F / Run
  buttons appear; you can walk and drive.
- **Performance** — buildings merged into a handful of geometries, windows /
  palms / lamps / benches instanced, pixel ratio capped at 1.5, at most
  13 traffic cars, 26 pedestrians and 6 patrol units on screen.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrow keys | Walk / drive (mouse drag looks around on foot) |
| Shift | Run |
| E | Get in / out of a car · accept a job at the gold marker |
| F | Punch |
| Space | Handbrake (drift) |
| Esc / P | Pause |
| Touch joystick + buttons | Move / car / punch / run on mobile |

## Run it locally

No build step and no dependencies beyond the vendored three.js in
`game/vendor/`. From the repository root:

```
node serve.ts
```

then open http://localhost:8080 in a desktop browser. (Any static file server
pointed at `game/` works just as well.)

Deterministic screenshot scenes used for the store images live in
`game/src/shots.js`: open `index.html?shot=cover&seed=1` (also `chase`,
`mission`, `night`) to see the composed scenes.

## Source layout

```
game/src/config.js       tuning constants (city, cars, police, economy)
game/src/random.js       seeded RNG + math helpers
game/src/audio.js        procedural WebAudio sound engine
game/src/input.js        keyboard / mouse / touch input
game/src/city.js         procedural city, road network, colliders
game/src/vehicles.js     car models, driving physics, traffic AI
game/src/pedestrians.js  pedestrian models + walking/fleeing AI
game/src/player.js       on-foot character + enter/exit/drive state machine
game/src/police.js       wanted level + pursuit director + bust meter
game/src/missions.js     the three jobs: definitions and runner
game/src/hud.js          HUD refresh + canvas minimap
game/src/save.js         localStorage save game
game/src/shots.js        deterministic screenshot scenes
game/src/main.js         startup, main loop, camera, day/night cycle
```

## Known limits

Arcade physics rather than a full vehicle simulation; pedestrians are simple
box figures with swing-limb animation (no skeletal rigs); police use steering
pursuit rather than road-graph pathfinding; building interiors do not exist.
Everything is original: city, characters, car designs and story were created
for this game.

<sub>Entered on [make.fun](https://make.fun/?ref=b1txph5j&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
