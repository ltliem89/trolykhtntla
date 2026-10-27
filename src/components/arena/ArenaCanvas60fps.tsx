import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ArenaQuestionGate, ArenaSectorConfig } from '../../data/arenaEncountersData';
import { soundEngine } from '../../utils/soundEngine';

export type ArenaCameraPreset = 'TACTICAL' | 'CHASE' | 'INSPECT';

export interface ArenaHudSnapshot {
  hp: number;
  maxHp: number;
  bossHp: number;
  bossMaxHp: number;
  score: number;
  combo: number;
  wave: number;
  energyCharge: number; // 0..100
  crystalsCollected: number;
  activeGate: ArenaQuestionGate | null;
}

export interface ArenaCanvasBridge {
  triggerGateAnswer: (choiceIdx: number) => void;
  resetSession: (sector: ArenaSectorConfig) => void;
  setCameraPreset: (preset: ArenaCameraPreset) => void;
  setInspectionFactor: (factor: number) => void;
}

interface ArenaCanvas60fpsProps {
  mode: 'TITLE_SCREEN' | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'GAME_OVER';
  sector: ArenaSectorConfig;
  onHudUpdate: (snapshot: ArenaHudSnapshot) => void;
  onGateResolved: (gate: ArenaQuestionGate, isCorrect: boolean, chosenIndex: number) => void;
  onGameEnd: (victory: boolean, finalScore: number, waveReached: number) => void;
  onTogglePause: () => void;
  onToggleMute: () => void;
  bridgeRef: React.MutableRefObject<ArenaCanvasBridge | null>;
}

// --- MODULE-SCOPE PRE-ALLOCATED SCRATCH OBJECTS (ZERO PER-FRAME GC CHURN) ---
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3CamTarget = new THREE.Vector3();
const _vec3LookAt = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _color = new THREE.Color();

// World coordinate playfield bounds (in 3D meters: X in [-24, 24], Z in [-16, 16])
const WORLD_HALF_W = 22;
const WORLD_HALF_D = 14.5;

function createProceduralGridTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#071422';
  g.fillRect(0, 0, 512, 512);

  // Subtle sub-grid
  g.strokeStyle = 'rgba(56, 189, 248, 0.08)';
  g.lineWidth = 1;
  for (let i = 0; i <= 512; i += 64) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 512);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(512, i);
    g.stroke();
  }

  // Primary coordinate lines
  g.strokeStyle = 'rgba(16, 185, 129, 0.22)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 512, 512);

  // Crosshair accents at intersections
  g.fillStyle = 'rgba(56, 189, 248, 0.35)';
  g.fillRect(252, 255, 8, 2);
  g.fillRect(255, 252, 2, 8);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 12);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.24)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createFormulaBadgeTexture(text: string, borderHex: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 96);

  g.fillStyle = 'rgba(8, 21, 35, 0.92)';
  g.strokeStyle = borderHex;
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect(8, 12, 240, 72, 16);
  g.fill();
  g.stroke();

  g.fillStyle = '#F8FAFC';
  g.font = '700 28px "JetBrains Mono", monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 48);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const ArenaCanvas60fps: React.FC<ArenaCanvas60fpsProps> = React.memo(
  ({
    mode,
    sector,
    onHudUpdate,
    onGateResolved,
    onGameEnd,
    onTogglePause,
    onToggleMute,
    bridgeRef,
  }) => {
    const mountRef = useRef<HTMLDivElement | null>(null);

    const modeRef = useRef(mode);
    modeRef.current = mode;

    const sectorRef = useRef(sector);
    sectorRef.current = sector;

    const callbacksRef = useRef({
      onHudUpdate,
      onGateResolved,
      onGameEnd,
      onTogglePause,
      onToggleMute,
    });
    callbacksRef.current = {
      onHudUpdate,
      onGateResolved,
      onGameEnd,
      onTogglePause,
      onToggleMute,
    };

    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      // 1. WebGLRenderer + Software WebGL Detection (threejs skill requirement)
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: true,
          powerPreference: 'high-performance',
        });
      } catch {
        return;
      }

      const gl = renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const rendererName = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
      const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software/i.test(String(rendererName));

      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      const maxAniso = renderer.capabilities.getMaxAnisotropy();

      // 2. Scene, Studio Environment & Horizon Atmosphere
      const scene = new THREE.Scene();
      const initialBgColor = new THREE.Color(sectorRef.current.bgGradient[0]);
      scene.background = initialBgColor;
      scene.fog = new THREE.FogExp2(initialBgColor.getHex(), 0.012);

      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;
      pmrem.dispose();

      // Camera
      const camera = new THREE.PerspectiveCamera(
        48,
        (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
        0.1,
        180
      );
      camera.position.set(0, 26, 22);
      camera.lookAt(0, 0, 0);

      // 3. Studio Lighting Rig (Warm Directional Key + Cool Hemisphere Fill)
      const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.65);
      scene.add(hemiLight);

      const keyLight = new THREE.DirectionalLight(0xfff3e0, 2.4);
      keyLight.position.set(16, 28, 14);
      if (!isSoftwareGl) {
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(1024, 1024);
        keyLight.shadow.camera.near = 2;
        keyLight.shadow.camera.far = 75;
        const d = 28;
        keyLight.shadow.camera.left = -d;
        keyLight.shadow.camera.right = d;
        keyLight.shadow.camera.top = d;
        keyLight.shadow.camera.bottom = -d;
        keyLight.shadow.bias = -0.0005;
        keyLight.shadow.normalBias = 0.02;
      }
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.1);
      rimLight.position.set(-18, 14, -16);
      scene.add(rimLight);

      // 4. Procedural Arena Floor & Perimeter InstancedMesh (>20 repeated objects)
      const gridTexture = createProceduralGridTexture(maxAniso);
      const shadowTex = createContactShadowTexture();

      const floorGeo = new THREE.PlaneGeometry(96, 76);
      const floorMat = new THREE.MeshStandardMaterial({
        map: gridTexture,
        roughness: 0.78,
        metalness: 0.18,
      });
      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.receiveShadow = !isSoftwareGl;
      scene.add(floorMesh);

      // Perimeter Scientific Lattice Pillars (InstancedMesh with 48 instances)
      const PILLAR_COUNT = 48;
      const pillarGeo = new THREE.CylinderGeometry(0.32, 0.48, 2.6, 6);
      pillarGeo.translate(0, 1.3, 0); // bottom-center pivot at y=0
      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.42,
        metalness: 0.68,
      });
      const pillarInstanced = new THREE.Mesh ? new THREE.InstancedMesh(pillarGeo, pillarMat, PILLAR_COUNT) : null!;
      pillarInstanced.castShadow = !isSoftwareGl;
      pillarInstanced.receiveShadow = !isSoftwareGl;

      const pillarBaseTransforms: { x: number; z: number; scaleY: number; rotY: number; phase: number }[] = [];
      for (let i = 0; i < PILLAR_COUNT; i++) {
        const angle = (i / PILLAR_COUNT) * Math.PI * 2;
        const rx = (WORLD_HALF_W + 3.5) * Math.cos(angle);
        const rz = (WORLD_HALF_D + 3.2) * Math.sin(angle);
        const scaleY = 0.75 + (i % 5) * 0.22;
        const rotY = angle + (i % 3) * 0.4;
        pillarBaseTransforms.push({ x: rx, z: rz, scaleY, rotY, phase: i * 0.35 });

        _vec3A.set(rx, 0, rz);
        _euler.set(0, rotY, 0);
        _quat.setFromEuler(_euler);
        _vec3B.set(1, scaleY, 1);
        _mat4.compose(_vec3A, _quat, _vec3B);
        pillarInstanced.setMatrixAt(i, _mat4);

        _color.set(i % 2 === 0 ? sectorRef.current.primaryColor : sectorRef.current.accentColor);
        pillarInstanced.setColorAt(i, _color);
      }
      pillarInstanced.instanceMatrix.needsUpdate = true;
      if (pillarInstanced.instanceColor) pillarInstanced.instanceColor.needsUpdate = true;
      pillarInstanced.computeBoundingSphere();
      scene.add(pillarInstanced);

      // =========================================================================
      // 5. COMPOSITE 3-12 PART PROCEDURAL 3D MODELS (Grounded Pivots + Shadows)
      // =========================================================================

      // A. PLAYER NANO-EXPLORER VESSEL (8-part articulated THREE.Group)
      const playerGroup = new THREE.Group();
      scene.add(playerGroup);

      const hullMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.32,
        metalness: 0.78,
      });
      const canopyMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.12,
        metalness: 0.15,
        transparent: true,
        opacity: 0.86,
      });
      const wingMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.55,
        metalness: 0.52,
      });
      const accentGlowMat = new THREE.MeshStandardMaterial({
        color: sectorRef.current.primaryColor,
        emissive: sectorRef.current.primaryColor,
        emissiveIntensity: 1.2,
        roughness: 0.25,
        metalness: 0.4,
      });
      const turretMat = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        roughness: 0.24,
        metalness: 0.88,
      });

      // Part 1: Contact Shadow Plane (y = 0.02)
      const playerShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 3.2),
        new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
      );
      playerShadow.rotation.x = -Math.PI / 2;
      playerShadow.position.y = 0.02;
      playerGroup.add(playerShadow);

      // Part 2: Primary Fuselage Hull
      const fuselageMesh = new THREE.Mesh(new THREE.ConeGeometry(0.75, 2.3, 8), hullMat);
      fuselageMesh.rotation.x = -Math.PI / 2;
      fuselageMesh.position.set(0, 0.65, 0);
      fuselageMesh.castShadow = !isSoftwareGl;
      playerGroup.add(fuselageMesh);

      // Part 3: Cockpit Canopy Dome
      const canopyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 12), canopyMat);
      canopyMesh.scale.set(0.9, 0.65, 1.35);
      canopyMesh.position.set(0, 0.96, -0.1);
      playerGroup.add(canopyMesh);

      // Part 4 & 5: Left & Right Ion Wing Nacelles
      const leftWingMesh = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 1.35), wingMat);
      leftWingMesh.position.set(-0.85, 0.58, 0.22);
      leftWingMesh.rotation.z = 0.18;
      leftWingMesh.castShadow = !isSoftwareGl;
      playerGroup.add(leftWingMesh);

      const rightWingMesh = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 1.35), wingMat);
      rightWingMesh.position.set(0.85, 0.58, 0.22);
      rightWingMesh.rotation.z = -0.18;
      rightWingMesh.castShadow = !isSoftwareGl;
      playerGroup.add(rightWingMesh);

      // Part 6 & 7: Dual Thruster Rings
      const leftThruster = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.07, 8, 16), accentGlowMat);
      leftThruster.position.set(-0.55, 0.58, 1.02);
      playerGroup.add(leftThruster);

      const rightThruster = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.07, 8, 16), accentGlowMat);
      rightThruster.position.set(0.55, 0.58, 1.02);
      playerGroup.add(rightThruster);

      // Part 8: Articulated Ion Analyzer Turret
      const turretMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 1.25, 8), turretMat);
      turretMesh.rotation.x = -Math.PI / 2;
      turretMesh.position.set(0, 1.15, -0.65);
      playerGroup.add(turretMesh);

      // B. SECTOR BOSS REACTOR (9-part articulated THREE.Group)
      const bossGroup = new THREE.Group();
      scene.add(bossGroup);

      const bossShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(6.5, 6.5),
        new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
      );
      bossShadow.rotation.x = -Math.PI / 2;
      bossShadow.position.y = 0.02;
      bossGroup.add(bossShadow);

      const bossCoreMat = new THREE.MeshStandardMaterial({
        color: sectorRef.current.secondaryColor,
        emissive: sectorRef.current.primaryColor,
        emissiveIntensity: 0.45,
        roughness: 0.28,
        metalness: 0.72,
      });
      const bossRingMat = new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.2,
        metalness: 0.9,
      });
      const bossPylonMat = new THREE.MeshStandardMaterial({
        color: sectorRef.current.accentColor,
        roughness: 0.52,
        metalness: 0.45,
      });

      const bossCoreMesh = new THREE.Mesh(new THREE.OctahedronGeometry(1.55, 1), bossCoreMat);
      bossCoreMesh.position.y = 1.9;
      bossCoreMesh.castShadow = !isSoftwareGl;
      bossGroup.add(bossCoreMesh);

      const bossInnerRing = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.14, 10, 32), bossRingMat);
      bossInnerRing.position.y = 1.9;
      bossGroup.add(bossInnerRing);

      const bossOuterRing = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.11, 10, 32), bossPylonMat);
      bossOuterRing.position.y = 1.9;
      bossOuterRing.rotation.x = Math.PI / 3;
      bossGroup.add(bossOuterRing);

      const bossCrownMesh = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.4, 6), bossRingMat);
      bossCrownMesh.position.y = 3.55;
      bossGroup.add(bossCrownMesh);

      const bossPylons: THREE.Mesh[] = [];
      for (let p = 0; p < 4; p++) {
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.9, 0.45), bossPylonMat);
        const ang = (p * Math.PI) / 2;
        pylon.position.set(Math.cos(ang) * 2.35, 1.75, Math.sin(ang) * 2.35);
        pylon.castShadow = !isSoftwareGl;
        bossGroup.add(pylon);
        bossPylons.push(pylon);
      }

      const bossShieldMat = new THREE.MeshBasicMaterial({
        color: sectorRef.current.accentColor,
        wireframe: true,
        transparent: true,
        opacity: 0.32,
      });
      const bossShieldSphere = new THREE.Mesh(new THREE.SphereGeometry(3.05, 16, 12), bossShieldMat);
      bossShieldSphere.position.y = 1.9;
      bossGroup.add(bossShieldSphere);

      // Boss Telegraph Sightlines (4 laser lines shown during TELEGRAPH_VOLLEY)
      const bossSightlines: THREE.Line[] = [];
      const sightlineMat = new THREE.LineBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0.85 });
      for (let i = 0; i < 4; i++) {
        const pts = [new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(0, 1.2, 22)];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(lineGeo, sightlineMat);
        line.visible = false;
        scene.add(line);
        bossSightlines.push(line);
      }

      // C. KNOWLEDGE CRYSTALS POOL (10 Composite 4-Part Groups + Formula Sprites)
      interface CrystalSlot {
        active: boolean;
        x: number;
        z: number;
        vx: number;
        vz: number;
        symbol: string;
        pulsePhase: number;
        isGateCore: boolean;
        group: THREE.Group;
        coreMesh: THREE.Mesh;
        ringMesh: THREE.Mesh;
        sprite: THREE.Sprite;
        badgeTex: THREE.CanvasTexture | null;
      }

      const crystalGeo = new THREE.OctahedronGeometry(0.58, 0);
      const crystalRingGeo = new THREE.TorusGeometry(0.82, 0.06, 8, 24);
      const crystalBaseGeo = new THREE.CylinderGeometry(0.42, 0.55, 0.18, 6);

      const crystals: CrystalSlot[] = Array.from({ length: 10 }, () => {
        const grp = new THREE.Group();
        grp.visible = false;

        const cShadow = new THREE.Mesh(
          new THREE.PlaneGeometry(1.8, 1.8),
          new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
        );
        cShadow.rotation.x = -Math.PI / 2;
        cShadow.position.y = 0.02;
        grp.add(cShadow);

        const basePedestal = new THREE.Mesh(
          crystalBaseGeo,
          new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.4 })
        );
        basePedestal.position.y = 0.09;
        grp.add(basePedestal);

        const coreMesh = new THREE.Mesh(
          crystalGeo,
          new THREE.MeshStandardMaterial({
            color: 0x10b981,
            emissive: 0x10b981,
            emissiveIntensity: 0.5,
            roughness: 0.18,
            metalness: 0.35,
          })
        );
        coreMesh.position.y = 0.95;
        grp.add(coreMesh);

        const ringMesh = new THREE.Mesh(
          crystalRingGeo,
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.25, metalness: 0.85 })
        );
        ringMesh.position.y = 0.95;
        grp.add(ringMesh);

        const spriteMat = new THREE.SpriteMaterial({ transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.set(0, 2.05, 0);
        sprite.scale.set(2.4, 0.9, 1);
        grp.add(sprite);

        scene.add(grp);
        return {
          active: false,
          x: 0,
          z: 0,
          vx: 0,
          vz: 0,
          symbol: 'Mol',
          pulsePhase: 0,
          isGateCore: false,
          group: grp,
          coreMesh,
          ringMesh,
          sprite,
          badgeTex: null,
        };
      });

      // D. HAZARD ENTITIES POOL (10 Composite 5-Part Groups + Ground Telegraph Rings)
      interface HazardSlot {
        active: boolean;
        kind: 'striker' | 'shockwave';
        x: number;
        z: number;
        vx: number;
        vz: number;
        hp: number;
        maxHp: number;
        radius: number;
        state: 'PATROL' | 'WINDUP' | 'ATTACK';
        stateTimer: number;
        targetX: number;
        targetZ: number;
        flashTimer: number;
        group: THREE.Group;
        bodyMesh: THREE.Mesh;
        ringMesh: THREE.Mesh;
        telegraphRing: THREE.Mesh;
      }

      const hazardBodyGeo = new THREE.ConeGeometry(0.68, 1.45, 5);
      hazardBodyGeo.rotateX(Math.PI / 2);
      const hazardRingGeo = new THREE.TorusGeometry(0.85, 0.08, 8, 20);
      const telegraphGeo = new THREE.RingGeometry(0.7, 0.95, 28);
      telegraphGeo.rotateX(-Math.PI / 2);

      const hazards: HazardSlot[] = Array.from({ length: 10 }, () => {
        const grp = new THREE.Group();
        grp.visible = false;

        const hShadow = new THREE.Mesh(
          new THREE.PlaneGeometry(2.1, 2.1),
          new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
        );
        hShadow.rotation.x = -Math.PI / 2;
        hShadow.position.y = 0.02;
        grp.add(hShadow);

        const bodyMesh = new THREE.Mesh(
          hazardBodyGeo,
          new THREE.MeshStandardMaterial({
            color: 0xe11d48,
            emissive: 0x881337,
            emissiveIntensity: 0.4,
            roughness: 0.35,
            metalness: 0.65,
          })
        );
        bodyMesh.position.y = 0.8;
        grp.add(bodyMesh);

        const ringMesh = new THREE.Mesh(
          hazardRingGeo,
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.5, metalness: 0.6 })
        );
        ringMesh.position.y = 0.8;
        ringMesh.rotation.x = Math.PI / 2;
        grp.add(ringMesh);

        const telegraphRing = new THREE.Mesh(
          telegraphGeo,
          new THREE.MeshBasicMaterial({
            color: 0xf43f5e,
            transparent: true,
            opacity: 0.75,
            side: THREE.DoubleSide,
          })
        );
        telegraphRing.position.y = 0.04;
        telegraphRing.visible = false;
        grp.add(telegraphRing);

        scene.add(grp);
        return {
          active: false,
          kind: 'striker',
          x: 0,
          z: 0,
          vx: 0,
          vz: 0,
          hp: 30,
          maxHp: 30,
          radius: 0.95,
          state: 'PATROL',
          stateTimer: 2,
          targetX: 0,
          targetZ: 0,
          flashTimer: 0,
          group: grp,
          bodyMesh,
          ringMesh,
          telegraphRing,
        };
      });

      // E. PROJECTILES POOL (60 3D Energy Spheres)
      const projGeo = new THREE.SphereGeometry(0.24, 10, 10);
      const projectiles = Array.from({ length: 60 }, () => {
        const mat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
        const mesh = new THREE.Mesh(projGeo, mat);
        mesh.visible = false;
        scene.add(mesh);
        return {
          active: false,
          fromPlayer: true,
          x: 0,
          z: 0,
          vx: 0,
          vz: 0,
          radius: 0.3,
          damage: 10,
          mesh,
          mat,
        };
      });

      // F. 3D POOLED PARTICLES (InstancedMesh of 120 Cubes for Zero Draw-Call Overhead)
      const PARTICLE_COUNT = 120;
      const partGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
      const partMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const particleInstanced = new THREE.InstancedMesh(partGeo, partMat, PARTICLE_COUNT);
      particleInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(particleInstanced);

      const particles = Array.from({ length: PARTICLE_COUNT }, (_, idx) => {
        _mat4.makeScale(0, 0, 0);
        particleInstanced.setMatrixAt(idx, _mat4);
        return {
          active: false,
          x: 0,
          y: 0,
          z: 0,
          vx: 0,
          vy: 0,
          vz: 0,
          life: 0,
          maxLife: 1,
          scale: 1,
          colorHex: '#10B981',
        };
      });
      particleInstanced.instanceMatrix.needsUpdate = true;

      const spawnParticleBurst = (
        x: number,
        z: number,
        colorHex: string,
        count: number,
        speedMin = 3,
        speedMax = 11
      ) => {
        let spawned = 0;
        _color.set(colorHex);
        for (let i = 0; i < PARTICLE_COUNT && spawned < count; i++) {
          const p = particles[i];
          if (!p.active) {
            const ang = Math.random() * Math.PI * 2;
            const spd = speedMin + Math.random() * (speedMax - speedMin);
            p.active = true;
            p.x = x;
            p.y = 0.8 + Math.random() * 0.6;
            p.z = z;
            p.vx = Math.cos(ang) * spd;
            p.vy = 2.5 + Math.random() * 4.5;
            p.vz = Math.sin(ang) * spd;
            p.maxLife = 0.35 + Math.random() * 0.4;
            p.life = p.maxLife;
            p.scale = 0.7 + Math.random() * 0.9;
            p.colorHex = colorHex;
            particleInstanced.setColorAt(i, _color);
            spawned++;
          }
        }
        if (particleInstanced.instanceColor) {
          particleInstanced.instanceColor.needsUpdate = true;
        }
      };

      // G. ORBITAL MEGA-BEAM CYLINDER (When resolving a Science Gate)
      const beamGeo = new THREE.CylinderGeometry(0.45, 0.45, 1, 12);
      beamGeo.rotateX(Math.PI / 2);
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.9,
      });
      const orbitalBeamMesh = new THREE.Mesh(beamGeo, beamMat);
      orbitalBeamMesh.visible = false;
      scene.add(orbitalBeamMesh);
      let orbitalBeamTimer = 0;

      // =========================================================================
      // 6. SIMULATION & INPUT STATE
      // =========================================================================
      let cameraPreset: ArenaCameraPreset = 'TACTICAL';
      let inspectionFactor = 0; // 0 = assembled, 1 = exploded 3D engineering inspection
      let currentInspectSmooth = 0;

      const player = {
        x: 0,
        z: 8.5,
        vx: 0,
        vz: 0,
        radius: 0.95,
        hp: 100,
        maxHp: 100,
        yaw: 0, // 0 faces -Z (toward Boss)
        scaleX: 1,
        scaleZ: 1,
        fireCooldown: 0,
        dashCooldown: 0,
        invulnTimer: 0,
        flashTimer: 0,
      };

      const boss = {
        x: 0,
        z: -9.5,
        vx: 5.2,
        radius: 2.3,
        hp: sectorRef.current.bossMaxHp,
        maxHp: sectorRef.current.bossMaxHp,
        state: 'PATROL' as 'PATROL' | 'TELEGRAPH_VOLLEY' | 'FIRE_VOLLEY',
        stateTimer: 3.0,
        flashTimer: 0,
        aimAngles: [] as number[],
        shieldActive: true,
      };

      let score = 0;
      let combo = 1;
      let wave = 1;
      let energyCharge = 0;
      let crystalsCollected = 0;
      let questionCursor = 0;
      let activeGate: ArenaQuestionGate | null = null;

      let hitstopTimer = 0;
      let shakeIntensity = 0;
      let worldTime = 0;
      let crystalSpawnTimer = 1.0;
      let hazardSpawnTimer = 2.0;
      let hudSyncTimer = 0;

      const syncHudNow = () => {
        callbacksRef.current.onHudUpdate({
          hp: Math.max(0, Math.round(player.hp)),
          maxHp: player.maxHp,
          bossHp: Math.max(0, Math.round(boss.hp)),
          bossMaxHp: boss.maxHp,
          score: Math.round(score),
          combo,
          wave,
          energyCharge: Math.min(100, Math.round(energyCharge)),
          crystalsCollected,
          activeGate,
        });
      };

      const spawnProjectile = (
        fromPlayer: boolean,
        x: number,
        z: number,
        vx: number,
        vz: number,
        colorHex: string,
        damage: number
      ) => {
        for (let i = 0; i < projectiles.length; i++) {
          const p = projectiles[i];
          if (!p.active) {
            p.active = true;
            p.fromPlayer = fromPlayer;
            p.x = x;
            p.z = z;
            p.vx = vx;
            p.vz = vz;
            p.damage = damage;
            p.mat.color.set(colorHex);
            p.mesh.position.set(x, 0.85, z);
            p.mesh.visible = true;
            return;
          }
        }
      };

      const spawnCrystal = (forceGateCore = false) => {
        const sec = sectorRef.current;
        for (let i = 0; i < crystals.length; i++) {
          const c = crystals[i];
          if (!c.active) {
            c.active = true;
            c.x = (Math.random() - 0.5) * (WORLD_HALF_W * 1.5);
            c.z = -3 + Math.random() * (WORLD_HALF_D * 1.4);
            c.vx = (Math.random() - 0.5) * 1.8;
            c.vz = (Math.random() - 0.5) * 1.8;
            c.isGateCore = forceGateCore;
            c.symbol = forceGateCore
              ? 'CỔNG KHTN'
              : sec.crystalSymbols[Math.floor(Math.random() * sec.crystalSymbols.length)] || 'Mol';
            c.pulsePhase = Math.random() * Math.PI * 2;

            const colorHex = forceGateCore ? sec.accentColor : sec.primaryColor;
            (c.coreMesh.material as THREE.MeshStandardMaterial).color.set(colorHex);
            (c.coreMesh.material as THREE.MeshStandardMaterial).emissive.set(colorHex);

            if (c.badgeTex) c.badgeTex.dispose();
            c.badgeTex = createFormulaBadgeTexture(c.symbol, colorHex);
            (c.sprite.material as THREE.SpriteMaterial).map = c.badgeTex;
            (c.sprite.material as THREE.SpriteMaterial).needsUpdate = true;

            c.group.position.set(c.x, 0, c.z);
            c.group.visible = true;
            return;
          }
        }
      };

      const spawnHazard = (kind: 'striker' | 'shockwave') => {
        for (let i = 0; i < hazards.length; i++) {
          const h = hazards[i];
          if (!h.active) {
            const side = Math.random() < 0.5 ? -WORLD_HALF_W + 2 : WORLD_HALF_W - 2;
            const zPos = -6 + Math.random() * 10;
            const maxHp = kind === 'striker' ? 28 + wave * 6 : 40 + wave * 8;
            h.active = true;
            h.kind = kind;
            h.x = side;
            h.z = zPos;
            h.vx = -Math.sign(side) * 3.5;
            h.vz = (Math.random() - 0.5) * 2.2;
            h.hp = maxHp;
            h.maxHp = maxHp;
            h.radius = kind === 'striker' ? 0.95 : 1.15;
            h.state = 'PATROL';
            h.stateTimer = 1.8 + Math.random() * 1.2;
            h.targetX = player.x;
            h.targetZ = player.z;
            h.flashTimer = 0;

            (h.bodyMesh.material as THREE.MeshStandardMaterial).color.set(
              kind === 'striker' ? 0xe11d48 : 0xd97706
            );
            h.telegraphRing.visible = false;
            h.group.position.set(h.x, 0, h.z);
            h.group.visible = true;
            return;
          }
        }
      };

      const openNextScienceGate = () => {
        if (activeGate) return;
        const questions = sectorRef.current.questions;
        if (!questions || questions.length === 0) return;
        const gate = questions[questionCursor % questions.length];
        questionCursor++;
        activeGate = gate;
        soundEngine.playCrystalCollect(combo + 2);
        syncHudNow();
      };

      const resolveActiveGate = (choiceIdx: number) => {
        if (!activeGate) return;
        const gate = activeGate;
        const isCorrect = choiceIdx === gate.correctIndex;
        activeGate = null;

        if (isCorrect) {
          soundEngine.playAnswerCorrect(combo);
          soundEngine.playHeavyImpact();
          combo = Math.min(10, combo + 1);
          const damage = gate.damageToBoss + (combo - 1) * 15;
          boss.hp = Math.max(0, boss.hp - damage);
          boss.flashTimer = 0.3;
          boss.shieldActive = false;
          bossShieldSphere.visible = false;
          score += gate.xpReward * 10 * combo;
          energyCharge = 0;

          // Position 3D Orbital Mega-Beam between player and boss
          const dx = boss.x - player.x;
          const dz = boss.z - player.z;
          const dist = Math.hypot(dx, dz);
          orbitalBeamMesh.position.set((player.x + boss.x) * 0.5, 1.1, (player.z + boss.z) * 0.5);
          orbitalBeamMesh.scale.set(1, 1, dist);
          orbitalBeamMesh.rotation.y = Math.atan2(dx, dz);
          beamMat.color.set(sectorRef.current.primaryColor);
          orbitalBeamMesh.visible = true;
          orbitalBeamTimer = 0.48;

          hitstopTimer = 0.068; // 68ms hitstop
          shakeIntensity = 1.1;
          spawnParticleBurst(boss.x, boss.z, sectorRef.current.primaryColor, 36, 4, 14);
          spawnParticleBurst(boss.x, boss.z, '#FFFFFF', 16, 3, 10);

          if (boss.hp > 0) {
            wave++;
            spawnHazard('striker');
            if (wave % 2 === 0) spawnHazard('shockwave');
          } else {
            soundEngine.playVictoryFanfare();
            syncHudNow();
            callbacksRef.current.onGateResolved(gate, true, choiceIdx);
            callbacksRef.current.onGameEnd(true, Math.round(score), wave);
            return;
          }
        } else {
          soundEngine.playAnswerWrong();
          combo = 1;
          energyCharge = 35;
          shakeIntensity = 0.55;
          spawnParticleBurst(player.x, player.z, '#EF4444', 20, 3, 9);
        }

        callbacksRef.current.onGateResolved(gate, isCorrect, choiceIdx);
        syncHudNow();
      };

      const resetSession = (newSector: ArenaSectorConfig) => {
        sectorRef.current = newSector;

        // Update sector colors & fog
        _color.set(newSector.bgGradient[0]);
        scene.background = _color.clone();
        scene.fog = new THREE.FogExp2(_color.getHex(), 0.012);

        accentGlowMat.color.set(newSector.primaryColor);
        accentGlowMat.emissive.set(newSector.primaryColor);
        bossCoreMat.color.set(newSector.secondaryColor);
        bossCoreMat.emissive.set(newSector.primaryColor);
        bossPylonMat.color.set(newSector.accentColor);
        bossShieldMat.color.set(newSector.accentColor);

        player.x = 0;
        player.z = 8.5;
        player.vx = 0;
        player.vz = 0;
        player.hp = 100;
        player.maxHp = 100;
        player.yaw = 0;
        player.scaleX = 1;
        player.scaleZ = 1;
        player.invulnTimer = 0;
        player.flashTimer = 0;

        boss.x = 0;
        boss.z = -9.5;
        boss.vx = 5.2;
        boss.hp = newSector.bossMaxHp;
        boss.maxHp = newSector.bossMaxHp;
        boss.state = 'PATROL';
        boss.stateTimer = 3.0;
        boss.flashTimer = 0;
        boss.shieldActive = true;
        bossShieldSphere.visible = true;

        score = 0;
        combo = 1;
        wave = 1;
        energyCharge = 0;
        crystalsCollected = 0;
        activeGate = null;
        hitstopTimer = 0;
        shakeIntensity = 0;

        projectiles.forEach((p) => {
          p.active = false;
          p.mesh.visible = false;
        });
        crystals.forEach((c) => {
          c.active = false;
          c.group.visible = false;
        });
        hazards.forEach((h) => {
          h.active = false;
          h.group.visible = false;
        });
        bossSightlines.forEach((l) => (l.visible = false));

        for (let i = 0; i < 5; i++) spawnCrystal(false);
        spawnCrystal(true);
        spawnHazard('striker');
        spawnHazard('shockwave');
        syncHudNow();
      };

      bridgeRef.current = {
        triggerGateAnswer: resolveActiveGate,
        resetSession,
        setCameraPreset: (preset: ArenaCameraPreset) => {
          cameraPreset = preset;
        },
        setInspectionFactor: (factor: number) => {
          inspectionFactor = Math.max(0, Math.min(1, factor));
        },
      };

      resetSession(sectorRef.current);

      // --- INPUT LISTENERS ---
      const heldKeys = new Set<string>();
      const justPressed = new Set<string>();
      let actionBufferTimer = 0;
      let aimNormX = 0;
      let aimNormY = -0.5;

      const handleKeyDown = (e: KeyboardEvent) => {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;

        if (!heldKeys.has(e.code)) {
          justPressed.add(e.code);
        }
        heldKeys.add(e.code);

        if (e.code === 'Space') {
          actionBufferTimer = 0.12;
          if (modeRef.current === 'PLAYING') {
            e.preventDefault();
          }
        }
        if (e.code === 'Escape') {
          e.preventDefault();
          callbacksRef.current.onTogglePause();
        }
        if (e.code === 'KeyM') {
          callbacksRef.current.onToggleMute();
        }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        heldKeys.delete(e.code);
      };

      const handleWindowBlur = () => {
        heldKeys.clear();
        justPressed.clear();
        actionBufferTimer = 0;
      };

      const handleMouseMove = (e: MouseEvent) => {
        const w = window.innerWidth || 1;
        const h = window.innerHeight || 1;
        aimNormX = (e.clientX / w) * 2 - 1;
        aimNormY = (e.clientY / h) * 2 - 1;
      };

      const handleMouseDown = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target && target.closest('button, input, select, a')) return;
        if (e.button === 0 && modeRef.current === 'PLAYING') {
          actionBufferTimer = 0.12;
        }
      };

      const handleResize = () => {
        if (!container) return;
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      window.addEventListener('blur', handleWindowBlur);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('resize', handleResize);

      // =========================================================================
      // 7. 60FPS ANIMATION & GPU FENCE LOOP (with Software WebGL Guard)
      // =========================================================================
      let cancelled = false;
      let rafId = 0;
      let lastTime = performance.now();

      function afterDraw(cb: FrameRequestCallback) {
        if (!isSoftwareGl || typeof (gl as WebGL2RenderingContext).fenceSync !== 'function') {
          rafId = requestAnimationFrame(cb);
          return;
        }
        const gl2 = gl as WebGL2RenderingContext;
        const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl2.flush();
        if (!sync) {
          rafId = requestAnimationFrame(cb);
          return;
        }
        const poll = () => {
          if (cancelled) {
            gl2.deleteSync(sync);
            return;
          }
          const status = gl2.clientWaitSync(sync, 0, 0);
          if (status === gl2.TIMEOUT_EXPIRED) {
            setTimeout(poll, 4);
            return;
          }
          gl2.deleteSync(sync);
          rafId = requestAnimationFrame(cb);
        };
        setTimeout(poll, 4);
      }

      const tick = (now: number) => {
        if (cancelled) return;
        const rawDt = (now - lastTime) / 1000;
        lastTime = now;
        const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
        worldTime += dt;

        const currentMode = modeRef.current;
        const sec = sectorRef.current;

        // Quick 1-4 answer keys for active Science Gate
        if (currentMode === 'PLAYING' && activeGate) {
          if (justPressed.has('Digit1') || justPressed.has('Numpad1')) resolveActiveGate(0);
          else if (justPressed.has('Digit2') || justPressed.has('Numpad2')) resolveActiveGate(1);
          else if (justPressed.has('Digit3') || justPressed.has('Numpad3')) resolveActiveGate(2);
          else if (justPressed.has('Digit4') || justPressed.has('Numpad4')) resolveActiveGate(3);
        }
        justPressed.clear();

        // Smooth Exploded-View / 3D Inspection Factor
        currentInspectSmooth = THREE.MathUtils.damp(
          currentInspectSmooth,
          inspectionFactor,
          8,
          dt
        );
        const exp = currentInspectSmooth;
        fuselageMesh.position.y = 0.65 + exp * 0.35;
        canopyMesh.position.y = 0.96 + exp * 1.15;
        leftWingMesh.position.x = -0.85 - exp * 0.95;
        rightWingMesh.position.x = 0.85 + exp * 0.95;
        leftThruster.position.z = 1.02 + exp * 0.85;
        rightThruster.position.z = 1.02 + exp * 0.85;
        turretMesh.position.y = 1.15 + exp * 1.55;

        bossCrownMesh.position.y = 3.55 + exp * 1.4;
        for (let p = 0; p < bossPylons.length; p++) {
          const ang = (p * Math.PI) / 2 + worldTime * 0.45;
          const r = 2.35 + exp * 1.35;
          bossPylons[p].position.set(
            Math.cos(ang) * r,
            1.75 + Math.sin(worldTime * 2 + p) * 0.18,
            Math.sin(ang) * r
          );
          bossPylons[p].rotation.y = -ang;
        }

        // Decay camera shake
        if (shakeIntensity > 0.01) {
          shakeIntensity *= Math.exp(-10 * dt);
        } else {
          shakeIntensity = 0;
        }

        if (hitstopTimer > 0) {
          hitstopTimer -= dt;
        } else if (currentMode === 'PLAYING') {
          // 1. Player Movement (WASD / Arrows in 3D XZ Plane)
          let moveX = 0;
          let moveZ = 0;
          if (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft')) moveX -= 1;
          if (heldKeys.has('KeyD') || heldKeys.has('ArrowRight')) moveX += 1;
          if (heldKeys.has('KeyW') || heldKeys.has('ArrowUp')) moveZ -= 1;
          if (heldKeys.has('KeyS') || heldKeys.has('ArrowDown')) moveZ += 1;

          if (moveX !== 0 || moveZ !== 0) {
            const len = Math.hypot(moveX, moveZ);
            moveX /= len;
            moveZ /= len;
          }

          const accel = 78;
          const drag = 7.2;
          player.vx += (moveX * accel - player.vx * drag) * dt;
          player.vz += (moveZ * accel - player.vz * drag) * dt;

          player.fireCooldown = Math.max(0, player.fireCooldown - dt);
          player.dashCooldown = Math.max(0, player.dashCooldown - dt);
          player.invulnTimer = Math.max(0, player.invulnTimer - dt);
          player.flashTimer = Math.max(0, player.flashTimer - dt);

          // Aim angle toward Boss or cursor offset
          const targetAimX = aimNormX * WORLD_HALF_W * 0.85;
          const targetAimZ = aimNormY * WORLD_HALF_D * 0.85;
          const aimDx = targetAimX - player.x;
          const aimDz = targetAimZ - player.z;
          const desiredYaw = Math.atan2(aimDx, aimDz);
          player.yaw = THREE.MathUtils.damp(player.yaw, desiredYaw, 14, dt);

          // Buffered Space / Click Action: Fire Ion Pulse + Dash
          if (actionBufferTimer > 0) {
            actionBufferTimer = Math.max(0, actionBufferTimer - dt);
            if (player.fireCooldown <= 0) {
              player.fireCooldown = 0.16;
              actionBufferTimer = 0;

              const dirX = Math.sin(player.yaw);
              const dirZ = Math.cos(player.yaw);
              const projSpeed = 32;
              spawnProjectile(
                true,
                player.x + dirX * 1.2,
                player.z + dirZ * 1.2,
                dirX * projSpeed,
                dirZ * projSpeed,
                sec.primaryColor,
                8
              );
              soundEngine.playLaserPulse();

              // Squash-and-stretch recoil
              player.scaleX = 1.24;
              player.scaleZ = 0.78;

              if ((moveX !== 0 || moveZ !== 0) && player.dashCooldown <= 0) {
                player.dashCooldown = 0.85;
                player.vx += moveX * 18;
                player.vz += moveZ * 18;
                player.invulnTimer = 0.24;
                soundEngine.playDashBoost();
                spawnParticleBurst(player.x, player.z, sec.accentColor, 12, 3, 9);
              }
            }
          }

          player.x += player.vx * dt;
          player.z += player.vz * dt;
          player.x = Math.max(-WORLD_HALF_W + 1.5, Math.min(WORLD_HALF_W - 1.5, player.x));
          player.z = Math.max(-4.5, Math.min(WORLD_HALF_D - 1.2, player.z));

          // Relax squash-and-stretch
          player.scaleX = THREE.MathUtils.damp(player.scaleX, 1, 14, dt);
          player.scaleZ = THREE.MathUtils.damp(player.scaleZ, 1, 14, dt);

          // 2. Update Boss AI & 3D Laser Sightline Telegraphs
          boss.flashTimer = Math.max(0, boss.flashTimer - dt);
          boss.stateTimer -= dt;

          if (boss.state === 'PATROL') {
            boss.x += boss.vx * dt;
            if (boss.x < -WORLD_HALF_W + 4.5) {
              boss.x = -WORLD_HALF_W + 4.5;
              boss.vx = Math.abs(boss.vx);
            } else if (boss.x > WORLD_HALF_W - 4.5) {
              boss.x = WORLD_HALF_W - 4.5;
              boss.vx = -Math.abs(boss.vx);
            }

            if (boss.stateTimer <= 0) {
              boss.state = 'TELEGRAPH_VOLLEY';
              boss.stateTimer = 0.82;
              const baseAngle = Math.atan2(player.x - boss.x, player.z - boss.z);
              const spread = 0.26;
              boss.aimAngles = [
                baseAngle - spread * 1.5,
                baseAngle - spread * 0.5,
                baseAngle + spread * 0.5,
                baseAngle + spread * 1.5,
              ];
              soundEngine.playTelegraphWarning();
            }
          } else if (boss.state === 'TELEGRAPH_VOLLEY') {
            for (let i = 0; i < bossSightlines.length; i++) {
              const ang = boss.aimAngles[i] ?? 0;
              const line = bossSightlines[i];
              const posAttr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
              posAttr.setXYZ(0, boss.x, 1.1, boss.z);
              posAttr.setXYZ(1, boss.x + Math.sin(ang) * 28, 1.1, boss.z + Math.cos(ang) * 28);
              posAttr.needsUpdate = true;
              line.visible = true;
            }

            if (boss.stateTimer <= 0) {
              bossSightlines.forEach((l) => (l.visible = false));
              boss.state = 'FIRE_VOLLEY';
              boss.stateTimer = 0.35;
              const boltSpeed = 14 + wave * 0.9;
              boss.aimAngles.forEach((ang) => {
                spawnProjectile(
                  false,
                  boss.x + Math.sin(ang) * 2.2,
                  boss.z + Math.cos(ang) * 2.2,
                  Math.sin(ang) * boltSpeed,
                  Math.cos(ang) * boltSpeed,
                  '#F43F5E',
                  12
                );
              });
              spawnParticleBurst(boss.x, boss.z + 1.2, '#F43F5E', 14, 3, 9);
            }
          } else if (boss.state === 'FIRE_VOLLEY') {
            if (boss.stateTimer <= 0) {
              boss.state = 'PATROL';
              boss.stateTimer = Math.max(1.8, 3.2 - wave * 0.2);
            }
          }

          // 3. Update Hazards & Ground Telegraph Rings
          hazardSpawnTimer -= dt;
          if (hazardSpawnTimer <= 0) {
            hazardSpawnTimer = Math.max(3.8, 6.0 - wave * 0.35);
            const activeCount = hazards.filter((h) => h.active).length;
            if (activeCount < 3 + Math.min(3, wave)) {
              spawnHazard(Math.random() < 0.55 ? 'striker' : 'shockwave');
            }
          }

          for (let i = 0; i < hazards.length; i++) {
            const h = hazards[i];
            if (!h.active) continue;
            h.flashTimer = Math.max(0, h.flashTimer - dt);
            h.stateTimer -= dt;

            if (h.kind === 'striker') {
              if (h.state === 'PATROL') {
                h.telegraphRing.visible = false;
                const ang = Math.atan2(player.x - h.x, player.z - h.z);
                h.vx += Math.sin(ang) * 9 * dt;
                h.vz += Math.cos(ang) * 9 * dt;
                const spd = Math.hypot(h.vx, h.vz);
                if (spd > 6.2) {
                  h.vx = (h.vx / spd) * 6.2;
                  h.vz = (h.vz / spd) * 6.2;
                }
                h.x += h.vx * dt;
                h.z += h.vz * dt;
                h.bodyMesh.rotation.y = ang;

                if (h.stateTimer <= 0) {
                  h.state = 'WINDUP';
                  h.stateTimer = 0.65;
                  h.targetX = player.x;
                  h.targetZ = player.z;
                  h.vx = 0;
                  h.vz = 0;
                }
              } else if (h.state === 'WINDUP') {
                h.telegraphRing.visible = true;
                const s = 1 + (0.65 - h.stateTimer) * 2.2;
                h.telegraphRing.scale.set(s, s, 1);
                if (h.stateTimer <= 0) {
                  h.telegraphRing.visible = false;
                  h.state = 'ATTACK';
                  h.stateTimer = 0.55;
                  const ang = Math.atan2(h.targetX - h.x, h.targetZ - h.z);
                  const dashSpd = 19 + wave * 0.8;
                  h.vx = Math.sin(ang) * dashSpd;
                  h.vz = Math.cos(ang) * dashSpd;
                  h.bodyMesh.rotation.y = ang;
                }
              } else if (h.state === 'ATTACK') {
                h.x += h.vx * dt;
                h.z += h.vz * dt;
                if (h.stateTimer <= 0) {
                  h.state = 'PATROL';
                  h.stateTimer = 2.0 + Math.random();
                }
              }
            } else {
              // Shockwave Node
              if (h.state === 'PATROL') {
                h.telegraphRing.visible = false;
                h.x += h.vx * dt;
                h.z += h.vz * dt;
                if (h.x < -WORLD_HALF_W + 2 || h.x > WORLD_HALF_W - 2) h.vx *= -1;
                if (h.z < -6 || h.z > WORLD_HALF_D - 2) h.vz *= -1;
                if (h.stateTimer <= 0) {
                  h.state = 'WINDUP';
                  h.stateTimer = 0.85;
                }
              } else if (h.state === 'WINDUP') {
                h.telegraphRing.visible = true;
                const s = 1 + (0.85 - h.stateTimer) * 2.8;
                h.telegraphRing.scale.set(s, s, 1);
                if (h.stateTimer <= 0) {
                  h.telegraphRing.visible = false;
                  h.state = 'PATROL';
                  h.stateTimer = 3.0;
                  for (let k = 0; k < 6; k++) {
                    const ang = (Math.PI * 2 * k) / 6 + worldTime;
                    spawnProjectile(
                      false,
                      h.x,
                      h.z,
                      Math.sin(ang) * 11,
                      Math.cos(ang) * 11,
                      '#F59E0B',
                      10
                    );
                  }
                  spawnParticleBurst(h.x, h.z, '#F59E0B', 14, 3, 8);
                }
              }
            }

            h.ringMesh.rotation.z = worldTime * 3;
            h.group.position.set(h.x, 0, h.z);

            const distToPlayer = Math.hypot(player.x - h.x, player.z - h.z);
            if (distToPlayer < player.radius + h.radius && player.invulnTimer <= 0) {
              player.hp = Math.max(0, player.hp - 14);
              player.invulnTimer = 0.75;
              player.flashTimer = 0.25;
              hitstopTimer = 0.045;
              shakeIntensity = 0.75;
              soundEngine.playHeavyImpact();
              spawnParticleBurst(player.x, player.z, '#EF4444', 22, 4, 11);
              syncHudNow();
              if (player.hp <= 0) {
                callbacksRef.current.onGameEnd(false, Math.round(score), wave);
                return;
              }
            }
          }

          // 4. Update Knowledge Crystals
          crystalSpawnTimer -= dt;
          if (crystalSpawnTimer <= 0) {
            crystalSpawnTimer = 2.4;
            const activeCrystals = crystals.filter((c) => c.active).length;
            if (activeCrystals < 6) {
              const hasCore = crystals.some((c) => c.active && c.isGateCore);
              spawnCrystal(!hasCore && energyCharge >= 60);
            }
          }

          for (let i = 0; i < crystals.length; i++) {
            const c = crystals[i];
            if (!c.active) continue;
            c.pulsePhase += dt * 3.5;
            c.x += c.vx * dt;
            c.z += c.vz * dt;
            if (c.x < -WORLD_HALF_W + 2 || c.x > WORLD_HALF_W - 2) c.vx *= -1;
            if (c.z < -4 || c.z > WORLD_HALF_D - 2) c.vz *= -1;

            const dx = player.x - c.x;
            const dz = player.z - c.z;
            const dist = Math.hypot(dx, dz);
            if (dist < 6.2 && dist > 0.1) {
              c.x += (dx / dist) * 8.5 * dt;
              c.z += (dz / dist) * 8.5 * dt;
            }

            c.coreMesh.rotation.y = worldTime * 1.8;
            c.coreMesh.position.y = 0.95 + Math.sin(c.pulsePhase) * 0.16;
            c.ringMesh.rotation.x = Math.PI / 3 + Math.sin(c.pulsePhase * 0.7) * 0.3;
            c.ringMesh.rotation.y = -worldTime * 1.4;
            c.group.position.set(c.x, 0, c.z);

            if (dist < player.radius + (c.isGateCore ? 1.15 : 0.85)) {
              c.active = false;
              c.group.visible = false;
              crystalsCollected++;
              score += 25 * combo;
              energyCharge = Math.min(100, energyCharge + (c.isGateCore ? 50 : 25));
              soundEngine.playCrystalCollect(combo);
              spawnParticleBurst(
                c.x,
                c.z,
                c.isGateCore ? sec.accentColor : sec.primaryColor,
                16,
                3,
                9
              );

              if (energyCharge >= 100 || c.isGateCore) {
                openNextScienceGate();
              } else {
                syncHudNow();
              }
            }
          }

          // 5. Update Projectiles
          for (let i = 0; i < projectiles.length; i++) {
            const p = projectiles[i];
            if (!p.active) continue;
            p.x += p.vx * dt;
            p.z += p.vz * dt;
            p.mesh.position.set(p.x, 0.85, p.z);

            if (
              p.x < -WORLD_HALF_W - 4 ||
              p.x > WORLD_HALF_W + 4 ||
              p.z < -WORLD_HALF_D - 4 ||
              p.z > WORLD_HALF_D + 4
            ) {
              p.active = false;
              p.mesh.visible = false;
              continue;
            }

            if (p.fromPlayer) {
              for (let j = 0; j < hazards.length; j++) {
                const h = hazards[j];
                if (!h.active) continue;
                if (Math.hypot(p.x - h.x, p.z - h.z) < p.radius + h.radius) {
                  p.active = false;
                  p.mesh.visible = false;
                  h.hp -= p.damage;
                  h.flashTimer = 0.12;
                  spawnParticleBurst(p.x, p.z, sec.primaryColor, 6, 2, 7);
                  if (h.hp <= 0) {
                    h.active = false;
                    h.group.visible = false;
                    score += 60 * combo;
                    energyCharge = Math.min(100, energyCharge + 20);
                    soundEngine.playHeavyImpact();
                    hitstopTimer = 0.035;
                    shakeIntensity = 0.4;
                    spawnParticleBurst(h.x, h.z, sec.accentColor, 20, 3, 10);
                    if (energyCharge >= 100) openNextScienceGate();
                  }
                  break;
                }
              }

              if (p.active && Math.hypot(p.x - boss.x, p.z - boss.z) < p.radius + boss.radius) {
                p.active = false;
                p.mesh.visible = false;
                boss.flashTimer = 0.09;
                const chipDmg = boss.shieldActive ? 2 : 6;
                boss.hp = Math.max(1, boss.hp - chipDmg);
                energyCharge = Math.min(100, energyCharge + 8);
                score += 15 * combo;
                spawnParticleBurst(p.x, p.z, sec.primaryColor, 8, 2, 7);
                if (energyCharge >= 100 && !activeGate) openNextScienceGate();
              }
            } else {
              if (
                player.invulnTimer <= 0 &&
                Math.hypot(p.x - player.x, p.z - player.z) < p.radius + player.radius
              ) {
                p.active = false;
                p.mesh.visible = false;
                player.hp = Math.max(0, player.hp - p.damage);
                player.invulnTimer = 0.65;
                player.flashTimer = 0.22;
                hitstopTimer = 0.04;
                shakeIntensity = 0.65;
                soundEngine.playHeavyImpact();
                spawnParticleBurst(player.x, player.z, '#EF4444', 18, 3, 10);
                syncHudNow();
                if (player.hp <= 0) {
                  callbacksRef.current.onGameEnd(false, Math.round(score), wave);
                  return;
                }
              }
            }
          }

          hudSyncTimer += dt;
          if (hudSyncTimer >= 0.15) {
            hudSyncTimer = 0;
            syncHudNow();
          }
        }

        // Update Player & Boss 3D Transforms
        playerGroup.position.set(player.x, 0, player.z);
        playerGroup.rotation.y = player.yaw;
        playerGroup.scale.set(player.scaleX, 1, player.scaleZ);
        hullMat.emissive.setHex(player.flashTimer > 0 ? 0xef4444 : 0x000000);

        bossGroup.position.set(boss.x, 0, boss.z);
        bossCoreMesh.rotation.y = worldTime * 1.1;
        bossCoreMesh.rotation.x = Math.sin(worldTime * 0.7) * 0.35;
        bossInnerRing.rotation.z = worldTime * 1.6;
        bossInnerRing.rotation.x = Math.cos(worldTime * 0.9) * 0.6;
        bossOuterRing.rotation.y = -worldTime * 1.2;
        bossCoreMat.emissive.set(boss.flashTimer > 0 ? '#FFFFFF' : sec.primaryColor);

        // Update Orbital Beam fade
        if (orbitalBeamTimer > 0) {
          orbitalBeamTimer -= dt;
          beamMat.opacity = Math.max(0, orbitalBeamTimer / 0.48);
          if (orbitalBeamTimer <= 0) orbitalBeamMesh.visible = false;
        }

        // Update Pooled 3D Particles
        let anyParticlesUpdated = false;
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const pt = particles[i];
          if (!pt.active) continue;
          anyParticlesUpdated = true;
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          pt.z += pt.vz * dt;
          pt.vy -= 9.8 * dt;
          pt.life -= dt;

          if (pt.life <= 0 || pt.y < 0) {
            pt.active = false;
            _mat4.makeScale(0, 0, 0);
            particleInstanced.setMatrixAt(i, _mat4);
          } else {
            const s = pt.scale * (pt.life / pt.maxLife);
            _vec3A.set(pt.x, pt.y, pt.z);
            _euler.set(worldTime * 4 + i, worldTime * 3, 0);
            _quat.setFromEuler(_euler);
            _vec3B.set(s, s, s);
            _mat4.compose(_vec3A, _quat, _vec3B);
            particleInstanced.setMatrixAt(i, _mat4);
          }
        }
        if (anyParticlesUpdated) {
          particleInstanced.instanceMatrix.needsUpdate = true;
        }

        // Damped 3D Camera Choreography (Title Screen Pan vs Playing Presets)
        if (currentMode === 'TITLE_SCREEN') {
          const orbitAng = worldTime * 0.22;
          _vec3CamTarget.set(Math.sin(orbitAng) * 18, 13.5, Math.cos(orbitAng) * 18);
          _vec3LookAt.set(0, 1.2, -2);
        } else if (cameraPreset === 'CHASE') {
          _vec3CamTarget.set(player.x * 0.75, 11.5, player.z + 11.5);
          _vec3LookAt.set(player.x * 0.5, 0.8, player.z - 6.5);
        } else if (cameraPreset === 'INSPECT') {
          const inspectAng = worldTime * 0.45;
          _vec3CamTarget.set(
            player.x + Math.sin(inspectAng) * 6.2,
            4.8,
            player.z + Math.cos(inspectAng) * 6.2
          );
          _vec3LookAt.set(player.x, 1.0, player.z);
        } else {
          // TACTICAL (Default Full-Arena Overview)
          _vec3CamTarget.set(player.x * 0.28, 24.5, 18.5 + player.z * 0.22);
          _vec3LookAt.set(player.x * 0.18, 0.5, -1.2);
        }

        const camLerp = 1 - Math.exp(-6.5 * dt);
        camera.position.lerp(_vec3CamTarget, camLerp);
        if (shakeIntensity > 0) {
          camera.position.x += (Math.random() - 0.5) * shakeIntensity;
          camera.position.y += (Math.random() - 0.5) * shakeIntensity;
        }
        camera.lookAt(_vec3LookAt);

        renderer.render(scene, camera);
        afterDraw(tick);
      };

      rafId = requestAnimationFrame(tick);

      return () => {
        cancelled = true;
        cancelAnimationFrame(rafId);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('blur', handleWindowBlur);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('resize', handleResize);
        gridTexture.dispose();
        shadowTex.dispose();
        envTex.dispose();
        crystals.forEach((c) => c.badgeTex?.dispose());
        renderer.dispose();
      };
    }, [bridgeRef]);

    return (
      <div
        ref={mountRef}
        className="fixed inset-0 w-screen h-screen block pointer-events-auto"
        aria-label="Đấu Trường Khoa Học Tự Nhiên 8 — 3D WebGL Spatial Arena"
      />
    );
  }
);
