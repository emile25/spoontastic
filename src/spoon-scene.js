import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const TABLE_WIDTH = 10.7;
const TABLE_DEPTH = 7;
const FIXED_STEP = 1 / 60;
const FLIGHT_ANGLES = [-60, -48, -36, -24, -12, 12, 24, 36, 48, 60];
const FLIGHT_SPIN_AXES = [
  [0, 0, 1], [1, 0, 0], [0, 1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 1, 0], [-1, 1, 0],
  [0, 1, 1], [0, -1, 1], [1, 1, 1], [-1, 1, 1],
];

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
    this.fallElapsed = 0;
    this.disposed = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#91b1a3');
    this.scene.fog = new THREE.Fog('#91b1a3', 18, 38);
    this.camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 50);
    this.camera.position.set(0, 11, 14);
    this.camera.lookAt(0, 0.35, -0.3);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;

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
    this.scene.add(new THREE.HemisphereLight('#fff8e4', '#497565', 2.25));

    const key = new THREE.DirectionalLight('#fff0ce', 3.6);
    key.position.set(-5, 11, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -12;
    key.shadow.camera.right = 12;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -12;
    key.shadow.bias = -0.0004;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight('#b7e5d7', 1.15);
    fill.position.set(7, 5, -5);
    this.scene.add(fill);
  }

  createEnvironment() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: '#77998c', roughness: 0.96 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.75;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const inlayMaterial = new THREE.MeshStandardMaterial({
      color: '#d58a70',
      roughness: 0.4,
      metalness: 0.22,
      emissive: '#713d2c',
      emissiveIntensity: 0.12,
    });
    const inlay = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.018, 6, 96), inlayMaterial);
    inlay.rotation.x = Math.PI / 2;
    inlay.position.set(0, -1.72, 0);
    this.scene.add(inlay);
  }

  createTable() {
    const wood = new THREE.MeshStandardMaterial({ color: '#8f6046', roughness: 0.62 });
    const trim = new THREE.MeshStandardMaterial({ color: '#d6aa69', metalness: 0.62, roughness: 0.31 });
    const felt = new THREE.MeshStandardMaterial({ color: '#356d60', roughness: 0.9 });

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

    const cloth = new THREE.Mesh(new RoundedBoxGeometry(10.56, 0.035, 6.86, 5, 0.13), felt);
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

    const rimMaterial = new THREE.MeshStandardMaterial({ color: '#547f70', roughness: 0.72 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.038, 8, 36), rimMaterial);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(-4.42, 0.15, -2.72);
    this.scene.add(rim);

    const crystal = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.4, 0),
      new THREE.MeshPhysicalMaterial({ color: '#e08069', roughness: 0.22, metalness: 0.12, clearcoat: 0.8 }),
    );
    crystal.position.set(4.05, 0.52, -2.45);
    crystal.rotation.set(0.2, 0.4, 0.15);
    crystal.castShadow = true;
    this.scene.add(crystal);

    const crystalBase = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.08, 12), trim);
    crystalBase.position.set(4.05, 0.17, -2.45);
    this.scene.add(crystalBase);

    for (let index = 0; index < 3; index += 1) {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.065, 24), trim);
      coin.position.set(3.88 + index * 0.19, 0.19 + index * 0.07, 2.62 - index * 0.07);
      coin.castShadow = true;
      this.scene.add(coin);
    }

    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), trim);
      stud.position.set(Math.cos(angle) * 5.1, 0.12, Math.sin(angle) * 3.25);
      this.scene.add(stud);
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
    this.spoon.rotation.y = -0.12;

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
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.047, 2.4, 20), silver);
    handle.rotation.x = Math.PI / 2;
    handle.position.z = 1.2;
    handle.castShadow = true;
    this.handlePivot.add(handle);

    const handleEnd = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 12), silver);
    handleEnd.scale.set(0.92, 0.54, 1.25);
    handleEnd.position.set(0, 0, 2.36);
    handleEnd.castShadow = true;
    this.handlePivot.add(handleEnd);
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

  resolvePrediction(direction, isCorrect) {
    if (this.phase !== 'ready') return false;

    this.phase = 'bend';
    this.animationDirection = direction === 'left' ? -1 : 1;
    this.flightDirection = isCorrect ? 1 : -1;
    this.animationTime = 0;
    this.fallElapsed = 0;

    return true;
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
    const rotation = this.spoonBody.rotation();
    this.spoon.position.set(position.x, position.y, position.z);
    this.spoon.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    if (this.phase === 'bend') {
      this.animationTime += delta;
      const progress = Math.min(this.animationTime / this.animationDuration, 1);
      const eased = 1 - (1 - progress) ** 3;
      this.bowlPivot.rotation.y = -this.animationDirection * 0.72 * eased;
      if (progress === 1) {
        this.phase = 'flight';
        this.spoonBody.setBodyType(this.rapier.RigidBodyType.KinematicPositionBased, true);
        const angle = FLIGHT_ANGLES[Math.floor(Math.random() * FLIGHT_ANGLES.length)] * Math.PI / 180;
        const launchPower = 10 + Math.random() * 5;
        const exitX = this.flightDirection * (TABLE_WIDTH / 2 + 2);
        const exitZ = Math.sin(angle) * (TABLE_DEPTH / 2);
        const start = new THREE.Vector3(position.x, position.y, position.z);
        const end = new THREE.Vector3(exitX, 0.15, exitZ);
        const control = new THREE.Vector3(
          (start.x + end.x) / 2,
          Math.max(start.y, end.y) + 3.2,
          (start.z + end.z) / 2,
        );
        this.flightCurve = new THREE.QuadraticBezierCurve3(start, control, end);
        this.flightDuration = (12.5 / launchPower) * 1.25;
        this.flightStartRotation = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
        const spinAxis = FLIGHT_SPIN_AXES[Math.floor(Math.random() * FLIGHT_SPIN_AXES.length)];
        this.flightSpinAxis = new THREE.Vector3(...spinAxis).normalize();
        this.flightSpinDirection = Math.random() < 0.5 ? -1 : 1;
        this.fallElapsed = 0;
      }
    } else if (this.phase === 'flight') {
      this.fallElapsed += delta;
      const progress = Math.min(this.fallElapsed / this.flightDuration, 1);
      const point = this.flightCurve.getPoint(progress);
      this.spoonBody.setNextKinematicTranslation({ x: point.x, y: point.y, z: point.z });
      const spin = new THREE.Quaternion().setFromAxisAngle(
        this.flightSpinAxis,
        this.fallElapsed * this.flightSpinDirection * 8,
      );
      const flightRotation = this.flightStartRotation.clone().multiply(spin);
      this.spoonBody.setNextKinematicRotation({
        x: flightRotation.x,
        y: flightRotation.y,
        z: flightRotation.z,
        w: flightRotation.w,
      });
      if (progress === 1 && position.x * this.flightDirection >= TABLE_WIDTH / 2 + 1.5) {
        this.finishRound();
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  finishRound() {
    if (this.phase === 'ready') return;
    this.phase = 'ready';
    this.world.removeRigidBody(this.spoonBody);
    this.scene.remove(this.spoon);
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
    this.renderer.dispose();
    this.world.free();
  }
}