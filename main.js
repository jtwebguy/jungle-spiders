import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ============================================================
//  Jungle Spiders — a small three.js FPS
// ============================================================

const WORLD = 170;              // playable radius (m)
const EYE = 1.65;               // eye height
const GRAVITY = 22;

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'), menu: $('menu'), pause: $('pause'), over: $('over'),
  play: $('play'), resume: $('resume'), restart: $('restart'), loading: $('loading'),
  wave: $('wave'), left: $('left'), kills: $('kills'), banner: $('banner'),
  hpfill: $('hpfill'), hptext: $('hptext'), mag: $('mag'), reserve: $('reserve'),
  wname: $('wname'), reloadhint: $('reloadhint'), slot1: $('slot1'), slot2: $('slot2'),
  toasts: $('toasts'), vignette: $('vignette'), hit: $('hitmarker'),
  cross: $('crosshair'), overstats: $('overstats'),
  bossbar: $('bossbar'), bossname: $('bossname'), bossfill: $('bossfill'), nades: $('nades'),
};

// ---------- Renderer / scenes ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.autoClear = false;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG = new THREE.Color(0x5d7a58);
scene.background = FOG.clone();
scene.fog = new THREE.FogExp2(FOG, 0.028);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 400);
camera.rotation.order = 'YXZ';

// viewmodel (weapon) is drawn in its own pass so it never clips into trees
const vmScene = new THREE.Scene();
const vmCamera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0xcfe8c0, 0x2a2016, 1.4));
const vmSun = new THREE.DirectionalLight(0xfff0d0, 2.2);
vmSun.position.set(1, 2, 1.5);
vmScene.add(vmSun);
const vmFlashLight = new THREE.PointLight(0xffaa44, 0, 2);
vmScene.add(vmFlashLight);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = vmCamera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); vmCamera.updateProjectionMatrix();
});

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(0xb8d8b0, 0x2c2414, 1.1));
const sun = new THREE.DirectionalLight(0xffe6b0, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 160;
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
const SUN_OFFSET = new THREE.Vector3(40, 70, 25);

const flashLight = new THREE.PointLight(0xffb060, 0, 14, 2);
scene.add(flashLight);
// persistent lights (adding/removing lights at runtime forces shader recompiles = stutter)
const boomLight = new THREE.PointLight(0xff8830, 0, 30, 2); scene.add(boomLight);
const bossLight = new THREE.PointLight(0xff2200, 0, 10, 2); scene.add(bossLight);

// ---------- Utils ----------
let seed = 1337;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rr = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function heightAt(x, z) {
  let h = 0, amp = 1, f = 0.018;
  for (let i = 0; i < 4; i++) { h += (vnoise(x * f, z * f) - 0.5) * amp; amp *= 0.5; f *= 2.1; }
  const r = Math.hypot(x, z);
  const flat = clamp(r / 18, 0, 1);            // flatter clearing at spawn
  let y = h * 7 * flat;
  if (r > WORLD - 10) y += (r - (WORLD - 10)) * 0.6; // raise edges into hills
  return y;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- Sky dome ----------
{
  const g = new THREE.SphereGeometry(350, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x9cc4c8) }, bot: { value: FOG } },
    vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 p; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(0.0, 0.5, p.y)), 1.); }',
  });
  const sky = new THREE.Mesh(g, m); sky.renderOrder = -1; scene.add(sky);
  scene.userData.sky = sky;
}

// ---------- Terrain ----------
const colliders = [];     // {x,z,r,h}
{
  const size = WORLD * 2 + 40, seg = 180;
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, col = [];
  const cA = new THREE.Color(0x3b5a24), cB = new THREE.Color(0x5a4a2a), cC = new THREE.Color(0x2c4a1c), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    const n = vnoise(x * 0.08, z * 0.08), n2 = vnoise(x * 0.3 + 50, z * 0.3);
    tmp.copy(cA).lerp(cB, clamp(n * 1.4 - 0.4, 0, 1)).lerp(cC, n2 * 0.5);
    col.push(tmp.r, tmp.g, tmp.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);
}

// ---------- Vegetation (instanced) ----------
const dummy = new THREE.Object3D();
function scatter(count, minR, test) {
  const pts = [];
  let tries = 0;
  while (pts.length < count && tries++ < count * 30) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * (WORLD + 5);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x, z) < minR) continue;
    if (test && !test(x, z, pts)) continue;
    pts.push([x, z]);
  }
  return pts;
}
{
  // trees
  const trees = scatter(420, 7, (x, z, pts) => pts.every(([a, b]) => Math.hypot(a - x, b - z) > 4.5));
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.42, 1, 7, 1); trunkGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  const leafGeo = new THREE.IcosahedronGeometry(1, 1);
  const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, trees.length * 4);
  const palmFrond = new THREE.ConeGeometry(0.5, 3.2, 3, 1, true); palmFrond.rotateX(Math.PI / 2); palmFrond.translate(0, 0, 1.6);
  const fronds = new THREE.InstancedMesh(palmFrond, new THREE.MeshStandardMaterial({ color: 0x3f7a2a, side: THREE.DoubleSide, roughness: 0.9, flatShading: true }), trees.length * 7);
  let li = 0, fi = 0; const c = new THREE.Color();
  trees.forEach(([x, z], i) => {
    const y = heightAt(x, z), palm = rand() < 0.35;
    const h = palm ? 7 + rand() * 5 : 6 + rand() * 7, s = palm ? 0.7 : 0.8 + rand() * 0.9;
    dummy.position.set(x, y - 0.2, z); dummy.rotation.set((rand() - 0.5) * 0.12, rand() * 6, (rand() - 0.5) * 0.12); dummy.scale.set(s, h, s);
    dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
    colliders.push({ x, z, r: 0.42 * s + 0.05, h: h + y });
    if (palm) {
      for (let k = 0; k < 7; k++) {
        dummy.position.set(x, y + h - 0.3, z); dummy.rotation.set(0.35 + rand() * 0.3, k / 7 * Math.PI * 2 + rand() * 0.3, 0, 'YXZ');
        dummy.scale.setScalar(0.9 + rand() * 0.4); dummy.updateMatrix(); fronds.setMatrixAt(fi++, dummy.matrix);
      }
    } else {
      const blobs = 2 + Math.floor(rand() * 3);
      for (let k = 0; k < blobs; k++) {
        const r = 1.8 + rand() * 2.2 * s;
        dummy.position.set(x + (rand() - 0.5) * 3, y + h - 0.5 + rand() * 2, z + (rand() - 0.5) * 3);
        dummy.rotation.set(rand(), rand(), rand()); dummy.scale.set(r, r * 0.7, r); dummy.updateMatrix();
        leaves.setMatrixAt(li, dummy.matrix);
        leaves.setColorAt(li++, c.setHSL(0.26 + rand() * 0.08, 0.5, 0.18 + rand() * 0.12));
      }
    }
  });
  leaves.count = li; fronds.count = fi;
  for (const m of [trunks, leaves, fronds]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }

  // bushes / ferns
  const bushes = scatter(1100, 5);
  const bushGeo = new THREE.IcosahedronGeometry(1, 0);
  const bush = new THREE.InstancedMesh(bushGeo, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), bushes.length);
  bushes.forEach(([x, z], i) => {
    const s = 0.4 + rand() * 1.1;
    dummy.position.set(x, heightAt(x, z) + s * 0.2, z); dummy.rotation.set(rand(), rand() * 6, rand()); dummy.scale.set(s * 1.3, s * 0.7, s * 1.3);
    dummy.updateMatrix(); bush.setMatrixAt(i, dummy.matrix); bush.setColorAt(i, c.setHSL(0.24 + rand() * 0.1, 0.55, 0.14 + rand() * 0.12));
  });
  bush.castShadow = true; bush.receiveShadow = true; scene.add(bush);

  // fern leaves (crossed blades)
  const ferns = scatter(1600, 3);
  const bladeGeo = new THREE.ConeGeometry(0.12, 1, 3, 1); bladeGeo.translate(0, 0.5, 0);
  const blades = new THREE.InstancedMesh(bladeGeo, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), ferns.length * 5);
  let bi = 0;
  for (const [x, z] of ferns) {
    const y = heightAt(x, z);
    for (let k = 0; k < 5; k++) {
      dummy.position.set(x, y, z); dummy.rotation.set(0.5 + rand() * 0.6, k / 5 * 6.28 + rand(), 0, 'YXZ');
      const s = 0.5 + rand() * 0.9; dummy.scale.set(s, s * 1.3, s); dummy.updateMatrix();
      blades.setMatrixAt(bi, dummy.matrix); blades.setColorAt(bi++, c.setHSL(0.22 + rand() * 0.1, 0.6, 0.2 + rand() * 0.15));
    }
  }
  scene.add(blades);

  // rocks
  const rocks = scatter(90, 10, (x, z, pts) => colliders.every(c => Math.hypot(c.x - x, c.z - z) > 3));
  const rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x6b6a60, roughness: 1, flatShading: true }), rocks.length);
  rocks.forEach(([x, z], i) => {
    const s = 0.5 + rand() * 1.4;
    dummy.position.set(x, heightAt(x, z), z); dummy.rotation.set(rand(), rand(), rand()); dummy.scale.set(s * 1.2, s * 0.8, s);
    dummy.updateMatrix(); rock.setMatrixAt(i, dummy.matrix);
    colliders.push({ x, z, r: s * 1.0, h: heightAt(x, z) + s * 0.8 });
  });
  rock.castShadow = rock.receiveShadow = true; scene.add(rock);

  // hanging vines
  const vineGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 3); vineGeo.translate(0, -0.5, 0);
  const vines = new THREE.InstancedMesh(vineGeo, new THREE.MeshStandardMaterial({ color: 0x2f4a1c }), 500);
  for (let i = 0; i < 500; i++) {
    const t = colliders[Math.floor(rand() * trees.length)];
    const a = rand() * 6.28, d = 0.6 + rand() * 2.5;
    dummy.position.set(t.x + Math.cos(a) * d, t.h - 0.5, t.z + Math.sin(a) * d);
    dummy.rotation.set((rand() - 0.5) * 0.2, 0, (rand() - 0.5) * 0.2);
    dummy.scale.set(1, 2 + rand() * (t.h - heightAt(t.x, t.z) - 2.5), 1); dummy.updateMatrix(); vines.setMatrixAt(i, dummy.matrix);
  }
  scene.add(vines);
}

// fireflies / floating spores
const spores = (() => {
  const n = 400, g = new THREE.BufferGeometry(), p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { p[i * 3] = rr(-30, 30); p[i * 3 + 1] = rr(0.3, 6); p[i * 3 + 2] = rr(-30, 30); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const tex = canvasTex(32, 32, (x, w) => { const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,200,1)'); gr.addColorStop(1, 'rgba(255,255,150,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, w); });
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.12, map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xeaff9a }));
  scene.add(pts); return pts;
})();

// ============================================================
//  Audio (synthesized — no files needed)
// ============================================================
let actx = null, master = null, noiseBuf = null;
function initAudio() {
  if (actx) { actx.resume(); return; }
  actx = new (window.AudioContext || window.webkitAudioContext)();
  master = actx.createGain(); master.gain.value = 0.55; master.connect(actx.destination);
  noiseBuf = actx.createBuffer(1, actx.sampleRate * 1.5, actx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startAmbience();
}
function noise(dur, { type = 'lowpass', freq = 1000, q = 1, vol = 0.5, attack = 0.002, decay = dur, when = 0, dest = master } = {}) {
  if (!actx) return;
  const t = actx.currentTime + when, s = actx.createBufferSource(); s.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = actx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  return f;
}
function tone(freq, dur, { type = 'sine', vol = 0.3, to = freq, when = 0, attack = 0.005 } = {}) {
  if (!actx) return;
  const t = actx.currentTime + when, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
const sfx = {
  rifle() { noise(0.18, { freq: 2600, vol: 0.55, decay: 0.16 }); noise(0.35, { freq: 400, vol: 0.5, decay: 0.3 }); tone(140, 0.12, { to: 50, vol: 0.4 }); },
  pistol() { noise(0.25, { freq: 1800, vol: 0.7, decay: 0.2 }); tone(180, 0.18, { to: 45, vol: 0.55, type: 'triangle' }); },
  empty() { tone(1800, 0.03, { vol: 0.15, type: 'square' }); },
  reload() { tone(900, 0.04, { vol: 0.12, type: 'square', when: 0.1 }); noise(0.06, { type: 'bandpass', freq: 3000, vol: 0.3, when: 0.35 }); tone(700, 0.05, { vol: 0.15, type: 'square', when: 0.9 }); },
  reloadEnd() { noise(0.05, { type: 'bandpass', freq: 2500, vol: 0.35 }); tone(1200, 0.04, { vol: 0.12, type: 'square', when: 0.05 }); },
  hit() { tone(1300, 0.05, { vol: 0.12, type: 'square', to: 900 }); },
  squish() { noise(0.25, { type: 'bandpass', freq: 700, q: 3, vol: 0.5, decay: 0.22 }); tone(220, 0.2, { to: 60, vol: 0.2, type: 'sawtooth' }); },
  hiss(v = 0.3) { noise(0.5, { type: 'highpass', freq: 4500, vol: v, attack: 0.05, decay: 0.45 }); },
  hurt() { tone(160, 0.25, { to: 90, vol: 0.35, type: 'sawtooth' }); noise(0.15, { freq: 600, vol: 0.3 }); },
  pickup() { tone(660, 0.1, { vol: 0.2 }); tone(990, 0.15, { vol: 0.2, when: 0.08 }); },
  heal() { tone(520, 0.12, { vol: 0.2 }); tone(780, 0.12, { vol: 0.2, when: 0.1 }); tone(1040, 0.2, { vol: 0.2, when: 0.2 }); },
  switch() { noise(0.08, { type: 'bandpass', freq: 1500, vol: 0.25 }); },
  roar() { tone(70, 1.1, { vol: 0.45, type: 'sawtooth', to: 40, attack: 0.1 }); tone(95, 1.0, { vol: 0.3, type: 'square', to: 55, attack: 0.1 }); noise(1.0, { type: 'bandpass', freq: 500, q: 2, vol: 0.4, attack: 0.1, decay: 0.9 }); },
  boom(v = 1) { noise(1.4, { freq: 300, vol: 0.9 * v, decay: 1.3 }); noise(0.4, { freq: 3000, vol: 0.5 * v, decay: 0.3 }); tone(60, 0.9, { to: 25, vol: 0.7 * v, type: 'sine' }); },
  pin() { tone(2400, 0.04, { vol: 0.12, type: 'square' }); noise(0.05, { type: 'highpass', freq: 5000, vol: 0.2, when: 0.05 }); },
  bounce() { tone(900, 0.04, { vol: 0.08, type: 'triangle', to: 600 }); },
  wave() { tone(110, 0.9, { vol: 0.3, type: 'sawtooth', to: 80 }); tone(165, 0.9, { vol: 0.2, type: 'sawtooth', to: 120 }); },
};
function startAmbience() {
  // insect drone
  const s = actx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 5200; f.Q.value = 8;
  const g = actx.createGain(); g.gain.value = 0.05;
  const lfo = actx.createOscillator(), lg = actx.createGain(); lfo.frequency.value = 7; lg.gain.value = 0.03; lfo.connect(lg); lg.connect(g.gain); lfo.start();
  s.connect(f); f.connect(g); g.connect(master); s.start();
  // random bird calls
  (function bird() {
    if (Math.random() < 0.7) {
      const base = rr(1500, 3500), n = 1 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) tone(base, 0.12, { to: base * rr(0.6, 1.5), vol: 0.035, when: i * 0.16 });
    }
    setTimeout(bird, rr(1500, 5000));
  })();
}

// ============================================================
//  Models
// ============================================================
const loader = new STLLoader();
const loadGeo = (url) => new Promise((res, rej) => loader.load(url, (g) => {
  g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4); g.computeVertexNormals(); res(g);
}, undefined, rej));

// ============================================================
//  Particles
// ============================================================
const particles = [];
const partGeo = new THREE.IcosahedronGeometry(1, 0);
const partMats = {
  blood: new THREE.MeshBasicMaterial({ color: 0x9fcf2a }),
  dust: new THREE.MeshBasicMaterial({ color: 0x6a5a40 }),
  leaf: new THREE.MeshBasicMaterial({ color: 0x3f6a22 }),
  spark: new THREE.MeshBasicMaterial({ color: 0xffd080 }),
};
function burst(pos, kind, n, speed = 3, size = 0.04) {
  for (let i = 0; i < n; i++) {
    let p = particles.find(p => !p.alive);
    if (!p) { if (particles.length > 300) break; p = { mesh: new THREE.Mesh(partGeo, partMats.dust), vel: new THREE.Vector3() }; scene.add(p.mesh); particles.push(p); }
    p.alive = true; p.life = rr(0.4, 0.9); p.mesh.visible = true; p.mesh.material = partMats[kind];
    p.mesh.position.copy(pos); p.mesh.scale.setScalar(size * rr(0.6, 1.4));
    p.vel.set(rr(-1, 1), rr(0.2, 1.5), rr(-1, 1)).multiplyScalar(speed);
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    if (!p.alive) continue;
    p.life -= dt; p.vel.y -= 12 * dt; p.mesh.position.addScaledVector(p.vel, dt);
    const gy = heightAt(p.mesh.position.x, p.mesh.position.z);
    if (p.mesh.position.y < gy) { p.mesh.position.y = gy; p.vel.multiplyScalar(0.3); }
    if (p.life <= 0) { p.alive = false; p.mesh.visible = false; }
  }
}

// tracers
const tracers = [];
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.8 });
function tracer(a, b) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const l = new THREE.Line(g, tracerMat.clone()); scene.add(l); tracers.push({ l, life: 0.06 });
}

// splats on ground
const splatTex = canvasTex(64, 64, (x) => {
  for (let i = 0; i < 14; i++) { x.fillStyle = `rgba(130,190,30,${rr(0.4, 0.9)})`; x.beginPath(); x.arc(32 + rr(-18, 18), 32 + rr(-18, 18), rr(3, 12), 0, 7); x.fill(); }
});
const splats = [];
function splat(x, z, s) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: splatTex, transparent: true, depthWrite: false, fog: true }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6; m.position.set(x, heightAt(x, z) + 0.03, z);
  scene.add(m); splats.push({ m, life: 25 });
  if (splats.length > 40) { const o = splats.shift(); scene.remove(o.m); o.m.material.dispose(); o.m.geometry.dispose(); }
}

// ============================================================
//  Player & weapons
// ============================================================
const keys = {};
const player = {
  pos: new THREE.Vector3(0, 0, 0), vy: 0, onGround: true, yaw: 0, pitch: 0,
  hp: 100, alive: true, kills: 0, grenades: 0, bob: 0, hurtT: 0, knock: new THREE.Vector3(),
};

const WEAPONS = [
  {
    name: 'M4A1-S', key: 'rifle', auto: true, rate: 0.085, dmg: 34, spread: 0.012, moveSpread: 0.03,
    magSize: 30, mag: 30, reserve: 120, maxReserve: 300, reloadTime: 2.1, recoil: 0.018, kick: 0.035,
    len: 0.72, pos: new THREE.Vector3(0.19, -0.19, -0.46), muzzle: new THREE.Vector3(0, 0.03, -0.5),
    color: 0x2b2d2f, sound: 'rifle', ammoPickup: 60,
  },
  {
    name: 'M1911', key: 'pistol', auto: false, rate: 0.14, dmg: 55, spread: 0.006, moveSpread: 0.02,
    magSize: 7, mag: 7, reserve: 35, maxReserve: 140, reloadTime: 1.5, recoil: 0.045, kick: 0.05,
    len: 0.24, pos: new THREE.Vector3(0.14, -0.14, -0.34), muzzle: new THREE.Vector3(0, 0.27, -0.5),
    color: 0x3a3c3e, sound: 'pistol', ammoPickup: 21,
  },
];
let cur = 0;
const wstate = { nadeCd: 0, throwT: 0, cooldown: 0, reloading: 0, switching: 0, recoil: 0, kick: 0, mouseDown: false, triggerReleased: true, spreadHeat: 0 };

const vmRoot = new THREE.Group(); vmScene.add(vmRoot);
const flashTex = canvasTex(64, 64, (x) => {
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,220,1)'); g.addColorStop(0.3, 'rgba(255,190,80,.9)'); g.addColorStop(1, 'rgba(255,120,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  x.strokeStyle = 'rgba(255,230,160,.8)'; x.lineWidth = 3; for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; x.beginPath(); x.moveTo(32, 32); x.lineTo(32 + Math.cos(a) * 31, 32 + Math.sin(a) * 31); x.stroke(); }
});

function buildWeapon(w, geo) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: w.color, metalness: 0.6, roughness: 0.45 });
  const mesh = new THREE.Mesh(geo, mat); mesh.scale.setScalar(w.len);
  g.add(mesh);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flash.position.copy(w.muzzle).multiplyScalar(w.len); flash.position.z -= 0.03; flash.scale.setScalar(w.key === 'rifle' ? 0.12 : 0.14);
  flash.visible = false; g.add(flash);
  w.group = g; w.flash = flash; w.mesh = mesh;
  g.position.copy(w.pos); g.visible = false; vmRoot.add(g);
}

// shell casings in viewmodel
const shells = [];
const shellGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.02, 6); shellGeo.rotateZ(Math.PI / 2);
const shellMat = new THREE.MeshStandardMaterial({ color: 0xd4a340, metalness: 0.9, roughness: 0.3 });
function ejectShell(w) {
  const m = new THREE.Mesh(shellGeo, shellMat); m.position.copy(w.group.position).add(new THREE.Vector3(0.02, w.key === 'rifle' ? 0.03 : 0.05, -0.05));
  vmScene.add(m); shells.push({ m, v: new THREE.Vector3(rr(0.6, 1.0), rr(0.8, 1.3), rr(-0.1, 0.2)), life: 0.6 });
}

// ============================================================
//  Spiders
// ============================================================
let spiderGeo = null;
const spiders = [];
const SPIDER_SKINS = [
  { color: 0x1a1612, rough: 0.55, eye: 0xff2200 },
  { color: 0x3a2616, rough: 0.8, eye: 0xff4400 },
  { color: 0x2a2a2a, rough: 0.4, eye: 0xff0033 },
  { color: 0x4d2e14, rough: 0.85, eye: 0xffaa00 },
];
const eyeGeo = new THREE.SphereGeometry(0.018, 8, 6);

function makeSpider(size) {
  const skin = SPIDER_SKINS[Math.floor(Math.random() * SPIDER_SKINS.length)];
  const mat = new THREE.MeshStandardMaterial({ color: skin.color, roughness: skin.rough, metalness: 0.1, emissive: 0x000000 });
  const root = new THREE.Group(), pivot = new THREE.Group(), mesh = new THREE.Mesh(spiderGeo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const eyeMat = new THREE.MeshBasicMaterial({ color: skin.eye });
  for (const [x, y, z, s] of [[-0.022, 0.2, 0.105, 1], [0.022, 0.2, 0.105, 1], [-0.045, 0.19, 0.09, 0.7], [0.045, 0.19, 0.09, 0.7]]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(x, y, z); e.scale.setScalar(s); mesh.add(e);
  }
  mesh.scale.setScalar(size);
  pivot.add(mesh); root.add(pivot); scene.add(root);
  const t = clamp((size - 0.15) / 0.85, 0, 1); // 0 = mouse, 1 = dog (bosses clamp to 1)
  return {
    root, pivot, mesh, mat, size, t,
    hp: 10 + 230 * size * size, maxHp: 10 + 230 * size * size,
    speed: lerp(6.5, 4.2, t) * rr(0.85, 1.15),
    dmg: Math.round(4 + 18 * t),
    jumpRange: lerp(3.5, 8, t), jumpCd: rr(0.5, 2),
    state: 'walk', stateT: 0, vel: new THREE.Vector3(), yaw: 0, phase: Math.random() * 10,
    hitCd: 0, flash: 0, dead: false, deadT: 0, airHit: false, boss: false, broodT: 6,
  };
}

function randomSize(wave) {
  // weighted: lots of small ones, more big ones as waves go on
  const r = Math.random();
  const bigBias = Math.min(0.5, wave * 0.05);
  if (r < 0.45 - bigBias * 0.5) return rr(0.15, 0.3);     // mouse-ish
  if (r < 0.8 - bigBias * 0.5) return rr(0.3, 0.6);       // cat-ish
  return rr(0.6, 1.0);                                    // dog-sized
}

function spawnSpider(wave) {
  let x, z, tries = 0;
  do {
    const a = Math.random() * Math.PI * 2, d = rr(28, 50);
    x = player.pos.x + Math.cos(a) * d; z = player.pos.z + Math.sin(a) * d;
  } while (Math.hypot(x, z) > WORLD - 8 && tries++ < 20);
  if (Math.hypot(x, z) > WORLD - 8) { const k = (WORLD - 10) / Math.hypot(x, z); x *= k; z *= k; }
  const s = makeSpider(randomSize(wave));
  s.root.position.set(x, heightAt(x, z), z);
  spiders.push(s);
}

const BOSS_NAMES = ['The Broodmother', 'Old Hairy', 'Silk Queen', 'The Widow', 'Canopy Terror', 'Jungle Titan', 'Eight-Legged Nightmare', 'The Devourer', 'Mother of Webs', 'Ancient Weaver'];
function bossSize(wave) { return 1.5 + (Math.min(wave, 10) - 1) * 0.55 + Math.max(0, wave - 10) * 0.3; }   // wave 1: 1.5 m, wave 5: 3.7 m, wave 10: 6.45 m, then +0.3 m per wave
function spawnBoss(wave) {
  let x, z, tries = 0;
  do { const a = Math.random() * Math.PI * 2, d = rr(38, 50); x = player.pos.x + Math.cos(a) * d; z = player.pos.z + Math.sin(a) * d; }
  while (Math.hypot(x, z) > WORLD - 12 && tries++ < 30);
  if (Math.hypot(x, z) > WORLD - 12) { const k = (WORLD - 14) / Math.hypot(x, z); x *= k; z *= k; }
  const size = bossSize(wave), s = makeSpider(size);
  s.boss = true; s.t = 1;
  s.name = BOSS_NAMES[(wave - 1) % BOSS_NAMES.length] + (wave > BOSS_NAMES.length ? ' ' + 'II III IV V'.split(' ')[Math.min(3, Math.floor((wave - 1) / BOSS_NAMES.length) - 1)] : '');
  s.hp = s.maxHp = 350 + 220 * wave;
  s.speed = 3.2 + Math.min(2.2, wave * 0.18);
  s.dmg = 22 + 3 * wave;
  s.jumpRange = 10 + size * 2; s.jumpCd = 3;
  s.mat.color.setHex([0x1b0e08, 0x2a0a0a, 0x101010, 0x3a1e0c][wave % 4]);
  s.mat.roughness = 0.5; s.mat.metalness = 0.25;
  s.mesh.traverse(o => { if (o !== s.mesh && o.material) { o.material = new THREE.MeshBasicMaterial({ color: 0xff1a00 }); o.scale.multiplyScalar(1.3); } });
  bossLight.distance = 4 + size * 2;
  s.root.position.set(x, heightAt(x, z), z);
  spiders.push(s); game.boss = s;
  ui.bossbar.classList.remove('hidden'); ui.bossname.textContent = s.name;
  banner(`${s.name.toUpperCase()}<small>boss approaching — ${size.toFixed(1)} m leg span</small>`, 3.5);
  sfx.roar();
}

function killSpider(s) {
  s.dead = true; s.deadT = 0; s.state = 'dead';
  player.kills++; game.remaining--;
  burst(s.root.position.clone().add(new THREE.Vector3(0, 0.15 * s.size, 0)), 'blood', 8 + Math.round(20 * s.size), 3 + 3 * s.size, 0.03 + 0.05 * s.size);
  splat(s.root.position.x, s.root.position.z, 0.5 + s.size * 1.6);
  sfx.squish();
  const px = s.root.position.x, pz = s.root.position.z;
  if (s.boss) {
    game.boss = null; ui.bossbar.classList.add('hidden');
    banner(`${s.name.toUpperCase()} SLAIN`, 2.5); shake(0.6);
    dropPickup(px + 1.5, pz, 'health'); dropPickup(px - 1.5, pz, 'ammo');
    if (game.wave >= 5) { dropPickup(px, pz + 1.5, 'grenade'); dropPickup(px, pz - 1.5, 'grenade'); }
    return;
  }
  // chance to drop a small pickup — grenades start dropping from wave 5
  if (game.wave >= 5 && Math.random() < 0.14 + 0.1 * s.t) dropPickup(px, pz, 'grenade', true);
  else if (Math.random() < 0.12 + 0.2 * s.t) dropPickup(px, pz, Math.random() < 0.6 ? 'ammo' : 'health', true);
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
function updateSpiders(dt, time) {
  const pp = player.pos;
  for (let i = spiders.length - 1; i >= 0; i--) {
    const s = spiders[i], p = s.root.position;
    if (s.dead) {
      s.deadT += dt;
      s.pivot.rotation.z = lerp(s.pivot.rotation.z, Math.PI, Math.min(1, dt * 10));
      s.pivot.position.y = lerp(s.pivot.position.y, 0.22 * s.size, Math.min(1, dt * 10));
      s.mesh.scale.y = lerp(s.mesh.scale.y, s.size * 0.6, dt * 3);
      if (s.airborne) { s.vel.y -= GRAVITY * dt; p.addScaledVector(s.vel, dt); const gy = heightAt(p.x, p.z); if (p.y <= gy) { p.y = gy; s.airborne = false; } }
      if (s.deadT > 4) p.y -= dt * 0.3 * s.size;
      if (s.deadT > 6) { scene.remove(s.root); s.mat.dispose(); spiders.splice(i, 1); }
      continue;
    }
    s.hitCd -= dt; s.jumpCd -= dt; s.stateT += dt;
    if (s.flash > 0) { s.flash -= dt; s.mat.emissive.setRGB(s.flash * 3, 0, 0); } else s.mat.emissive.setRGB(0, 0, 0);

    const dx = pp.x - p.x, dz = pp.z - p.z, dist = Math.hypot(dx, dz);
    const targetYaw = Math.atan2(dx, dz);

    if (s.state === 'walk') {
      // skittering: bursts of speed, weaving
      const burstF = 0.35 + 0.65 * Math.max(0, Math.sin(time * (7 + 5 * (1 - s.t)) + s.phase));
      const weave = Math.sin(time * 2.3 + s.phase) * (dist > 6 ? 0.7 : 0.2);
      const yaw = targetYaw + weave;
      let dy = yaw - s.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); s.yaw += dy * Math.min(1, dt * 8);
      const sp = s.speed * (s.boss ? 0.6 + 0.4 * burstF : burstF) * (dist < 0.9 + s.size * 0.35 ? 0 : 1);
      p.x += Math.sin(s.yaw) * sp * dt; p.z += Math.cos(s.yaw) * sp * dt;
      p.y = heightAt(p.x, p.z);
      s.pivot.position.y = Math.abs(Math.sin(time * 18 + s.phase)) * 0.03 * s.size;
      s.pivot.rotation.z = Math.sin(time * 22 + s.phase) * 0.06;
      s.pivot.rotation.x = 0;
      if (dist < s.jumpRange && dist > 1.0 && s.jumpCd <= 0 && player.alive) { s.state = 'crouch'; s.stateT = 0; }
      // bosses call in their brood
      if (s.boss && game.wave >= 2 && (s.broodT -= dt) <= 0 && game.running) {
        s.broodT = Math.max(5, 10 - game.wave * 0.4);
        const n = Math.min(4, 1 + Math.floor(game.wave / 3));
        for (let k = 0; k < n; k++) {
          const b = makeSpider(rr(0.15, 0.35)), a = Math.random() * 6.28;
          b.root.position.set(p.x + Math.cos(a) * s.size * 0.4, p.y, p.z + Math.sin(a) * s.size * 0.4); b.jumpCd = 1.5;
          spiders.push(b); game.remaining++;
        }
        sfx.hiss(0.35);
      }
      // bite when close
      if (dist < 0.6 + s.size * 0.6 && s.hitCd <= 0 && player.alive) { damagePlayer(Math.ceil(s.dmg * 0.6), p); s.hitCd = 1.0; }
    } else if (s.state === 'crouch') {
      let dy = targetYaw - s.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); s.yaw += dy * Math.min(1, dt * 12);
      const k = Math.min(1, s.stateT / 0.35);
      s.mesh.scale.set(s.size * (1 + 0.12 * k), s.size * (1 - 0.35 * k), s.size * (1 + 0.05 * k));
      s.pivot.rotation.x = -0.15 * k;
      if (s.stateT > (s.boss ? 0.8 : lerp(0.25, 0.45, s.t))) {
        // leap: aim at the player's chest/face with a ballistic arc (and lead the target a bit)
        const T = s.boss ? clamp(0.6 + dist * 0.06, 0.8, 1.4) : clamp(0.35 + dist * 0.07, 0.4, 0.9);
        const tx = pp.x + (player.vel?.x || 0) * T * 0.5, tz = pp.z + (player.vel?.z || 0) * T * 0.5;
        const ty = s.boss ? pp.y : pp.y + EYE - 0.35 + rr(-0.2, 0.2);
        s.vel.set((tx - p.x) / T, (ty - p.y + 0.5 * GRAVITY * T * T) / T, (tz - p.z) / T);
        s.state = 'air'; s.stateT = 0; s.airHit = false; s.airborne = true;
        s.mesh.scale.setScalar(s.size);
        if (s.boss) sfx.roar(); else sfx.hiss(0.1 + 0.25 * s.t);
      }
    } else if (s.state === 'air') {
      s.vel.y -= GRAVITY * dt; p.addScaledVector(s.vel, dt);
      s.pivot.rotation.x = clamp(-s.vel.y * 0.08, -0.8, 0.8);
      s.yaw = Math.atan2(s.vel.x, s.vel.z);
      // collide with player capsule
      if (!s.airHit && player.alive) {
        const cy = clamp(p.y + 0.1 * s.size, pp.y + 0.2, pp.y + EYE);
        _v.set(pp.x, cy, pp.z);
        if (_v.distanceTo(_v2.set(p.x, p.y + 0.1 * s.size, p.z)) < 0.45 + s.size * 0.4) {
          s.airHit = true; damagePlayer(s.dmg, p, true);
          s.vel.x *= -0.35; s.vel.z *= -0.35; s.vel.y = 3;
        }
      }
      const gy = heightAt(p.x, p.z);
      if (p.y <= gy && s.vel.y < 0) {
        p.y = gy; s.state = 'walk'; s.stateT = 0; s.airborne = false; s.jumpCd = rr(1.2, 2.8) + s.t; s.pivot.rotation.x = 0;
        if (s.boss) {
          // ground slam shockwave
          s.jumpCd = rr(2.5, 4);
          const slamR = 2 + s.size * 1.1, dp = Math.hypot(pp.x - p.x, pp.z - p.z);
          shake(clamp(1.2 - dp / 40, 0.2, 1)); sfx.boom(0.6);
          for (let k = 0; k < 24; k++) { const a = k / 24 * 6.28; burst(_v.set(p.x + Math.cos(a) * slamR * 0.6, p.y + 0.1, p.z + Math.sin(a) * slamR * 0.6), 'dust', 1, 4, 0.08); }
          if (dp < slamR && player.onGround && !s.airHit) damagePlayer(Math.round(s.dmg * 0.6 * (1 - dp / slamR) + 5), p, true);
        }
      }
    }

    // keep out of trees & away from each other
    if (s.state !== 'air' && !s.boss) { // bosses trample through the undergrowth
      for (const c of colliders) {
        const ex = p.x - c.x, ez = p.z - c.z, d2 = ex * ex + ez * ez, rr2 = c.r + 0.3 * s.size;
        if (d2 < rr2 * rr2 && d2 > 1e-6) { const d = Math.sqrt(d2); p.x = c.x + ex / d * rr2; p.z = c.z + ez / d * rr2; }
      }
    }
    const lim = WORLD - 2, rp = Math.hypot(p.x, p.z); if (rp > lim) { p.x *= lim / rp; p.z *= lim / rp; }
    s.root.rotation.y = s.yaw;
  }
  // separation
  for (let a = 0; a < spiders.length; a++) for (let b = a + 1; b < spiders.length; b++) {
    const A = spiders[a], B = spiders[b]; if (A.dead || B.dead) continue;
    const ex = A.root.position.x - B.root.position.x, ez = A.root.position.z - B.root.position.z;
    const min = (A.size + B.size) * 0.4, d2 = ex * ex + ez * ez;
    if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2), push = (min - d), wa = B.size / (A.size + B.size), wb = 1 - wa; A.root.position.x += ex / d * push * wa; A.root.position.z += ez / d * push * wa; B.root.position.x -= ex / d * push * wb; B.root.position.z -= ez / d * push * wb; }
  }
}

// ============================================================
//  Pickups
// ============================================================
const pickups = [];
const ammoTex = canvasTex(128, 64, (x, w, h) => {
  x.fillStyle = '#4b5a2c'; x.fillRect(0, 0, w, h); x.fillStyle = '#e8d890'; x.font = 'bold 26px sans-serif'; x.textAlign = 'center'; x.fillText('AMMO', w / 2, 42);
  x.strokeStyle = '#2d3818'; x.lineWidth = 4; x.strokeRect(2, 2, w - 4, h - 4);
});
const medTex = canvasTex(64, 64, (x, w) => {
  x.fillStyle = '#f2f2f2'; x.fillRect(0, 0, w, w); x.fillStyle = '#d42020'; x.fillRect(24, 10, 16, 44); x.fillRect(10, 24, 44, 16);
});
const beamMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const beamGeo = new THREE.CylinderGeometry(0.25, 0.4, 14, 12, 1, true); beamGeo.translate(0, 7, 0);
const boxGeo = new THREE.BoxGeometry(0.6, 0.35, 0.35);
const medGeo = new THREE.BoxGeometry(0.45, 0.3, 0.45);
const ringGeo = new THREE.RingGeometry(0.55, 0.7, 32); ringGeo.rotateX(-Math.PI / 2);

function dropPickup(x, z, type, small = false) {
  const g = new THREE.Group();
  let item;
  if (type === 'ammo') {
    item = new THREE.Mesh(boxGeo, [
      new THREE.MeshStandardMaterial({ color: 0x4b5a2c, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0x4b5a2c, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: 0x5a6a34, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0x3a4620 }),
      new THREE.MeshStandardMaterial({ map: ammoTex }), new THREE.MeshStandardMaterial({ map: ammoTex }),
    ]);
  } else if (type === 'grenade') {
    item = new THREE.Group();
    for (let k = 0; k < 2; k++) { const gm = makeGrenadeMesh(); gm.scale.setScalar(1.8); gm.position.x = (k - 0.5) * 0.28; item.add(gm); }
  } else {
    const mm = new THREE.MeshStandardMaterial({ map: medTex, roughness: 0.5 });
    item = new THREE.Mesh(medGeo, mm);
  }
  item.castShadow = true;
  const color = type === 'ammo' ? 0xc8ff60 : type === 'grenade' ? 0xffb020 : 0xff5050;
  const beam = new THREE.Mesh(beamGeo, beamMat(color));
  const ring = new THREE.Mesh(ringGeo, beamMat(color)); ring.material.opacity = 0.6; ring.position.y = 0.05;
  g.add(item, beam, ring);
  if (small) g.scale.setScalar(0.75);
  g.position.set(x, heightAt(x, z), z);
  scene.add(g);
  pickups.push({ g, item, type, small, t: Math.random() * 10 });
}
function randomPickupSpot() {
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * (WORLD - 12);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (colliders.every(c => Math.hypot(c.x - x, c.z - z) > c.r + 1.2)) return [x, z];
  }
  return [0, 0];
}
function seedPickups() {
  for (const p of pickups) scene.remove(p.g);
  pickups.length = 0;
  // some near the start so the player learns what they look like
  dropPickup(6, -8, 'ammo'); dropPickup(-7, -6, 'health');
  for (let i = 0; i < 34; i++) { const [x, z] = randomPickupSpot(); dropPickup(x, z, 'ammo'); }
  for (let i = 0; i < 18; i++) { const [x, z] = randomPickupSpot(); dropPickup(x, z, 'health'); }
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i]; p.t += dt;
    p.item.position.y = 0.6 + Math.sin(p.t * 2.5) * 0.12; p.item.rotation.y += dt * 1.4;
    const dx = player.pos.x - p.g.position.x, dz = player.pos.z - p.g.position.z;
    if (dx * dx + dz * dz < 1.6 * 1.6 && Math.abs(player.pos.y - p.g.position.y) < 2.5) {
      if (collect(p)) {
        scene.remove(p.g); pickups.splice(i, 1);
        if (!p.small) setTimeout(() => { if (game.running) { const [x, z] = randomPickupSpot(); dropPickup(x, z, p.type); } }, 25000);
      }
    }
  }
}
function collect(p) {
  if (p.type === 'health') {
    if (player.hp >= 100) return false;
    const add = p.small ? 20 : 35; player.hp = Math.min(100, player.hp + add); sfx.heal(); toast(`+${add} HEALTH`, 'r'); return true;
  }
  if (p.type === 'grenade') {
    if (player.grenades >= MAX_NADES) return false;
    const add = Math.min(MAX_NADES - player.grenades, p.small ? 1 : 2); player.grenades += add;
    sfx.pickup(); toast(`+${add} GRENADE${add > 1 ? 'S' : ''}  [G / right-click]`, 'o'); return true;
  }
  const mult = p.small ? 0.5 : 1; let got = [];
  for (const w of WEAPONS) {
    if (w.reserve >= w.maxReserve) continue;
    const add = Math.round(w.ammoPickup * mult); w.reserve = Math.min(w.maxReserve, w.reserve + add); got.push(`+${add} ${w.name}`);
  }
  if (!got.length) return false;
  sfx.pickup(); toast(got.join('   '), 'g'); return true;
}

// ============================================================
//  Camera shake
// ============================================================
let shakeAmt = 0;
function shake(a) { shakeAmt = Math.min(1.5, shakeAmt + a); }

// ============================================================
//  Grenades
// ============================================================
const MAX_NADES = 6;
const grenades = [], explosions = [];
function makeGrenadeMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), new THREE.MeshStandardMaterial({ color: 0x3d4a26, roughness: 0.7 }));
  body.scale.y = 1.2;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.05, 8), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.3 }));
  top.position.y = 0.09;
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.1, 0.02), top.material); lever.position.set(0.04, 0.05, 0); lever.rotation.z = -0.3;
  g.add(body, top, lever); g.traverse(o => { o.castShadow = true; });
  return g;
}
function throwGrenade() {
  if (player.grenades <= 0 || wstate.nadeCd > 0 || !player.alive) { if (player.grenades <= 0 && wstate.nadeCd <= 0) { sfx.empty(); wstate.nadeCd = 0.3; } return; }
  player.grenades--; wstate.nadeCd = 0.9; wstate.throwT = 0.45; sfx.pin();
  const m = makeGrenadeMesh(); scene.add(m);
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  m.position.copy(camera.position).addScaledVector(dir, 0.5).add(new THREE.Vector3(0, -0.15, 0));
  const vel = dir.multiplyScalar(14.5).add(new THREE.Vector3(player.vel.x, 3.5, player.vel.z));
  grenades.push({ m, vel, fuse: 2.2, spin: new THREE.Vector3(rr(-9, 9), rr(-9, 9), rr(-9, 9)) });
}
function explode(pos) {
  const R = 7.5, MAXD = 320;
  sfx.boom(1);
  const dp = pos.distanceTo(camera.position);
  shake(clamp(1.3 - dp / 30, 0.1, 1.3));
  // fireball
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  ball.position.copy(pos); scene.add(ball);
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ color: 0x333028, transparent: true, opacity: 0.6, depthWrite: false, roughness: 1 }));
  smoke.position.copy(pos); scene.add(smoke);
  boomLight.position.copy(pos).y += 1; boomLight.intensity = 80;
  explosions.push({ ball, smoke, t: 0 });
  burst(pos, 'spark', 30, 9, 0.04); burst(pos, 'dust', 25, 6, 0.08);
  // scorch mark
  const sm = new THREE.Mesh(new THREE.CircleGeometry(1.8, 16), new THREE.MeshBasicMaterial({ color: 0x0a0806, transparent: true, opacity: 0.7, depthWrite: false }));
  sm.rotation.x = -Math.PI / 2; sm.position.set(pos.x, heightAt(pos.x, pos.z) + 0.04, pos.z); scene.add(sm); splats.push({ m: sm, life: 30 });
  // damage spiders
  for (const s of spiders) {
    if (s.dead) continue;
    const c = _v.copy(s.root.position); c.y += 0.12 * s.size;
    const d = Math.max(0, c.distanceTo(pos) - 0.36 * s.size);
    if (d > R) continue;
    const f = Math.pow(1 - d / R, 0.8);
    s.hp -= MAXD * f; s.flash = 0.2;
    const push = (10 * f) / (0.4 + s.size);
    _v2.subVectors(c, pos).setY(0).normalize();
    s.vel.set(_v2.x * push, 4 + 6 * f / (0.4 + s.size), _v2.z * push);
    if (s.hp <= 0) { s.airborne = true; killSpider(s); }
    else if (!s.boss) { s.state = 'air'; s.airHit = true; s.airborne = true; s.stateT = 0; }
  }
  // hurt the player too if too close
  const pd = pos.distanceTo(_v.set(player.pos.x, player.pos.y + 1, player.pos.z));
  if (pd < R * 0.8 && game.running) { const n = Math.round(45 * (1 - pd / (R * 0.8))); if (n > 0) damagePlayer(n, pos, true); }
}
function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i], p = g.m.position;
    g.vel.y -= GRAVITY * dt; p.addScaledVector(g.vel, dt);
    g.m.rotation.x += g.spin.x * dt; g.m.rotation.y += g.spin.y * dt; g.m.rotation.z += g.spin.z * dt;
    const gy = heightAt(p.x, p.z) + 0.08;
    if (p.y < gy) {
      p.y = gy;
      if (Math.abs(g.vel.y) > 2) sfx.bounce();
      g.vel.y = Math.abs(g.vel.y) * 0.35; g.vel.x *= 0.55; g.vel.z *= 0.55; g.spin.multiplyScalar(0.6);
    }
    for (const c of colliders) {
      const ex = p.x - c.x, ez = p.z - c.z, d2 = ex * ex + ez * ez;
      if (d2 < c.r * c.r && p.y < c.h && d2 > 1e-6) {
        const d = Math.sqrt(d2), nx = ex / d, nz = ez / d, vn = g.vel.x * nx + g.vel.z * nz;
        p.x = c.x + nx * c.r; p.z = c.z + nz * c.r;
        if (vn < 0) { g.vel.x -= 1.6 * vn * nx; g.vel.z -= 1.6 * vn * nz; sfx.bounce(); }
      }
    }
    // bounce off spider bodies
    for (const s of spiders) {
      if (s.dead) continue;
      const c = _v.copy(s.root.position); c.y += 0.14 * s.size;
      const rad = 0.3 * s.size + 0.07, d = p.distanceTo(c);
      if (d < rad && d > 1e-6) {
        const n = _v2.subVectors(p, c).divideScalar(d), vn = g.vel.dot(n);
        p.copy(c).addScaledVector(n, rad);
        if (vn < 0) { g.vel.addScaledVector(n, -1.5 * vn); g.vel.multiplyScalar(0.5); sfx.bounce(); }
      }
    }
    g.fuse -= dt;
    if (g.fuse <= 0) { explode(p.clone()); scene.remove(g.m); grenades.splice(i, 1); }
  }
  boomLight.intensity = Math.max(0, boomLight.intensity - dt * 200);
  const B = game.boss;
  if (B && !B.dead) { bossLight.intensity = 4; bossLight.position.copy(B.root.position).y += B.size * 0.4; } else bossLight.intensity = 0;
  for (let i = explosions.length - 1; i >= 0; i--) {
    const e = explosions[i]; e.t += dt;
    const k = e.t / 0.35;
    e.ball.scale.setScalar(0.5 + 4.5 * Math.min(1, k)); e.ball.material.opacity = Math.max(0, 0.95 * (1 - k));
    e.smoke.scale.setScalar(1 + 4 * Math.min(1, e.t / 1.5)); e.smoke.position.y += dt * 1.2; e.smoke.material.opacity = Math.max(0, 0.6 * (1 - e.t / 2.2));
    if (e.t > 2.2) { scene.remove(e.ball, e.smoke); e.ball.geometry.dispose(); e.smoke.geometry.dispose(); explosions.splice(i, 1); }
  }
}

// ============================================================
//  Game flow
// ============================================================
const game = { running: false, paused: false, wave: 0, toSpawn: 0, remaining: 0, spawnT: 0, betweenT: 0, time: 0, boss: null, bossSpawned: false, waveSize: 0 };

function toast(text, cls = '') {
  const d = document.createElement('div'); d.className = 'toast ' + cls; d.textContent = text; ui.toasts.appendChild(d);
  setTimeout(() => d.remove(), 2000);
}
let bannerTimer = 0;
function banner(html, secs = 2.5) { ui.banner.innerHTML = html; ui.banner.classList.add('show'); clearTimeout(bannerTimer); bannerTimer = setTimeout(() => ui.banner.classList.remove('show'), secs * 1000); }

function startWave() {
  game.wave++;
  const count = 6 + game.wave * 4;
  game.toSpawn = count; game.remaining = count + 1; game.spawnT = 0; game.betweenT = 0; game.waveSize = count; game.bossSpawned = false;
  banner(`WAVE ${game.wave}<small>${count} spiders + 1 boss incoming${game.wave === 5 ? ' — spiders now drop GRENADES' : ''}</small>`);
  sfx.wave();
}

function resetGame() {
  for (const s of spiders) scene.remove(s.root);
  spiders.length = 0;
  for (const g of grenades) scene.remove(g.m);
  grenades.length = 0; game.boss = null; ui.bossbar.classList.add('hidden'); player.grenades = 0;
  Object.assign(player, { hp: 100, alive: true, kills: 0, vy: 0, yaw: 0, pitch: 0 });
  player.pos.set(0, heightAt(0, 0), 0); player.knock.set(0, 0, 0);
  WEAPONS[0].mag = 30; WEAPONS[0].reserve = 120; WEAPONS[1].mag = 7; WEAPONS[1].reserve = 35;
  Object.assign(wstate, { cooldown: 0, reloading: 0, switching: 0, recoil: 0, kick: 0, nadeCd: 0, throwT: 0 });
  selectWeapon(0, true);
  seedPickups();
  game.wave = 0; game.betweenT = 2.5; game.toSpawn = 0; game.remaining = 0; game.running = true;
}

function damagePlayer(n, from, leap) {
  if (!player.alive || !game.running) return;
  player.hp -= n; player.hurtT = 1;
  _v.set(player.pos.x - from.x, 0, player.pos.z - from.z).normalize().multiplyScalar(leap ? 5 : 2.5);
  player.knock.add(_v);
  sfx.hurt();
  if (leap) wstate.recoil += 0.05;
  if (player.hp <= 0) { player.hp = 0; die(); }
}
function die() {
  player.alive = false; game.running = false;
  setTimeout(() => {
    document.exitPointerLock();
    ui.overstats.innerHTML = `You survived to wave <b>${game.wave}</b> and squashed <b>${player.kills}</b> spiders.`;
    ui.over.classList.remove('hidden'); ui.hud.classList.add('hidden');
  }, 1200);
}

// ---------- Weapons logic ----------
function selectWeapon(i, instant = false) {
  if (i === cur && !instant) return;
  WEAPONS[cur].group && (WEAPONS[cur].group.visible = false);
  cur = i; wstate.reloading = 0; wstate.switching = instant ? 0 : 0.35;
  const w = WEAPONS[cur]; if (w.group) w.group.visible = true;
  ui.slot1.classList.toggle('on', cur === 0); ui.slot2.classList.toggle('on', cur === 1);
  if (!instant) sfx.switch();
}
function reload() {
  const w = WEAPONS[cur];
  if (wstate.reloading > 0 || w.mag >= w.magSize || w.reserve <= 0 || wstate.switching > 0) return;
  wstate.reloading = w.reloadTime; sfx.reload();
}
function finishReload() {
  const w = WEAPONS[cur]; const need = w.magSize - w.mag, take = Math.min(need, w.reserve);
  w.mag += take; w.reserve -= take; sfx.reloadEnd();
}

const ray = new THREE.Ray();
function fire() {
  const w = WEAPONS[cur];
  if (w.mag <= 0) { sfx.empty(); wstate.cooldown = 0.25; if (w.reserve > 0) reload(); return; }
  w.mag--; wstate.cooldown = w.rate;
  sfx[w.sound]();
  wstate.recoil += w.recoil; wstate.kick = 1;
  w.flash.visible = true; w.flash.material.rotation = Math.random() * 6; w.flashT = 0.05;
  vmFlashLight.intensity = 6; vmFlashLight.position.copy(w.group.position).add(new THREE.Vector3(0, 0, -w.len * 0.5));
  flashLight.intensity = 30; flashLight.position.copy(camera.position);
  ejectShell(w);

  // hitscan
  const moving = (keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD) ? w.moveSpread : 0;
  const sp = w.spread + moving + wstate.spreadHeat + (player.onGround ? 0 : 0.04);
  wstate.spreadHeat = Math.min(0.03, wstate.spreadHeat + (w.auto ? 0.004 : 0.01));
  const dir = new THREE.Vector3(rr(-sp, sp), rr(-sp, sp), -1).normalize().applyQuaternion(camera.quaternion);
  ray.set(camera.position, dir);
  let best = Infinity, target = null, kind = 'dust';

  for (const s of spiders) {
    if (s.dead) continue;
    const r = Math.max(0.36 * s.size, 0.1);
    _v.copy(s.root.position); _v.y += 0.12 * s.size + s.pivot.position.y;
    const oc = _v2.copy(_v).sub(ray.origin), tca = oc.dot(dir);
    if (tca < 0) continue;
    const d2 = oc.lengthSq() - tca * tca; if (d2 > r * r) continue;
    const t = tca - Math.sqrt(r * r - d2);
    if (t < best) { best = t; target = s; }
  }
  // tree trunks (2D ray vs circle)
  const dh = Math.hypot(dir.x, dir.z);
  if (dh > 1e-4) for (const c of colliders) {
    const ox = c.x - ray.origin.x, oz = c.z - ray.origin.z;
    const tca = (ox * dir.x + oz * dir.z) / dh; if (tca < 0 || tca / dh > best) continue;
    const d2 = ox * ox + oz * oz - tca * tca; if (d2 > c.r * c.r) continue;
    const t = (tca - Math.sqrt(c.r * c.r - d2)) / dh;
    const y = ray.origin.y + dir.y * t;
    if (t < best && y < c.h && y > heightAt(c.x, c.z) - 1) { best = t; target = null; kind = 'leaf'; }
  }
  // terrain (march)
  for (let t = 0.5; t < Math.min(best, 150); t += 0.5) {
    const x = ray.origin.x + dir.x * t, y = ray.origin.y + dir.y * t, z = ray.origin.z + dir.z * t;
    if (y < heightAt(x, z)) { best = t - 0.25; target = null; kind = 'dust'; break; }
  }
  const hitPoint = ray.at(Math.min(best, 150), new THREE.Vector3());
  const muzzleWorld = camera.localToWorld(new THREE.Vector3(0.18, -0.12, -0.6));
  tracer(muzzleWorld, hitPoint);

  if (target) {
    // falloff for pistol at range is small; rifle keeps damage
    target.hp -= w.dmg; target.flash = 0.12;
    burst(hitPoint, 'blood', 5 + Math.round(6 * target.size), 2.5, 0.02 + 0.03 * target.size);
    // knock small spiders back / out of the air
    const push = 4 / (0.3 + target.size * 2);
    target.vel.x = dir.x * push; target.vel.z = dir.z * push;
    if (target.state === 'air') target.vel.y = Math.min(target.vel.y, 1); else { target.root.position.x += dir.x * 0.05 * push; target.root.position.z += dir.z * 0.05 * push; }
    const killed = target.hp <= 0;
    if (killed) { target.airborne = target.state === 'air'; killSpider(target); }
    sfx.hit(); showHit(killed);
  } else if (best < 150) {
    burst(hitPoint, kind, 5, 2, 0.025);
  }
}

let hitTimer = 0;
function showHit(kill) { ui.hit.classList.add('show'); ui.hit.classList.toggle('kill', kill); clearTimeout(hitTimer); hitTimer = setTimeout(() => ui.hit.classList.remove('show'), 90); }

// ============================================================
//  Input
// ============================================================
const canvas = renderer.domElement;
const lockTargets = [ui.play, ui.resume, ui.restart];
ui.play.onclick = () => { initAudio(); resetGame(); canvas.requestPointerLock(); };
ui.resume.onclick = () => { initAudio(); canvas.requestPointerLock(); };
ui.restart.onclick = () => { ui.over.classList.add('hidden'); resetGame(); canvas.requestPointerLock(); };
canvas.addEventListener('click', () => { if (game.running && document.pointerLockElement !== canvas) canvas.requestPointerLock(); });

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) { game.paused = false; ui.menu.classList.add('hidden'); ui.pause.classList.add('hidden'); ui.hud.classList.remove('hidden'); }
  else if (game.running) { game.paused = true; ui.pause.classList.remove('hidden'); wstate.mouseDown = false; for (const k in keys) keys[k] = false; }
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || !player.alive) return;
  player.yaw -= e.movementX * 0.0022; player.pitch -= e.movementY * 0.0022;
  player.pitch = clamp(player.pitch, -1.5, 1.5);
});
document.addEventListener('mousedown', (e) => { if (document.pointerLockElement !== canvas) return; if (e.button === 0) wstate.mouseDown = true; if (e.button === 2 && game.running && !game.paused) throwGrenade(); });
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('mouseup', (e) => { if (e.button === 0) { wstate.mouseDown = false; wstate.triggerReleased = true; } });
let lastWheel = 0;
document.addEventListener('wheel', () => { const n = performance.now(); if (document.pointerLockElement === canvas && n - lastWheel > 250) { lastWheel = n; selectWeapon(cur === 0 ? 1 : 0); } });
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (!game.running || game.paused) return;
  if (e.code === 'KeyR') reload();
  if (e.code === 'Digit1') selectWeapon(0);
  if (e.code === 'Digit2') selectWeapon(1);
  if (e.code === 'KeyQ') selectWeapon(cur === 0 ? 1 : 0);
  if (e.code === 'KeyG') throwGrenade();
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

// ============================================================
//  Update loop
// ============================================================
player.vel = new THREE.Vector3();
function updatePlayer(dt) {
  const fwd = _v.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = _v2.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const move = new THREE.Vector3();
  if (player.alive) {
    if (keys.KeyW) move.add(fwd); if (keys.KeyS) move.sub(fwd);
    if (keys.KeyD) move.add(right); if (keys.KeyA) move.sub(right);
  }
  const sprint = keys.ShiftLeft || keys.ShiftRight;
  const speed = sprint ? 8.5 : 5.2;
  if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);
  player.vel.x = lerp(player.vel.x, move.x, Math.min(1, dt * 12));
  player.vel.z = lerp(player.vel.z, move.z, Math.min(1, dt * 12));
  player.pos.x += (player.vel.x + player.knock.x) * dt;
  player.pos.z += (player.vel.z + player.knock.z) * dt;
  player.knock.multiplyScalar(Math.max(0, 1 - dt * 6));

  // collisions
  for (const c of colliders) {
    const ex = player.pos.x - c.x, ez = player.pos.z - c.z, rr2 = c.r + 0.4, d2 = ex * ex + ez * ez;
    if (d2 < rr2 * rr2 && d2 > 1e-6 && player.pos.y < c.h - 0.3) { const d = Math.sqrt(d2); player.pos.x = c.x + ex / d * rr2; player.pos.z = c.z + ez / d * rr2; }
  }
  for (const s of spiders) {
    if (s.dead || s.size < 1.2 || s.state === 'air') continue;
    const ex = player.pos.x - s.root.position.x, ez = player.pos.z - s.root.position.z, rr2 = s.size * 0.32 + 0.3, d2 = ex * ex + ez * ez;
    if (d2 < rr2 * rr2 && d2 > 1e-6) { const d = Math.sqrt(d2); player.pos.x = s.root.position.x + ex / d * rr2; player.pos.z = s.root.position.z + ez / d * rr2; }
  }
  const lim = WORLD - 3, r = Math.hypot(player.pos.x, player.pos.z);
  if (r > lim) { player.pos.x *= lim / r; player.pos.z *= lim / r; }

  // gravity / jump
  const gy = heightAt(player.pos.x, player.pos.z);
  if (player.onGround && keys.Space && player.alive) { player.vy = 7.2; player.onGround = false; }
  player.vy -= GRAVITY * dt; player.pos.y += player.vy * dt;
  if (player.pos.y <= gy) { player.pos.y = gy; player.vy = 0; player.onGround = true; }
  else if (player.pos.y - gy > 0.05 && player.vy <= 0 && player.onGround) { player.pos.y = gy; } // stick to slopes

  const hs = Math.hypot(player.vel.x, player.vel.z);
  if (player.onGround) player.bob += dt * hs * 1.6;
  camera.position.set(player.pos.x, player.pos.y + (player.alive ? EYE : 0.35) + Math.sin(player.bob * 2) * 0.04 * Math.min(1, hs / 5), player.pos.z);
  camera.rotation.set(player.pitch + wstate.recoil, player.yaw, player.alive ? 0 : 0.6);
  if (shakeAmt > 0.001) {
    const a = shakeAmt * shakeAmt * 0.12;
    camera.position.x += rr(-a, a); camera.position.y += rr(-a, a); camera.rotation.x += rr(-a, a) * 0.3; camera.rotation.z += rr(-a, a) * 0.3;
    shakeAmt = Math.max(0, shakeAmt - dt * 1.8);
  }
  wstate.recoil = lerp(wstate.recoil, 0, Math.min(1, dt * 9));
  player.hurtT = Math.max(0, player.hurtT - dt * 1.5);
  return hs;
}

function updateWeapon(dt, hs, time) {
  const w = WEAPONS[cur];
  wstate.cooldown -= dt; wstate.spreadHeat = Math.max(0, wstate.spreadHeat - dt * 0.08);
  if (wstate.switching > 0) wstate.switching -= dt;
  wstate.nadeCd -= dt; if (wstate.throwT > 0) wstate.throwT -= dt;
  if (wstate.reloading > 0) { wstate.reloading -= dt; if (wstate.reloading <= 0) finishReload(); }
  if (player.alive && !game.paused && wstate.mouseDown && wstate.cooldown <= 0 && wstate.reloading <= 0 && wstate.switching <= 0) {
    if (w.auto || wstate.triggerReleased) { fire(); wstate.triggerReleased = false; }
  }
  if (w.mag === 0 && w.reserve > 0 && wstate.reloading <= 0 && wstate.cooldown <= 0 && !wstate.mouseDown) reload();

  // viewmodel animation
  wstate.kick = Math.max(0, wstate.kick - dt * 12);
  const bobx = Math.cos(player.bob) * 0.012 * Math.min(1, hs / 5), boby = Math.abs(Math.sin(player.bob)) * 0.014 * Math.min(1, hs / 5);
  const sprint = (keys.ShiftLeft || keys.ShiftRight) && hs > 6;
  const rl = wstate.reloading > 0 ? Math.sin(Math.PI * (1 - wstate.reloading / w.reloadTime)) : 0;
  const sw = Math.max(wstate.switching > 0 ? wstate.switching / 0.35 : 0, wstate.throwT > 0 ? Math.sin(Math.PI * wstate.throwT / 0.45) * 0.6 : 0);
  const g = w.group;
  g.position.set(w.pos.x + bobx, w.pos.y + boby - rl * 0.12 - sw * 0.3 - (sprint ? 0.04 : 0), w.pos.z + wstate.kick * w.kick);
  g.rotation.set(wstate.kick * 0.08 + rl * 0.5 - (sprint ? 0.2 : 0), (sprint ? 0.6 : 0.03), rl * 0.6 + (sprint ? 0.3 : 0));
  g.position.x += Math.sin(time * 1.3) * 0.002; g.position.y += Math.sin(time * 1.7) * 0.002; // idle sway

  if (w.flashT > 0) { w.flashT -= dt; if (w.flashT <= 0) w.flash.visible = false; }
  vmFlashLight.intensity = Math.max(0, vmFlashLight.intensity - dt * 120);
  flashLight.intensity = Math.max(0, flashLight.intensity - dt * 600);

  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i]; s.life -= dt; s.v.y -= 6 * dt; s.m.position.addScaledVector(s.v, dt); s.m.rotation.x += dt * 20; s.m.rotation.y += dt * 13;
    if (s.life <= 0) { vmScene.remove(s.m); shells.splice(i, 1); }
  }

  // crosshair gap
  const moving = (keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD) ? w.moveSpread : 0;
  ui.cross.style.setProperty('--gap', `${6 + (moving + wstate.spreadHeat + (player.onGround ? 0 : 0.04)) * 500}px`);
}

function updateWaves(dt) {
  if (!game.running) return;
  if (game.toSpawn > 0) {
    game.spawnT -= dt;
    const alive = spiders.filter(s => !s.dead).length;
    if (game.spawnT <= 0 && alive < 28) { spawnSpider(game.wave); game.toSpawn--; game.spawnT = Math.max(0.25, 1.4 - game.wave * 0.1); }
  }
  if (!game.bossSpawned && game.wave > 0 && game.toSpawn <= game.waveSize / 2) { game.bossSpawned = true; spawnBoss(game.wave); }
  if (game.toSpawn <= 0 && game.remaining <= 0) {
    if (game.betweenT <= 0) { game.betweenT = 6; if (game.wave > 0) { banner(`WAVE ${game.wave} CLEARED<small>next wave in 6s</small>`); } }
    game.betweenT -= dt;
    if (game.betweenT <= 0.001) startWave();
  }
}

let lastHud = '';
function updateHud() {
  const w = WEAPONS[cur];
  if (game.boss) ui.bossfill.style.width = `${Math.max(0, game.boss.hp / game.boss.maxHp * 100)}%`;
  const s = `${game.wave}|${game.remaining}|${player.kills}|${Math.ceil(player.hp)}|${w.mag}|${w.reserve}|${cur}|${wstate.reloading > 0}|${player.grenades}`;
  if (s !== lastHud) {
    lastHud = s;
    ui.wave.textContent = game.wave; ui.left.textContent = Math.max(0, game.remaining); ui.kills.textContent = player.kills;
    ui.hpfill.style.width = `${player.hp}%`; ui.hptext.textContent = Math.ceil(player.hp);
    ui.mag.textContent = w.mag; ui.mag.classList.toggle('low', w.mag <= Math.ceil(w.magSize * 0.25));
    ui.reserve.textContent = `/ ${w.reserve}`; ui.wname.textContent = w.name;
    ui.nades.textContent = player.grenades; ui.nades.parentElement.classList.toggle('none', player.grenades === 0);
    ui.reloadhint.textContent = wstate.reloading > 0 ? 'RELOADING…' : (w.mag === 0 && w.reserve === 0 ? 'NO AMMO — SWITCH / FIND CRATES' : (w.mag <= w.magSize * 0.25 ? 'PRESS R TO RELOAD' : ''));
  }
  ui.vignette.style.opacity = Math.max(player.hurtT * 0.9, player.hp < 30 ? 0.35 + Math.sin(performance.now() / 250) * 0.1 : 0);
}

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  tick(Math.min(clock.getDelta(), 0.05));
  renderer.clear();
  renderer.render(scene, camera);
  if (game.running || !player.alive) { renderer.clearDepth(); renderer.render(vmScene, vmCamera); }
}
function tick(dt) {
  const active = game.running && !game.paused;
  if (active || !player.alive) {
    game.time += dt;
    const hs = updatePlayer(dt);
    if (active) { updateSpiders(dt, game.time); updateWaves(dt); updatePickups(dt); updateGrenades(dt); }
    else updateSpiders(dt * 0.3, game.time);
    updateWeapon(dt, hs, game.time);
    updateHud();
  } else if (!game.running && player.alive) {
    // menu: slow orbit
    const t = performance.now() / 1000 * 0.05;
    camera.position.set(Math.cos(t) * 6.5, heightAt(Math.cos(t) * 6.5, Math.sin(t) * 6.5) + 2.2, Math.sin(t) * 6.5);
    camera.lookAt(0, 1.2, 0);
    updatePickups(0.016);
    for (const s of spiders) { s.root.rotation.y += dt * 0.3; s.pivot.position.y = Math.abs(Math.sin(performance.now() / 90 + s.phase)) * 0.02 * s.size; }
  }
  updateParticles(dt);
  for (let i = tracers.length - 1; i >= 0; i--) { const t = tracers[i]; t.life -= dt; t.l.material.opacity = Math.max(0, t.life / 0.06) * 0.8; if (t.life <= 0) { scene.remove(t.l); t.l.geometry.dispose(); t.l.material.dispose(); tracers.splice(i, 1); } }

  // spores follow the player
  const sp = spores.geometry.attributes.position, pc = camera.position, tt = performance.now() / 1000;
  for (let i = 0; i < sp.count; i++) {
    let x = sp.getX(i), z = sp.getZ(i);
    if (x - pc.x > 30) x -= 60; else if (x - pc.x < -30) x += 60;
    if (z - pc.z > 30) z -= 60; else if (z - pc.z < -30) z += 60;
    sp.setXYZ(i, x + Math.sin(tt + i) * 0.003, heightAt(x, z) + 0.4 + ((i * 0.37 + tt * 0.1) % 5), z);
  }
  sp.needsUpdate = true;

  sun.position.copy(camera.position).add(SUN_OFFSET); sun.target.position.copy(camera.position);
  scene.userData.sky.position.copy(camera.position);
}

// ============================================================
//  Boot
// ============================================================
(async function boot() {
  try {
    const [sg, rg, pg] = await Promise.all([loadGeo('spider.stl'), loadGeo('m4a1.stl'), loadGeo('m1911.stl')]);
    spiderGeo = sg;
    buildWeapon(WEAPONS[0], rg); buildWeapon(WEAPONS[1], pg);
    // decorative spiders for the menu
    for (let i = 0; i < 5; i++) { const s = makeSpider([0.2, 0.35, 0.5, 0.7, 0.95][i]); const a = i / 5 * 6.28; s.root.position.set(Math.cos(a) * 3, 0, Math.sin(a) * 3); s.root.position.y = heightAt(s.root.position.x, s.root.position.z); s.jumpCd = 999; spiders.push(s); }
    seedPickups();
    ui.loading.classList.add('hidden'); ui.play.classList.remove('hidden');
  } catch (e) {
    console.error(e); ui.loading.textContent = 'Failed to load models: ' + e.message;
  }
  frame();
})();

// expose for debugging
window.__game = { game, player, spiders, WEAPONS, camera, renderer, spawnSpider, makeSpider, heightAt, tick, keys, wstate, pickups, spawnBoss, throwGrenade, grenades, dropPickup };
