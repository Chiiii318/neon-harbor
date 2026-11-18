// Neon Harbor — central tuning constants.
// Every gameplay number that matters lives here so the balance is easy to audit.

export const CITY = {
  halfSize: 230,          // world spans -halfSize..+halfSize on x and z
  roadEvery: 76,          // distance between parallel avenues / streets
  roadWidth: 15,          // asphalt width
  sidewalkWidth: 4,
  seaX: 196,              // water starts east of this x
  beachWidth: 26,         // sand strip west of the water
  blockInset: 9,          // buildings keep this distance from road edges
};

export const COLORS = {
  skyDay: 0x8ec9e8,
  skyDusk: 0xf2a65e,
  skyNight: 0x0b1026,
  fogDay: 0xbcd9ea,
  fogNight: 0x0b1026,
  asphalt: 0x2e3138,
  sidewalk: 0x9aa0a3,
  sand: 0xe8d29a,
  sea: 0x1d6f8e,
  grass: 0x5d9c59,
  palmTrunk: 0x8a6a45,
  palmLeaf: 0x2f9e5f,
  lampGlow: 0xffd98a,
  neonPink: 0xff4d8d,
  neonCyan: 0x35e0e6,
  marker: 0xffd23e,
};

export const PLAYER = {
  walkSpeed: 7.5,
  runSpeed: 13,
  radius: 0.55,
  maxHealth: 100,
  punchRange: 2.4,
  punchCooldown: 0.45,
};

export const CAR = {
  maxForward: 34,         // m/s, arcade top speed
  maxReverse: 11,
  accel: 17,
  brake: 30,
  drag: 0.55,
  turnRate: 1.65,         // rad/s at full lock, scaled by speed
  trafficSpeed: 11,
  trafficCount: 13,
};

export const POLICE = {
  maxUnits: 6,
  bustFillTime: 2.6,      // seconds parked next to a slow player to bust
  bustRange: 9,
  loseSightTime: 9,       // hidden seconds before stars decay
  starDecayStep: 14,      // seconds hidden per star removed
};

export const DAY = {
  cycleSeconds: 300,      // one full day/night loop
  startPhase: 0.32,       // golden late afternoon
};

export const ECONOMY = {
  startCash: 240,
  bustFine: 150,
  punchLootMin: 8,
  punchLootMax: 30,
};

export const SAVE_KEY = 'neon-harbor-save-v1';
