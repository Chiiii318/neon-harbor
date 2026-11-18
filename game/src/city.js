// Neon Harbor — procedural city generation.
// A square avenue grid with a beach and sea on the east edge. Buildings are
// merged into a few big geometries (plus one InstancedMesh for lit windows),
// palms / lamps / benches are instanced, so the whole city is a handful of
// draw calls. Exports the road network and building colliders for gameplay.

import { CITY, COLORS } from './config.js';
import { createRng, randRange, pickRandom } from './random.js';

// Road centre lines on both axes: ..., -152, -76, 0, 76, 152, ...
export function roadCentres() {
  const lines = [];
  for (let v = -CITY.halfSize + CITY.roadEvery; v < CITY.halfSize; v += CITY.roadEvery) lines.push(v);
  lines.push(0);
  return [...new Set(lines)].sort((a, b) => a - b);
}

export function isOnRoad(x, z) {
  const half = CITY.roadWidth / 2 + 1.5;
  for (const c of roadCentres()) {
    if (Math.abs(x - c) < half || Math.abs(z - c) < half) return true;
  }
  return false;
}

export function isOnBeach(x) {
  return x > CITY.seaX - CITY.beachWidth && x <= CITY.seaX;
}

export function isInSea(x) {
  return x > CITY.seaX;
}

// Snap a point to the nearest intersection of the road grid.
export function nearestIntersection(x, z) {
  const lines = roadCentres();
  const snap = (v) => lines.reduce((best, c) => (Math.abs(c - v) < Math.abs(best - v) ? c : best), lines[0]);
  return { x: snap(x), z: snap(z) };
}

const BUILDING_PALETTES = [0xd8cfc0, 0xb9c4cc, 0xe3b7a0, 0xa8b8a0, 0xcfd8e6, 0xe6d28a, 0xd9a7b8, 0x9fb6c9];

export function buildCity(scene, seed) {
  const rng = createRng(seed * 7919 + 13);
  const colliders = [];   // {minX,maxX,minZ,maxZ} for buildings
  const lampPositions = [];
  const group = new THREE.Group();
  const H = CITY.halfSize;

  // ---- ground base (grass under everything) ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(H * 2 + 160, H * 2 + 160),
    new THREE.MeshLambertMaterial({ color: COLORS.grass })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  group.add(ground);

  // ---- roads: one dark plane per avenue / street, plus a beach strip ----
  const roadMat = new THREE.MeshLambertMaterial({ color: COLORS.asphalt });
  const sideMat = new THREE.MeshLambertMaterial({ color: COLORS.sidewalk });
  const lines = roadCentres();
  for (const c of lines) {
    const roadV = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, H * 2), roadMat);
    roadV.rotation.x = -Math.PI / 2;
    roadV.position.set(c, 0.01, 0);
    group.add(roadV);
    const roadH = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, CITY.roadWidth), roadMat);
    roadH.rotation.x = -Math.PI / 2;
    roadH.position.set(0, 0.012, c);
    group.add(roadH);
    // sidewalks: thin lighter strips flanking each road
    for (const s of [-1, 1]) {
      const swV = new THREE.Mesh(new THREE.PlaneGeometry(CITY.sidewalkWidth, H * 2), sideMat);
      swV.rotation.x = -Math.PI / 2;
      swV.position.set(c + s * (CITY.roadWidth / 2 + CITY.sidewalkWidth / 2), 0.02, 0);
      group.add(swV);
      const swH = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, CITY.sidewalkWidth), sideMat);
      swH.rotation.x = -Math.PI / 2;
      swH.position.set(0, 0.02, c + s * (CITY.roadWidth / 2 + CITY.sidewalkWidth / 2));
      group.add(swH);
    }
  }

  // dashed centre lines (merged into one geometry for cheap rendering)
  const dashGeoList = [];
  const dashGeoProto = new THREE.BoxGeometry(0.35, 0.02, 4);
  for (const c of lines) {
    for (let v = -H + 8; v < H - 8; v += 10) {
      if (lines.some((o) => Math.abs(v - o) < CITY.roadWidth)) continue;
      const g1 = dashGeoProto.clone(); g1.translate(c, 0.03, v); dashGeoList.push(g1);
      const g2 = new THREE.BoxGeometry(4, 0.02, 0.35); g2.translate(v, 0.03, c); dashGeoList.push(g2);
    }
  }
  const dashMesh = mergeGeometries(dashGeoList, new THREE.MeshBasicMaterial({ color: 0xf5e9b8 }));
  group.add(dashMesh);

  // ---- beach + sea ----
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.beachWidth + 30, H * 2 + 160),
    new THREE.MeshLambertMaterial({ color: COLORS.sand })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(CITY.seaX - CITY.beachWidth / 2 + 8, 0.0, 0);
  group.add(sand);
  const seaMat = new THREE.MeshPhongMaterial({ color: COLORS.sea, shininess: 90, transparent: true, opacity: 0.92 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(420, H * 2 + 300), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(CITY.seaX + 210, -0.35, 0);
  group.add(sea);

  // ---- buildings: per-block boxes, merged by material colour bucket ----
  const geosByColor = new Map();
  const windowMatrices = [];
  const dummy = new THREE.Object3D();
  const blocks = [];
  for (let i = 0; i < lines.length - 1; i++) {
    for (let j = 0; j < lines.length - 1; j++) {
      blocks.push({ x0: lines[i], x1: lines[i + 1], z0: lines[j], z1: lines[j + 1] });
    }
  }
  for (const b of blocks) {
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    if (cx > CITY.seaX - CITY.beachWidth - 20) continue; // keep the beach clear
    const perBlock = 2 + Math.floor(rng() * 2);
    for (let k = 0; k < perBlock; k++) {
      const w = randRange(rng, 13, 22);
      const d = randRange(rng, 13, 22);
      const h = randRange(rng, 12, 62) * (rng() < 0.18 ? 1.5 : 1);
      const bx = cx + randRange(rng, -16, 16);
      const bz = cz + randRange(rng, -16, 16);
      if (isOnRoad(bx, bz)) continue;
      const color = pickRandom(rng, BUILDING_PALETTES);
      const geo = new THREE.BoxGeometry(w, h, d);
      geo.translate(bx, h / 2, bz);
      if (!geosByColor.has(color)) geosByColor.set(color, []);
      geosByColor.get(color).push(geo);
      colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
      // lit windows on the two street-facing sides, as instanced small planes
      const rows = Math.floor(h / 3.4);
      const cols = Math.floor(w / 2.6);
      for (let r = 0; r < rows; r++) {
        for (let cIdx = 0; cIdx < cols; cIdx++) {
          if (rng() < 0.45) continue;
          const wy = 2 + r * 3.4;
          const wx = bx - w / 2 + 1.4 + cIdx * 2.6;
          dummy.position.set(wx, wy, bz + d / 2 + 0.06);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          windowMatrices.push(dummy.matrix.clone());
          if (rng() < 0.6) {
            dummy.position.set(bx + w / 2 + 0.06, wy, bz - d / 2 + 1.4 + cIdx * 2.6);
            dummy.rotation.set(0, Math.PI / 2, 0);
            dummy.updateMatrix();
            windowMatrices.push(dummy.matrix.clone());
          }
        }
      }
    }
  }
  for (const [color, geos] of geosByColor) {
    const mesh = mergeGeometries(geos, new THREE.MeshLambertMaterial({ color }));
    group.add(mesh);
  }
  const windowGeo = new THREE.PlaneGeometry(1.15, 1.5);
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 });
  const windows = new THREE.InstancedMesh(windowGeo, windowMat, Math.max(1, windowMatrices.length));
  windowMatrices.forEach((m, i) => windows.setMatrixAt(i, m));
  windows.instanceMatrix.needsUpdate = true;
  group.add(windows);

  // ---- palm trees: instanced trunks + instanced frond cones ----
  const palmSpots = [];
  for (let i = 0; i < 130; i++) {
    const alongBeach = i < 46;
    const x = alongBeach ? CITY.seaX - CITY.beachWidth + randRange(rng, 2, 16) : randRange(rng, -H + 12, H - 12);
    const z = randRange(rng, -H + 10, H - 10);
    if (!alongBeach && !isOnRoad(x + 9, z) && !isOnRoad(x - 9, z) && rng() < 0.7) continue;
    if (colliders.some((c) => x > c.minX - 2 && x < c.maxX + 2 && z > c.minZ - 2 && z < c.maxZ + 2)) continue;
    palmSpots.push({ x, z, s: randRange(rng, 0.85, 1.3), lean: randRange(rng, -0.09, 0.09) });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6.4, 6);
  trunkGeo.translate(0, 3.2, 0);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: COLORS.palmTrunk }), palmSpots.length);
  const frondGeo = new THREE.ConeGeometry(3.1, 1.6, 7);
  frondGeo.translate(0, 6.9, 0);
  const frondMesh = new THREE.InstancedMesh(frondGeo, new THREE.MeshLambertMaterial({ color: COLORS.palmLeaf }), palmSpots.length);
  palmSpots.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(p.lean, rng() * Math.PI, p.lean);
    dummy.scale.setScalar(p.s);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);
    frondMesh.setMatrixAt(i, dummy.matrix);
  });
  trunkMesh.instanceMatrix.needsUpdate = true;
  frondMesh.instanceMatrix.needsUpdate = true;
  group.add(trunkMesh);
  group.add(frondMesh);

  // ---- street lamps along avenues (instanced pole + emissive head) ----
  const lampSpots = [];
  for (const c of lines) {
    for (let v = -H + 20; v < H; v += 38) {
      lampSpots.push({ x: c + CITY.roadWidth / 2 + 1.6, z: v });
      lampSpots.push({ x: v, z: c - CITY.roadWidth / 2 - 1.6 });
      lampPositions.push({ x: c + CITY.roadWidth / 2 + 1.6, z: v });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.6, 5);
  poleGeo.translate(0, 2.8, 0);
  const poleMesh = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x3c4148 }), lampSpots.length);
  const headGeo = new THREE.SphereGeometry(0.34, 8, 6);
  headGeo.translate(0, 5.7, 0);
  const headMat = new THREE.MeshBasicMaterial({ color: COLORS.lampGlow, transparent: true, opacity: 0 });
  const headMesh = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
  lampSpots.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    poleMesh.setMatrixAt(i, dummy.matrix);
    headMesh.setMatrixAt(i, dummy.matrix);
  });
  poleMesh.instanceMatrix.needsUpdate = true;
  headMesh.instanceMatrix.needsUpdate = true;
  group.add(poleMesh);
  group.add(headMesh);

  // a few point lights for night streets (cheap: only 4, repositioned near camera at night)
  const nightLights = [];
  for (let i = 0; i < 4; i++) {
    const pl = new THREE.PointLight(COLORS.lampGlow, 0, 34, 2);
    pl.position.y = 6;
    group.add(pl);
    nightLights.push(pl);
  }

  // ---- benches + beach umbrellas (instanced boxes / cones) ----
  const benchSpots = [];
  for (let i = 0; i < 40; i++) {
    const x = randRange(rng, -H + 14, CITY.seaX - CITY.beachWidth - 6);
    const z = randRange(rng, -H + 14, H - 14);
    if (isOnRoad(x, z)) benchSpots.push({ x: x + 9.5, z, rot: rng() * Math.PI });
  }
  const benchGeo = new THREE.BoxGeometry(2.4, 0.5, 0.8);
  benchGeo.translate(0, 0.45, 0);
  const benchMesh = new THREE.InstancedMesh(benchGeo, new THREE.MeshLambertMaterial({ color: 0x7a5230 }), Math.max(1, benchSpots.length));
  benchSpots.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, p.rot, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    benchMesh.setMatrixAt(i, dummy.matrix);
  });
  benchMesh.instanceMatrix.needsUpdate = true;
  group.add(benchMesh);

  const umbGeo = new THREE.ConeGeometry(1.9, 0.8, 8);
  umbGeo.translate(0, 2.3, 0);
  const umbMesh = new THREE.InstancedMesh(umbGeo, new THREE.MeshLambertMaterial({ color: COLORS.neonPink }), 16);
  for (let i = 0; i < 16; i++) {
    dummy.position.set(CITY.seaX - CITY.beachWidth + randRange(rng, 3, 18), 0, randRange(rng, -H + 20, H - 20));
    dummy.rotation.set(0, rng() * 3, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    umbMesh.setMatrixAt(i, dummy.matrix);
  }
  umbMesh.instanceMatrix.needsUpdate = true;
  group.add(umbMesh);

  // ---- police station: a distinct low building with a sign block, SW corner ----
  const stationPos = { x: -190, z: 190 };
  const station = new THREE.Mesh(
    new THREE.BoxGeometry(26, 10, 18),
    new THREE.MeshLambertMaterial({ color: 0x4a5a75 })
  );
  station.position.set(stationPos.x, 5, stationPos.z);
  group.add(station);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(12, 2.2, 0.6),
    new THREE.MeshBasicMaterial({ color: 0x3565d8 })
  );
  sign.position.set(stationPos.x, 8.4, stationPos.z - 9.4);
  group.add(sign);
  colliders.push({ minX: stationPos.x - 13, maxX: stationPos.x + 13, minZ: stationPos.z - 9, maxZ: stationPos.z + 9 });

  scene.add(group);
  return { colliders, lampPositions, windowMat, headMat, nightLights, seaMat, stationPos, lines };
}

// Minimal BufferGeometry merge for same-attribute geometries (r149 has no
// BufferGeometryUtils in the UMD build, so we merge positions/normals/uvs).
export function mergeGeometries(geos, material) {
  let vertCount = 0;
  let idxCount = 0;
  for (const g of geos) {
    vertCount += g.attributes.position.count;
    idxCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vertCount * 3);
  const nor = new Float32Array(vertCount * 3);
  const uv = new Float32Array(vertCount * 2);
  const idx = new Uint32Array(idxCount);
  let vOff = 0;
  let iOff = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vOff * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, vOff * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vOff * 2);
    if (g.index) {
      const src = g.index.array;
      for (let i = 0; i < src.length; i++) idx[iOff + i] = src[i] + vOff;
      iOff += src.length;
    } else {
      for (let i = 0; i < g.attributes.position.count; i++) idx[iOff + i] = vOff + i;
      iOff += g.attributes.position.count;
    }
    vOff += g.attributes.position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.setIndex(new THREE.BufferAttribute(idx, 1));
  return new THREE.Mesh(merged, material);
}

// Circle vs building AABBs + world bounds. Returns corrected position.
export function collideCircle(pos, radius, colliders) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const left = pos.x - c.minX;
        const right = c.maxX - pos.x;
        const top = pos.z - c.minZ;
        const bottom = c.maxZ - pos.z;
        const min = Math.min(left, right, top, bottom);
        if (min === left) pos.x = c.minX - radius;
        else if (min === right) pos.x = c.maxX + radius;
        else if (min === top) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  const lim = CITY.halfSize + 30;
  pos.x = Math.max(-lim, Math.min(pos.x, CITY.seaX + 6));
  pos.z = Math.max(-lim, Math.min(pos.z, lim));
  return pos;
}

export function pointInBuilding(x, z, colliders, pad) {
  const p = pad || 0;
  return colliders.some((c) => x > c.minX - p && x < c.maxX + p && z > c.minZ - p && z < c.maxZ + p);
}
