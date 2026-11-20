import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const TABLE_WIDTH = 10.7;
const TABLE_DEPTH = 7;
const FIXED_STEP = 1 / 60;
const DISSOLVE_DELAY = 0.5;
const SPOON_HIDE_DURATION = 0.1;
const PARTICLE_COUNT = 200;
const ACCENT_PARTICLE_COUNT = 24;
const HANDLE_END_PARTICLE_COUNT = 12;
const SPOON_NECK_LENGTH = 0.55;

function getNeckOffset(distance, bendAngle) {
  if (distance < 0) {
    return {
      y: -Math.sin(bendAngle) * distance,
      z: Math.cos(bendAngle) * distance,
      angle: bendAngle,
    };
  }

  const curvedDistance = Math.min(distance, SPOON_NECK_LENGTH);
  const steps = Math.ceil(curvedDistance / 0.025);
  const stepLength = steps > 0 ? curvedDistance / steps : 0;
  let offsetY = 0;
  let offsetZ = 0;

  for (let step = 0; step < steps; step += 1) {
    const midpoint = (step + 0.5) * stepLength / SPOON_NECK_LENGTH;
    const eased = midpoint * midpoint * (3 - 2 * midpoint);
    const angle = bendAngle * (1 - eased);
    offsetY -= Math.sin(angle) * stepLength;
    offsetZ += Math.cos(angle) * stepLength;
  }

  const progress = curvedDistance / SPOON_NECK_LENGTH;
  const eased = progress * progress * (3 - 2 * progress);
  return {
    y: offsetY,
    z: offsetZ + Math.max(distance - SPOON_NECK_LENGTH, 0),
    angle: bendAngle * (1 - eased),
  };
}

function makeBowlGeometry() {
  const widthSegments = 24;
  const lengthSegments = 32;
  const positions = [];
  const indices = [];

  for (let lengthIndex = 0; lengthIndex <= lengthSegments; lengthIndex += 1) {
    const alongBowl = lengthIndex / lengthSegments;
    const halfWidth = 0.025 + Math.sin(Math.PI * alongBowl) ** 0.72 * 0.27;
    for (let widthIndex = 0; widthIndex <= widthSegments; widthIndex += 1) {
      const acrossBowl = (widthIndex / widthSegments) * 2 - 1;
      positions.push(
        acrossBowl * halfWidth,
        0.025 - (1 - acrossBowl * acrossBowl) * 0.075,
        -1.16 * alongBowl,
      );
    }
  }

  for (let lengthIndex = 0; lengthIndex < lengthSegments; lengthIndex += 1) {
    for (let widthIndex = 0; widthIndex < widthSegments; widthIndex += 1) {
      const current = lengthIndex * (widthSegments + 1) + widthIndex;
      const next = current + widthSegments + 1;
      indices.push(current, next, current + 1, next, next + 1, current + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeCurtainGeometry(width = 18, height = 9) {
  const geometry = new THREE.PlaneGeometry(width, height, Math.ceil(width * 2.7), 1);
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    positions.setZ(index, Math.cos((x + width / 2) * Math.PI * 2 / 1.8) * 0.14);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export class SpoonScene {
  static async create(canvas, onReady) {
    const { default: rapier } = await import('@dimforge/rapier3d-compat');
    await rapier.init();
    return new SpoonScene(canvas, onReady, rapier);
  }

  constructor(canvas, onReady, rapier) {
    this.canvas = canvas;
    this.onReady = onReady;
    this.rapier = rapier;
    this.clock = new THREE.Timer();
    this.clock.connect(document);
    this.accumulator = 0;
    this.phase = 'ready';
    this.animationTime = 0;
    this.animationDuration = 1.05;
    this.animationDirection = 1;
    this.phaseElapsed = 0;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.dissolveDuration = this.reducedMotion ? 0.45 : 0.7;
    this.particleSpread = this.reducedMotion ? 0.45 : 1;
    this.spoonMaterials = [];
    this.dissolveParticles = [];
    this.disposed = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#120d1b');
    this.scene.fog = new THREE.Fog('#120d1b', 18, 38);
    this.camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 50);
    this.camera.position.set(0, 11, 14);
    this.camera.lookAt(0, 0.35, -0.3);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;

    this.createLights();
    this.createEnvironment();
    this.createTable();
    this.createPhysics();
    this.createSpoon();
    this.bindSwipeInput();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();
    this.renderer.setAnimationLoop(() => this.update());
  }

  bindSwipeInput() {
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pointerWorld = new THREE.Vector3();
    this.tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.15);
    this.pointerStart = null;

    this.handlePointerDown = (event) => {
      if (this.phase !== 'ready' || event.button !== 0) return;
      const bounds = this.canvas.getBoundingClientRect();
      this.pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const point = this.raycaster.ray.intersectPlane(this.tablePlane, this.pointerWorld);
      if (!point || Math.abs(point.x) > TABLE_WIDTH / 2 || Math.abs(point.z) > TABLE_DEPTH / 2) return;

      this.pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
      this.canvas.setPointerCapture(event.pointerId);
    };

    this.handlePointerUp = (event) => {
      if (!this.pointerStart || this.pointerStart.id !== event.pointerId) return;
      const deltaX = event.clientX - this.pointerStart.x;
      const deltaY = event.clientY - this.pointerStart.y;
      this.pointerStart = null;

      if (Math.abs(deltaX) < 30 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
      this.onSwipe?.(deltaX < 0 ? 'left' : 'right');
    };

    this.handlePointerCancel = () => { this.pointerStart = null; };
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel);
  }

  createLights() {
    this.scene.add(new THREE.HemisphereLight('#f5dfc4', '#261734', 1.45));

    const key = new THREE.DirectionalLight('#ffd6a0', 2.6);
    key.position.set(-5, 11, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -12;
    key.shadow.camera.right = 12;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -12;
    key.shadow.bias = -0.0004;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight('#9d7bc5', 0.72);
    fill.position.set(7, 5, -5);
    this.scene.add(fill);
  }

  createEnvironment() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: '#17101f', roughness: 0.96 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.75;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const curtainMaterial = new THREE.MeshStandardMaterial({
      color: '#4b3157',
      roughness: 0.98,
      side: THREE.DoubleSide,
      emissive: '#1b1024',
      emissiveIntensity: 0.35,
    });
    const curtain = new THREE.Mesh(makeCurtainGeometry(), curtainMaterial);
    curtain.position.set(0, 2.7, -4.85);
    curtain.receiveShadow = true;
    this.scene.add(curtain);

    for (const side of [-1, 1]) {
      const sideCurtain = new THREE.Mesh(makeCurtainGeometry(13, 9), curtainMaterial);
      sideCurtain.position.set(side * 6.35, 2.7, 0);
      sideCurtain.rotation.y = -side * Math.PI / 2;
      sideCurtain.receiveShadow = true;
      this.scene.add(sideCurtain);
    }

    const inlayMaterial = new THREE.MeshStandardMaterial({
      color: '#a47bb6',
      roughness: 0.45,
      metalness: 0.3,
      emissive: '#40234f',
      emissiveIntensity: 0.22,
    });
    const inlay = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.018, 6, 96), inlayMaterial);
    inlay.rotation.x = Math.PI / 2;
    inlay.position.set(0, -1.72, 0);
    this.scene.add(inlay);

    this.createWallDecor();
  }

  createWallDecor() {
    this.createWallLantern(-1.85, 0.65, -4.5, 0.82);
    this.createWallLantern(1.1, 0.42, -4.5, 1.08);
    this.createWallLantern(3.5, 0.55, -4.5, 0.72);
    this.createWallMask(-3.55, 0.65, -4.48, '#bd795f', -0.18, 0.88);
    this.createWallMask(-0.15, 0.65, -4.48, '#c6a45f', 0.06, 1.04);
    this.createWallMask(2.75, 0.45, -4.48, '#568e8d', 0.2, 0.82);
    this.createWallShelf(-5.05, 0.62, -4.4);
    this.createWallMirror(4.62, 0.55, -4.42);
  }

  createWallLantern(x, y, z, scale) {
    const lantern = new THREE.Group();
    lantern.position.set(x, y, z);
    lantern.scale.setScalar(scale);

    const brass = new THREE.MeshStandardMaterial({ color: '#b88e56', metalness: 0.72, roughness: 0.25 });
    const glow = new THREE.MeshStandardMaterial({
      color: '#ffd36e',
      emissive: '#ffac35',
      emissiveIntensity: 2,
      roughness: 0.3,
    });

    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.65, 6), brass);
    chain.position.y = 0.49;
    lantern.add(chain);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.16, 8), brass);
    cap.position.y = 0.09;
    lantern.add(cap);

    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), glow);
    core.position.y = -0.18;
    lantern.add(core);

    for (const radius of [0.2, 0.29]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.018, 6, 18), brass);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.18;
      lantern.add(ring);
    }

    const base = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.15, 8), brass);
    base.rotation.z = Math.PI;
    base.position.y = -0.46;
    lantern.add(base);
    this.scene.add(lantern);

    const light = new THREE.PointLight('#ffc65c', 1.25 * scale, 6 * scale, 2);
    light.position.set(x, y - 0.18 * scale, z);
    this.scene.add(light);
  }

  createWallMask(x, y, z, color, rotation, scale) {
    const mask = new THREE.Group();
    mask.position.set(x, y, z);
    mask.rotation.z = rotation;
    mask.scale.setScalar(scale);

    const faceMaterial = new THREE.MeshStandardMaterial({ color, metalness: 0.18, roughness: 0.58 });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: '#21152a', roughness: 0.9 });
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: '#d8b574',
      metalness: 0.5,
      roughness: 0.3,
      emissive: '#402c25',
      emissiveIntensity: 0.25,
    });

    const face = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), faceMaterial);
    face.scale.set(0.76, 1, 0.3);
    face.castShadow = true;
    mask.add(face);

    for (const eyeX of [-0.105, 0.105]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), darkMaterial);
      eye.scale.set(1, 0.75, 0.55);
      eye.position.set(eyeX, 0.04, 0.092);
      mask.add(eye);
    }

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), accentMaterial);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.08, 0.12);
    mask.add(nose);

    const foreheadGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), accentMaterial);
    foreheadGem.position.set(0, 0.22, 0.11);
    mask.add(foreheadGem);

    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.025), darkMaterial);
    mouth.position.set(0, -0.22, 0.095);
    mask.add(mouth);
    this.scene.add(mask);
  }

  createWallShelf(x, y, z) {
    const shelf = new THREE.Group();
    shelf.position.set(x, y, z);

    const wood = new THREE.MeshStandardMaterial({ color: '#70485f', roughness: 0.7 });
    const brass = new THREE.MeshStandardMaterial({ color: '#b88e56', metalness: 0.65, roughness: 0.32 });
    const board = new THREE.Mesh(new RoundedBoxGeometry(1.65, 0.12, 0.38, 3, 0.045), wood);
    board.position.z = 0.12;
    board.castShadow = true;
    shelf.add(board);

    for (const supportX of [-0.55, 0.55]) {
      const support = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 6), brass);
      support.position.set(supportX, -0.18, 0.1);
      shelf.add(support);
    }

    const bookColors = ['#7e5265', '#4d617a', '#9c754d'];
    for (let index = 0; index < bookColors.length; index += 1) {
      const book = new THREE.Mesh(
        new RoundedBoxGeometry(0.19, 0.38, 0.22, 2, 0.025),
        new THREE.MeshStandardMaterial({ color: bookColors[index], roughness: 0.72 }),
      );
      book.position.set(-0.49 + index * 0.22, 0.23, 0.1);
      book.rotation.z = (index - 1) * 0.08;
      book.castShadow = true;
      shelf.add(book);
    }

    const bottleMaterial = new THREE.MeshPhysicalMaterial({
      color: '#65a3a0',
      roughness: 0.2,
      metalness: 0.08,
      clearcoat: 0.8,
      emissive: '#1d4947',
      emissiveIntensity: 0.35,
    });
    const bottle = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), bottleMaterial);
    bottle.scale.set(0.82, 1.05, 0.72);
    bottle.position.set(0.48, 0.14, 0.1);
    bottle.castShadow = true;
    shelf.add(bottle);

    const bottleNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.12, 8), bottleMaterial);
    bottleNeck.position.set(0.48, 0.28, 0.1);
    shelf.add(bottleNeck);
    this.scene.add(shelf);
  }

  createWallMirror(x, y, z) {
    const mirror = new THREE.Group();
    mirror.position.set(x, y, z);

    const frameMaterial = new THREE.MeshStandardMaterial({ color: '#c7a26e', metalness: 0.72, roughness: 0.26 });
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: '#516879',
      metalness: 0.62,
      roughness: 0.16,
      clearcoat: 1,
      emissive: '#1c2739',
      emissiveIntensity: 0.4,
    });
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.075, 8, 32), frameMaterial);
    mirror.add(frame);

    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.46, 32), glassMaterial);
    glass.position.z = 0.012;
    mirror.add(glass);

    const centerGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.085, 0), frameMaterial);
    centerGem.position.set(0, 0.2, 0.04);
    mirror.add(centerGem);
    this.scene.add(mirror);
  }

  createTable() {
    const wood = new THREE.MeshStandardMaterial({ color: '#38233f', roughness: 0.68 });
    const trim = new THREE.MeshStandardMaterial({ color: '#c7a26e', metalness: 0.62, roughness: 0.31 });
    const felt = new THREE.MeshStandardMaterial({ color: '#492f66', roughness: 0.94 });

    const apron = new THREE.Mesh(new RoundedBoxGeometry(11.05, 0.52, 7.34, 5, 0.18), wood);
    apron.position.y = -0.25;
    apron.castShadow = true;
    apron.receiveShadow = true;
    this.scene.add(apron);

    const tabletop = new THREE.Mesh(new RoundedBoxGeometry(TABLE_WIDTH, 0.13, TABLE_DEPTH, 5, 0.14), felt);
    tabletop.position.y = 0.075;
    tabletop.castShadow = true;
    tabletop.receiveShadow = true;
    this.scene.add(tabletop);

    const border = new THREE.Mesh(new RoundedBoxGeometry(10.76, 0.024, 7.06, 5, 0.14), trim);
    border.position.y = 0.035;
    border.receiveShadow = true;
    this.scene.add(border);

    const clothMaterial = new THREE.MeshStandardMaterial({ color: '#573772', roughness: 0.96 });
    const cloth = new THREE.Mesh(new RoundedBoxGeometry(10.56, 0.035, 6.86, 5, 0.13), clothMaterial);
    cloth.position.y = 0.12;
    cloth.receiveShadow = true;
    this.scene.add(cloth);

    for (const x of [-4.25, 4.25]) {
      for (const z of [-2.8, 2.8]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.53, 12), wood);
        leg.position.set(x, -1.1, z);
        leg.castShadow = true;
        this.scene.add(leg);

        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.29, 0.13, 12), trim);
        foot.position.set(x, -1.78, z);
        this.scene.add(foot);
      }
    }

    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), trim);
      stud.position.set(Math.cos(angle) * 5.1, 0.12, Math.sin(angle) * 3.25);
      this.scene.add(stud);
    }

    this.createCandle(-4.35, -0.85, 0.82);
    this.createCandle(4.4, 0.3, 1);
    this.createCandle(-2.35, 2.62, 0.68);
    this.createSkull(4.12, 2.38, -0.22);
    this.createCrystalBall(-4.3, -2.35, 0.78);
    this.createCrystalBall(3.55, -1.55, 0.68);
    this.createOracleCards(-2.75, -2.56);
  }

  createCandle(x, z, scale) {
    const candle = new THREE.Group();
    candle.position.set(x, 0.14, z);
    candle.scale.setScalar(scale);

    const brass = new THREE.MeshStandardMaterial({ color: '#b88e56', metalness: 0.7, roughness: 0.28 });
    const wax = new THREE.MeshStandardMaterial({ color: '#d6c2a8', roughness: 0.86 });
    const flame = new THREE.MeshStandardMaterial({
      color: '#ffc16e',
      emissive: '#ff7a35',
      emissiveIntensity: 1.8,
      roughness: 0.42,
    });

    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.08, 12), brass);
    holder.position.y = 0.04;
    holder.castShadow = true;
    candle.add(holder);

    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.44, 10), wax);
    pillar.position.y = 0.3;
    pillar.castShadow = true;
    candle.add(pillar);

    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.07, 6), brass);
    wick.position.y = 0.56;
    candle.add(wick);

    const flameMesh = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.18, 7), flame);
    flameMesh.position.y = 0.68;
    candle.add(flameMesh);
    this.scene.add(candle);

    const glow = new THREE.PointLight('#ffb56e', 0.9, 4, 2);
    glow.position.set(x, 0.9 * scale, z);
    this.scene.add(glow);
  }

  createSkull(x, z, rotation) {
    const skull = new THREE.Group();
    skull.position.set(x, 0.14, z);
    skull.rotation.y = rotation;

    const bone = new THREE.MeshStandardMaterial({ color: '#d8cbb5', roughness: 0.78 });
    const cavity = new THREE.MeshStandardMaterial({ color: '#23182e', roughness: 0.94 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8), bone);
    head.scale.set(0.83, 1, 0.76);
    head.position.y = 0.29;
    head.castShadow = true;
    skull.add(head);

    const jaw = new THREE.Mesh(new RoundedBoxGeometry(0.25, 0.13, 0.19, 3, 0.035), bone);
    jaw.position.set(0, 0.12, 0.055);
    jaw.castShadow = true;
    skull.add(jaw);

    for (const xOffset of [-0.075, 0.075]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.066, 10, 8), cavity);
      eye.scale.set(1, 0.88, 0.54);
      eye.position.set(xOffset, 0.31, 0.154);
      skull.add(eye);
    }

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.075, 3), cavity);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.21, 0.19);
    skull.add(nose);
    this.scene.add(skull);
  }

  createCrystalBall(x, z, scale) {
    const stand = new THREE.Group();
    stand.position.set(x, 0.14, z);
    stand.scale.setScalar(scale);

    const brass = new THREE.MeshStandardMaterial({ color: '#c7a26e', metalness: 0.72, roughness: 0.24 });
    const orbMaterial = new THREE.MeshPhysicalMaterial({
      color: '#9e7bd4',
      roughness: 0.12,
      metalness: 0.12,
      clearcoat: 1,
      emissive: '#382052',
      emissiveIntensity: 0.32,
    });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.29, 0.1, 12), brass);
    base.position.y = 0.05;
    base.castShadow = true;
    stand.add(base);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.16, 0.2, 10), brass);
    stem.position.y = 0.18;
    stand.add(stem);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 7, 24), brass);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    stand.add(ring);

    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.29, 20, 14), orbMaterial);
    orb.position.y = 0.5;
    orb.castShadow = true;
    stand.add(orb);

    const highlight = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#f0dfff' }),
    );
    highlight.position.set(-0.105, 0.61, 0.225);
    stand.add(highlight);
    this.scene.add(stand);

    const glow = new THREE.PointLight('#a982e8', 0.55, 3.2, 2);
    glow.position.set(x, 0.68 * scale, z);
    this.scene.add(glow);
  }

  createOracleCards(x, z) {
    const gold = new THREE.MeshStandardMaterial({ color: '#c7a26e', metalness: 0.48, roughness: 0.42 });
    const ink = new THREE.MeshStandardMaterial({ color: '#30203e', roughness: 0.8 });
    const emblem = new THREE.MeshStandardMaterial({ color: '#d9bb7b', metalness: 0.42, roughness: 0.35 });

    for (let index = 0; index < 3; index += 1) {
      const card = new THREE.Group();
      card.position.set(x + (index - 1) * 0.34, 0.16 + index * 0.006, z + (index - 1) * 0.055);
      card.rotation.y = (index - 1) * 0.22;

      const border = new THREE.Mesh(new RoundedBoxGeometry(0.48, 0.035, 0.68, 3, 0.035), gold);
      border.castShadow = true;
      card.add(border);

      const face = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.012, 0.64, 3, 0.028), ink);
      face.position.y = 0.022;
      card.add(face);

      const symbol = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 6, 18), emblem);
      symbol.rotation.x = Math.PI / 2;
      symbol.position.y = 0.034;
      card.add(symbol);

      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), emblem);
      star.position.set(0, 0.078, 0);
      card.add(star);
      this.scene.add(card);
    }
  }

  createPhysics() {
    this.world = new this.rapier.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_STEP;

    const tableBody = this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed());
    this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(TABLE_WIDTH / 2, 0.065, TABLE_DEPTH / 2).setTranslation(0, 0.075, 0),
      tableBody,
    );

    const floorBody = this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed());
    this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(40, 0.15, 40).setTranslation(0, -1.9, 0),
      floorBody,
    );
  }

  createSpoon() {
    this.spoon = new THREE.Group();
    this.spoon.rotation.set(Math.PI / 2, 0, 0);
    this.spoon.rotateZ(Math.PI / 2);
    this.spoon.scale.setScalar(0.82);
    this.spoon.position.z = 0.15;
    this.spoon.position.y = 2.05;

    const silver = new THREE.MeshStandardMaterial({ color: '#dce4dc', metalness: 0.88, roughness: 0.2 });
    const darkSilver = new THREE.MeshStandardMaterial({ color: '#8da49a', metalness: 0.78, roughness: 0.24 });
    this.bowlPivot = new THREE.Group();
    this.bowlPivot.position.set(0, 0.012, -0.58);
    this.spoon.add(this.bowlPivot);

    const bowl = new THREE.Mesh(makeBowlGeometry(), silver);
    bowl.castShadow = true;
    bowl.receiveShadow = true;
    this.bowlPivot.add(bowl);

    const bowlBacking = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), silver);
    bowlBacking.scale.set(0.28, 0.07, 0.58);
    bowlBacking.position.set(0, -0.04, -0.58);
    bowlBacking.castShadow = true;
    this.bowlPivot.add(bowlBacking);

    const bowlInner = new THREE.Mesh(makeBowlGeometry(), darkSilver);
    bowlInner.scale.set(0.82, 1, 0.82);
    bowlInner.position.y = 0.01;
    this.bowlPivot.add(bowlInner);

    this.handlePivot = new THREE.Group();
    this.handlePivot.position.set(0, 0.012, -0.58);
    const handleGeometry = new THREE.CylinderGeometry(0.09, 0.047, 2.55, 20, 36);
    handleGeometry.rotateX(Math.PI / 2);
    const handle = new THREE.Mesh(handleGeometry, silver);
    handle.position.z = 1.125;
    handle.castShadow = true;
    this.handlePivot.add(handle);
    this.handle = handle;
    this.handleBasePositions = new Float32Array(handleGeometry.getAttribute('position').array);
    this.handleBaseNormals = new Float32Array(handleGeometry.getAttribute('normal').array);

    const handleEnd = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 12), silver);
    handleEnd.name = 'spoon-handle-end';
    handleEnd.scale.set(0.92, 0.54, 1.25);
    handleEnd.position.set(0, 0, 2.36);
    handleEnd.castShadow = true;
    this.handlePivot.add(handleEnd);
    this.handleEnd = handleEnd;
    this.spoon.add(this.handlePivot);

    this.spoon.position.y = 0.21;
    this.scene.add(this.spoon);
    this.createSpoonBody();
  }

  createSpoonBody() {
    this.spoonBody = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.dynamic()
        .setTranslation(0, 0.2, 0)
        .setLinearDamping(0.65)
        .setAngularDamping(0.8),
    );
    this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(0.2, 0.055, 1.55).setDensity(0.7).setRestitution(0.12).setFriction(0.72),
      this.spoonBody,
    );
    this.spoonBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.spoonBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.spoonBody.setBodyType(this.rapier.RigidBodyType.KinematicPositionBased, true);
    this.spoonBody.setNextKinematicTranslation({ x: 0, y: 0.2, z: 0 });
  }

  resolvePrediction(direction) {
    if (this.phase !== 'ready') return false;

    this.phase = 'bend';
    this.animationDirection = direction === 'left' ? -1 : 1;
    this.animationTime = 0;
    this.phaseElapsed = 0;

    return true;
  }

  updateHandleBend(bendAngle) {
    const geometry = this.handle.geometry;
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');

    for (let index = 0; index < positions.count; index += 1) {
      const offset = index * 3;
      const distance = this.handleBasePositions[offset + 2] + 1.125;
      const neck = getNeckOffset(distance, bendAngle);
      const cosine = Math.cos(neck.angle);
      const sine = Math.sin(neck.angle);
      const radialY = this.handleBasePositions[offset + 1];
      const normalY = this.handleBaseNormals[offset + 1];
      const normalZ = this.handleBaseNormals[offset + 2];

      positions.array[offset] = this.handleBasePositions[offset];
      positions.array[offset + 1] = neck.y + radialY * cosine;
      positions.array[offset + 2] = neck.z - 1.125 + radialY * sine;
      normals.array[offset] = this.handleBaseNormals[offset];
      normals.array[offset + 1] = normalY * cosine - normalZ * sine;
      normals.array[offset + 2] = normalY * sine + normalZ * cosine;
    }

    positions.needsUpdate = true;
    normals.needsUpdate = true;
    geometry.computeBoundingSphere();

    const handleEndOffset = getNeckOffset(2.36, bendAngle);
    this.handleEnd.position.set(0, handleEndOffset.y, handleEndOffset.z);
  }

  startDissolve() {
    this.phase = 'dissolve';
    this.phaseElapsed = 0;
    this.spoonMaterials = [];
    this.spoon.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (this.spoonMaterials.includes(material)) continue;
        material.transparent = true;
        material.depthWrite = false;
        material.needsUpdate = true;
        this.spoonMaterials.push(material);
      }
    });

    this.spoon.updateMatrixWorld(true);
    const meshes = [];
    this.spoon.traverse((object) => {
      if (object.isMesh && object.geometry.getAttribute('position')) meshes.push(object);
    });
    const handleEnd = meshes.find((mesh) => mesh.name === 'spoon-handle-end');
    const bodyMeshes = meshes.filter((mesh) => mesh !== handleEnd);
    const handleEndStart = PARTICLE_COUNT - HANDLE_END_PARTICLE_COUNT;

    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const velocities = new Float32Array(PARTICLE_COUNT * 3);
    const colorIndices = new Uint8Array(PARTICLE_COUNT);
    const center = this.spoon.getWorldPosition(new THREE.Vector3());
    const particleColors = ['#f0e2c5', '#48a443', '#dc5147', '#3e75c4'];
    const point = new THREE.Vector3();
    const vertexA = new THREE.Vector3();
    const vertexB = new THREE.Vector3();
    const vertexC = new THREE.Vector3();
    const velocity = new THREE.Vector3();

    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      colorIndices[index] = index < ACCENT_PARTICLE_COUNT ? index % 3 + 1 : 0;
      const mesh = handleEnd && index >= handleEndStart
        ? handleEnd
        : bodyMeshes[index % bodyMeshes.length];
      const geometry = mesh.geometry;
      const vertices = geometry.getAttribute('position');
      const indices = geometry.getIndex();
      const triangleCount = (indices ? indices.count : vertices.count) / 3;
      const triangleStart = Math.floor(Math.random() * triangleCount) * 3;
      const vertexIndexA = indices ? indices.getX(triangleStart) : triangleStart;
      const vertexIndexB = indices ? indices.getX(triangleStart + 1) : triangleStart + 1;
      const vertexIndexC = indices ? indices.getX(triangleStart + 2) : triangleStart + 2;
      vertexA.fromBufferAttribute(vertices, vertexIndexA);
      vertexB.fromBufferAttribute(vertices, vertexIndexB);
      vertexC.fromBufferAttribute(vertices, vertexIndexC);

      let barycentricA = Math.random();
      let barycentricB = Math.random();
      if (barycentricA + barycentricB > 1) {
        barycentricA = 1 - barycentricA;
        barycentricB = 1 - barycentricB;
      }
      point.copy(vertexA).multiplyScalar(1 - barycentricA - barycentricB)
        .addScaledVector(vertexB, barycentricA)
        .addScaledVector(vertexC, barycentricB)
        .applyMatrix4(mesh.matrixWorld);
      positions.set(point.toArray(), index * 3);

      velocity.copy(point).sub(center);
      if (velocity.lengthSq() < 0.0001) {
        velocity.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      }
      velocity.normalize().multiplyScalar((0.45 + Math.random() * 0.55) * this.particleSpread);
      velocity.add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.2 * this.particleSpread,
        (Math.random() - 0.5) * 0.2 * this.particleSpread,
        (Math.random() - 0.5) * 0.16 * this.particleSpread,
      ));
      velocities.set(velocity.toArray(), index * 3);
    }

    this.dissolveParticles = [];
    for (let colorIndex = 0; colorIndex < particleColors.length; colorIndex += 1) {
      const particleIndices = [];
      for (let index = 0; index < PARTICLE_COUNT; index += 1) {
        if (colorIndices[index] === colorIndex) particleIndices.push(index);
      }

      const groupPositions = new Float32Array(particleIndices.length * 3);
      const groupVelocities = new Float32Array(particleIndices.length * 3);
      for (let index = 0; index < particleIndices.length; index += 1) {
        const particleIndex = particleIndices[index];
        groupPositions.set(positions.subarray(particleIndex * 3, particleIndex * 3 + 3), index * 3);
        groupVelocities.set(velocities.subarray(particleIndex * 3, particleIndex * 3 + 3), index * 3);
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(groupPositions, 3));
      const material = new THREE.PointsMaterial({
        color: particleColors[colorIndex],
        size: colorIndex === 0 ? 2.5 : 3.5,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        toneMapped: false,
      });
      const particles = new THREE.Points(geometry, material);
      particles.userData.velocities = groupVelocities;
      this.dissolveParticles.push(particles);
      this.scene.add(particles);
    }
  }

  updateDissolve(delta) {
    this.phaseElapsed += delta;
    const hideProgress = Math.min(this.phaseElapsed / SPOON_HIDE_DURATION, 1);
    for (const material of this.spoonMaterials) {
      material.opacity = 1 - hideProgress;
    }
    if (hideProgress === 1) this.removeSpoonModel();

    for (const particles of this.dissolveParticles) {
      const positions = particles.geometry.getAttribute('position');
      const velocities = particles.userData.velocities;
      for (let index = 0; index < positions.count; index += 1) {
        positions.array[index * 3] += velocities[index * 3] * delta;
        positions.array[index * 3 + 1] += velocities[index * 3 + 1] * delta;
        positions.array[index * 3 + 2] += velocities[index * 3 + 2] * delta;
      }
      positions.needsUpdate = true;
      particles.material.opacity = 1 - Math.min(this.phaseElapsed / this.dissolveDuration, 1);
    }

    if (this.phaseElapsed >= this.dissolveDuration) this.finishRound();
  }

  removeSpoonModel() {
    if (!this.spoon) return;
    this.scene.remove(this.spoon);

    const geometries = new Set();
    const materials = new Set();
    this.spoon.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (!object.material) return;
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of objectMaterials) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();

    this.spoon = null;
    this.spoonMaterials = [];
    this.handle = null;
    this.handleEnd = null;
    this.handleBasePositions = null;
    this.handleBaseNormals = null;
  }

  removeDissolveParticles() {
    for (const particles of this.dissolveParticles) {
      this.scene.remove(particles);
      particles.geometry.dispose();
      particles.material.dispose();
    }
    this.dissolveParticles = [];
  }

  update() {
    if (this.disposed) return;
    this.clock.update();
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.accumulator += delta;
    while (this.accumulator >= FIXED_STEP) {
      this.world.step();
      this.accumulator -= FIXED_STEP;
    }

    const position = this.spoonBody.translation();
    if (this.spoon) this.spoon.position.set(position.x, 2.05, position.z);

    if (this.phase === 'bend') {
      this.animationTime += delta;
      const progress = Math.min(this.animationTime / this.animationDuration, 1);
      const eased = 1 - (1 - progress) ** 3;
      const bendAngle = -this.animationDirection * 0.72 * eased;
      this.bowlPivot.rotation.x = bendAngle;
      this.updateHandleBend(bendAngle);
      if (progress === 1) {
        this.phase = 'pause';
        this.phaseElapsed = 0;
      }
    } else if (this.phase === 'pause') {
      this.phaseElapsed += delta;
      if (this.phaseElapsed >= DISSOLVE_DELAY) this.startDissolve();
    } else if (this.phase === 'dissolve') {
      this.updateDissolve(delta);
    }

    this.renderer.render(this.scene, this.camera);
  }

  finishRound() {
    if (this.phase === 'ready') return;
    this.phase = 'ready';
    this.world.removeRigidBody(this.spoonBody);
    this.removeSpoonModel();
    this.removeDissolveParticles();
    this.createSpoon();
    this.onReady?.();
  }

  resize() {
    const { width, height } = this.canvas.parentElement.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;

    const aspect = width / height;
    const viewHeight = (TABLE_WIDTH + 0.5) / aspect;
    this.camera.left = -(viewHeight * aspect) / 2;
    this.camera.right = (viewHeight * aspect) / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.clock.dispose();
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    this.removeSpoonModel();
    this.removeDissolveParticles();
    this.renderer.dispose();
    this.world.free();
  }
}