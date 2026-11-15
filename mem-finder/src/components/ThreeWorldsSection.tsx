import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Compass,
  Download,
  ExternalLink,
  Flame,
  Layers,
  Loader2,
  Radar,
  RotateCcw,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import type {
  AnySite,
  ConfidenceLevel,
  EarthAnalogSite,
  EarthLayerId,
  MatchResult,
  PlanetarySite,
  PowerClimatology,
  ReverseMatchResult,
  WorldId,
} from '../types/mem';
import { GIBS_LAYERS, loadGibsWmsImage } from '../utils/nasaApis';
import { getPlanetaryTextures } from '../utils/planetaryTextures';
import { ConfidenceTooltipBadge } from './SiteAnalysisSection';
import radarAridImg from '../assets/images/radar_atacama_1794639622099.jpg';
import radarVolcanicImg from '../assets/images/radar_iceland_1794639623414.jpg';
import radarCraterImg from '../assets/images/radar_devon_1794639623982.jpg';

const RADAR_IMAGE_BY_KEY: Record<string, string> = {
  'arid-ridges': radarAridImg,
  'volcanic-flows': radarVolcanicImg,
  'impact-crater': radarCraterImg,
};

interface ThreeWorldsSectionProps {
  moonSites: PlanetarySite[];
  marsSites: PlanetarySite[];
  earthSites: EarthAnalogSite[];
  selectedSite: AnySite;
  activeTargetSite: PlanetarySite;
  onSelectSite: (site: AnySite) => void;
  rankedEarthMatches: MatchResult[];
  bestPlanetaryMatch: ReverseMatchResult | null;
  simulatorWinningEarthId: string | null;
  earthLayer: EarthLayerId;
  onChangeEarthLayer: (layer: EarthLayerId) => void;
  similarityHeatmap: boolean;
  onToggleSimilarityHeatmap: () => void;
  powerCache: Record<string, PowerClimatology>;
  powerLoadingId: string | null;
  onOpenInSimulator: (site: PlanetarySite) => void;
  onOpenReport: () => void;
  onSceneReady: () => void;
  highlightedForTour?: 'worlds' | 'sites' | 'layers' | null;
}

function latLonToLocalVector(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

function getQuaternionToFaceCamera(localNormal: THREE.Vector3): THREE.Quaternion {
  const n = localNormal.clone().normalize();
  const targetDir = new THREE.Vector3(0, 0.12, 1).normalize();
  return new THREE.Quaternion().setFromUnitVectors(n, targetDir);
}

// Custom Fresnel atmospheric rim shader (used ONLY on Earth and Mars, never Moon)
function createAtmosphereMesh(radius: number, colorHex: number, intensity = 0.65): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius * 1.075, 48, 32);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uIntensity: { value: intensity },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vec3 viewDir = normalize(vViewPos);
        float fresnel = pow(1.0 - max(0.0, dot(viewDir, vNormal)), 3.2);
        gl_FragColor = vec4(uColor, fresnel * uIntensity);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
  return new THREE.Mesh(geo, mat);
}

function getHeatmapHex(scorePct: number): number {
  if (scorePct >= 75) return 0x10b981; // Green = High match
  if (scorePct >= 55) return 0xf59e0b; // Amber = Medium match
  return 0xef4444; // Red = Low match
}

function getHeatmapTier(scorePct: number): 'high' | 'medium' | 'low' {
  if (scorePct >= 75) return 'high';
  if (scorePct >= 55) return 'medium';
  return 'low';
}

function confidenceBadgeStyle(level: ConfidenceLevel): string {
  if (level === 'High') return 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300';
  if (level === 'Medium') return 'border-amber-500/50 bg-amber-500/15 text-amber-300';
  return 'border-rose-500/50 bg-rose-500/15 text-rose-300';
}

// Pre-allocated math helpers outside render loop
const _projVec = new THREE.Vector3();
const _worldPosA = new THREE.Vector3();
const _worldPosB = new THREE.Vector3();
const _worldCenter = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _midArc = new THREE.Vector3();
const _curveVec = new THREE.Vector3();
const _deltaQuat = new THREE.Quaternion();
const _axisY = new THREE.Vector3(0, 1, 0);
const _axisX = new THREE.Vector3(1, 0, 0);

interface ProjectedMarker {
  id: string;
  name: string;
  world: WorldId;
  dataStatus: 'Live' | 'Pre-processed';
  x: number;
  y: number;
  visible: boolean;
  isSelected: boolean;
  rankIndex: number; // 0, 1, 2 for top 3 Earth matches, -1 otherwise
  earthScorePct?: number;
}

const WORLD_SPECS: Array<{
  id: WorldId;
  label: string;
  accent: string;
  radius: string;
  gravity: string;
  dayLength: string;
}> = [
  {
    id: 'moon',
    label: 'Moon',
    accent: 'text-slate-300',
    radius: '1,737.4 km',
    gravity: '1.62 m/s² (0.165g)',
    dayLength: '708.7 hrs',
  },
  {
    id: 'earth',
    label: 'Earth',
    accent: 'text-sky-400',
    radius: '6,371.0 km',
    gravity: '9.81 m/s² (1.00g)',
    dayLength: '23.93 hrs',
  },
  {
    id: 'mars',
    label: 'Mars',
    accent: 'text-orange-400',
    radius: '3,389.5 km',
    gravity: '3.72 m/s² (0.379g)',
    dayLength: '24.62 hrs',
  },
];

export const ThreeWorldsSection: React.FC<ThreeWorldsSectionProps> = ({
  moonSites,
  marsSites,
  earthSites,
  selectedSite,
  activeTargetSite,
  onSelectSite,
  rankedEarthMatches,
  bestPlanetaryMatch,
  simulatorWinningEarthId,
  earthLayer,
  onChangeEarthLayer,
  similarityHeatmap,
  onToggleSimilarityHeatmap,
  powerCache,
  powerLoadingId,
  onOpenInSimulator,
  onOpenReport,
  onSceneReady,
  highlightedForTour,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [markers2D, setMarkers2D] = useState<ProjectedMarker[]>([]);
  const [layerLoading, setLayerLoading] = useState(false);
  const [layerNotice, setLayerNotice] = useState<string | null>(null);
  const [showRadarModal, setShowRadarModal] = useState(false);

  const allSites = useMemo<AnySite[]>(
    () => [...moonSites, ...marsSites, ...earthSites],
    [moonSites, marsSites, earthSites]
  );

  // Map each Earth site ID -> live similarity score & rank index (0, 1, 2 for Top 3)
  const earthScoreMap = useMemo(() => {
    const map: Record<string, { score: number; rank: number }> = {};
    rankedEarthMatches.forEach((m, idx) => {
      map[m.earthSite.id] = { score: m.similarityPct, rank: idx };
    });
    return map;
  }, [rankedEarthMatches]);

  // Top 3 Earth site IDs for multi-arc drawing
  const top3Matches = useMemo(() => rankedEarthMatches.slice(0, 3), [rankedEarthMatches]);

  const activeArcPairs = useMemo(() => {
    if (selectedSite.world === 'earth') {
      return bestPlanetaryMatch
        ? [{ fromId: selectedSite.id, toId: bestPlanetaryMatch.planetarySite.id, rank: 0 }]
        : [];
    }
    return top3Matches.map((m, idx) => ({
      fromId: selectedSite.id,
      toId: m.earthSite.id,
      rank: idx,
    }));
  }, [selectedSite, top3Matches, bestPlanetaryMatch]);

  // Sync reactive state into refs so the WebGL animation loop never restarts
  const onSelectSiteRef = useRef(onSelectSite);
  onSelectSiteRef.current = onSelectSite;
  const selectedSiteRef = useRef(selectedSite);
  selectedSiteRef.current = selectedSite;
  const activeArcPairsRef = useRef(activeArcPairs);
  activeArcPairsRef.current = activeArcPairs;
  const earthScoreMapRef = useRef(earthScoreMap);
  earthScoreMapRef.current = earthScoreMap;
  const similarityHeatmapRef = useRef(similarityHeatmap);
  similarityHeatmapRef.current = similarityHeatmap;
  const earthWinSimRef = useRef(simulatorWinningEarthId);
  earthWinSimRef.current = simulatorWinningEarthId;

  const globeObjectsRef = useRef<{
    moonGroup: THREE.Group;
    earthGroup: THREE.Group;
    marsGroup: THREE.Group;
    earthMesh: THREE.Mesh;
    targetQuats: Record<WorldId, THREE.Quaternion | null>;
    resetView: () => void;
  } | null>(null);

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = mountEl.clientWidth || 1200;
    const height = mountEl.clientHeight || 520;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050811);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 150);
    camera.position.set(0, 4.8, 25);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mountEl.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.72);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff7ed, 2.35);
    sunLight.position.set(9, 6, 12);
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.6);
    rimLight.position.set(-10, -4, -9);
    scene.add(rimLight);

    // Procedural deep-space starfield
    const starCount = 1100;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 30 + Math.random() * 65;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xcbd5e1,
      size: 0.11,
      transparent: true,
      opacity: 0.72,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const textures = getPlanetaryTextures(maxAniso);

    const RADII: Record<WorldId, number> = {
      moon: 1.08,
      earth: 1.56,
      mars: 1.24,
    };
    const sphereSegments = isSoftwareGl ? 36 : 56;

    // MOON (No atmosphere)
    const moonGroup = new THREE.Group();
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(RADII.moon, sphereSegments, sphereSegments),
      new THREE.MeshStandardMaterial({
        map: textures.moonColor,
        bumpMap: textures.moonBump,
        bumpScale: 0.04,
        roughness: 0.92,
        metalness: 0.04,
      })
    );
    moonMesh.userData.worldId = 'moon';
    moonGroup.add(moonMesh);
    scene.add(moonGroup);

    // EARTH (Blue Marble + bump + clouds + atmosphere)
    const earthGroup = new THREE.Group();
    const earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(RADII.earth, sphereSegments, sphereSegments),
      new THREE.MeshStandardMaterial({
        map: textures.earthColor,
        bumpMap: textures.earthBump,
        bumpScale: 0.045,
        roughness: 0.65,
        metalness: 0.08,
      })
    );
    earthMesh.userData.worldId = 'earth';
    earthGroup.add(earthMesh);

    const cloudMesh = new THREE.Mesh(
      new THREE.SphereGeometry(RADII.earth * 1.016, sphereSegments, sphereSegments),
      new THREE.MeshStandardMaterial({
        map: textures.earthClouds,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        roughness: 0.9,
      })
    );
    earthGroup.add(cloudMesh);
    earthGroup.add(createAtmosphereMesh(RADII.earth, 0x38bdf8, 0.78));
    scene.add(earthGroup);

    // MARS (Viking/MGS + MOLA bump + atmosphere)
    const marsGroup = new THREE.Group();
    const marsMesh = new THREE.Mesh(
      new THREE.SphereGeometry(RADII.mars, sphereSegments, sphereSegments),
      new THREE.MeshStandardMaterial({
        map: textures.marsColor,
        bumpMap: textures.marsBump,
        bumpScale: 0.055,
        roughness: 0.88,
        metalness: 0.04,
      })
    );
    marsMesh.userData.worldId = 'mars';
    marsGroup.add(marsMesh);
    marsGroup.add(createAtmosphereMesh(RADII.mars, 0xf97316, 0.55));
    scene.add(marsGroup);

    const worldGroups: Record<WorldId, THREE.Group> = {
      moon: moonGroup,
      earth: earthGroup,
      mars: marsGroup,
    };

    let targetCamZ = 10.6;
    const applyLayoutPositions = (w: number) => {
      const isMobile = w < 768;
      if (isMobile) {
        moonGroup.position.set(0, 3.65, 0);
        earthGroup.position.set(0, 0, 0);
        marsGroup.position.set(0, -3.65, 0);
        targetCamZ = 13.8;
      } else {
        moonGroup.position.set(-4.15, 0, 0);
        earthGroup.position.set(0, 0, 0);
        marsGroup.position.set(4.15, 0, 0);
        targetCamZ = 10.2;
      }
    };
    applyLayoutPositions(width);

    // Create clickable 3D markers for all 21 sites (6 Moon + 5 Mars + 10 Earth)
    const markerMeshes: THREE.Mesh[] = [];
    const markerMap = new Map<
      string,
      { mesh: THREE.Mesh; ring: THREE.Mesh; world: WorldId; site: AnySite }
    >();

    const markerGeo = new THREE.SphereGeometry(0.052, 14, 14);
    const ringGeo = new THREE.RingGeometry(0.075, 0.118, 22);

    allSites.forEach((site) => {
      const r = RADII[site.world] * 1.022;
      const localPos = latLonToLocalVector(site.lat, site.lon, r);
      const color =
        site.world === 'earth'
          ? 0x22d3ee
          : site.world === 'mars'
            ? 0xf97316
            : 0xe2e8f0;

      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(markerGeo, mat);
      mesh.position.copy(localPos);
      mesh.userData.siteId = site.id;
      mesh.userData.worldId = site.world;

      const ringMat = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.78,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(localPos.clone().multiplyScalar(1.005));
      ring.lookAt(localPos.clone().multiplyScalar(2));

      worldGroups[site.world].add(mesh);
      worldGroups[site.world].add(ring);
      markerMeshes.push(mesh);
      markerMap.set(site.id, { mesh, ring, world: site.world, site });
    });

    // 3 reusable Bezier arcs + pulse packets connecting Moon/Mars target to Top 3 Earth matches
    const ARC_SEGMENTS = 64;
    const arcSpecs = [
      { color: 0x22d3ee, opacity: 0.95, pulseColor: 0xf59e0b }, // #1 Best match
      { color: 0x38bdf8, opacity: 0.58, pulseColor: 0x22d3ee }, // #2 Runner-up
      { color: 0x64748b, opacity: 0.42, pulseColor: 0x94a3b8 }, // #3 Third match
    ];

    const arcObjects = arcSpecs.map((spec) => {
      const positions = new Float32Array((ARC_SEGMENTS + 1) * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({
          color: spec.color,
          transparent: true,
          opacity: spec.opacity,
        })
      );
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);

      const pulse = new THREE.Mesh(
        new THREE.SphereGeometry(0.048, 10, 10),
        new THREE.MeshBasicMaterial({ color: spec.pulseColor })
      );
      pulse.visible = false;
      scene.add(pulse);

      return {
        line,
        geo,
        pulse,
        curve: new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(),
          new THREE.Vector3(),
          new THREE.Vector3()
        ),
      };
    });

    // Interaction state
    const targetQuats: Record<WorldId, THREE.Quaternion | null> = {
      moon: null,
      earth: null,
      mars: null,
    };

    // Initial angles showcasing Asia/Africa/Europe/Americas and planetary features
    earthGroup.quaternion.setFromEuler(new THREE.Euler(0.28, -2.55, 0));
    moonGroup.quaternion.setFromEuler(new THREE.Euler(0.15, -1.6, 0));
    marsGroup.quaternion.setFromEuler(new THREE.Euler(0.18, -2.1, 0));

    let activeDragWorld: WorldId | null = null;
    let isDragging = false;
    let dragDist = 0;
    let prevX = 0;
    let prevY = 0;
    let zoomOffset = 0;

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const globeMeshes = [moonMesh, earthMesh, marsMesh];

    const updateNdc = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (e: PointerEvent) => {
      updateNdc(e.clientX, e.clientY);
      prevX = e.clientX;
      prevY = e.clientY;
      dragDist = 0;
      isDragging = true;

      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(globeMeshes, false);
      if (hits.length > 0) {
        activeDragWorld = hits[0].object.userData.worldId as WorldId;
        targetQuats[activeDragWorld] = null;
      } else {
        activeDragWorld = 'earth';
      }
      renderer.domElement.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging || !activeDragWorld) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      dragDist += Math.hypot(dx, dy);
      prevX = e.clientX;
      prevY = e.clientY;

      const group = worldGroups[activeDragWorld];
      _deltaQuat.setFromAxisAngle(_axisY, dx * 0.0065);
      group.quaternion.premultiply(_deltaQuat);
      _deltaQuat.setFromAxisAngle(_axisX, dy * 0.0055);
      group.quaternion.premultiply(_deltaQuat);
      group.quaternion.normalize();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (renderer.domElement.hasPointerCapture(e.pointerId)) {
        renderer.domElement.releasePointerCapture(e.pointerId);
      }
      const wasClick = dragDist < 6;
      isDragging = false;
      activeDragWorld = null;

      if (wasClick) {
        updateNdc(e.clientX, e.clientY);
        raycaster.setFromCamera(pointerNdc, camera);
        const markerHits = raycaster.intersectObjects(markerMeshes, false);
        if (markerHits.length > 0) {
          const siteId = markerHits[0].object.userData.siteId as string;
          const found = allSites.find((s) => s.id === siteId);
          if (found) onSelectSiteRef.current(found);
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomOffset = THREE.MathUtils.clamp(zoomOffset + e.deltaY * 0.004, -3.4, 4.5);
    };

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointermove', onPointerMove);
    dom.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    const resetView = () => {
      zoomOffset = 0;
      targetQuats.moon = null;
      targetQuats.earth = null;
      targetQuats.mars = null;
      camera.position.set(0, 0.2, targetCamZ);
    };

    globeObjectsRef.current = {
      moonGroup,
      earthGroup,
      marsGroup,
      earthMesh,
      targetQuats,
      resetView,
    };

    const handleResize = () => {
      if (!mountEl) return;
      const w = mountEl.clientWidth;
      const h = mountEl.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      applyLayoutPositions(w);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mountEl);

    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();
    let lastProjectionTime = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      const desiredZ = targetCamZ + zoomOffset;
      camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredZ, 2.8, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, 0.15, 2.8, dt);
      camera.lookAt(0, 0, 0);

      cloudMesh.rotation.y += dt * 0.025;
      stars.rotation.y += dt * 0.004;

      (['moon', 'earth', 'mars'] as WorldId[]).forEach((wId) => {
        const grp = worldGroups[wId];
        const tQuat = targetQuats[wId];
        if (tQuat) {
          grp.quaternion.slerp(tQuat, 1 - Math.exp(-4.5 * dt));
          if (grp.quaternion.angleTo(tQuat) < 0.006) {
            targetQuats[wId] = null;
          }
        } else if (activeDragWorld !== wId && selectedSiteRef.current.world !== wId) {
          _deltaQuat.setFromAxisAngle(_axisY, dt * 0.08);
          grp.quaternion.premultiply(_deltaQuat);
        }
      });

      // Update marker colors (Similarity Heatmap mode vs standard world colors) & pulsing rings
      const pairs = activeArcPairsRef.current;
      const scores = earthScoreMapRef.current;
      const heatmapOn = similarityHeatmapRef.current;

      markerMap.forEach((entry, id) => {
        const isSel = selectedSiteRef.current.id === id;
        const isSimWin = earthWinSimRef.current === id;
        const arcEntry = pairs.find((p) => p.toId === id);
        const rankIdx = arcEntry ? arcEntry.rank : -1;

        let markerHex =
          entry.world === 'earth' ? 0x22d3ee : entry.world === 'mars' ? 0xf97316 : 0xe2e8f0;

        if (heatmapOn && entry.world === 'earth' && scores[id] !== undefined) {
          markerHex = getHeatmapHex(scores[id].score);
        }

        (entry.mesh.material as THREE.MeshBasicMaterial).color.setHex(markerHex);

        const ringHex =
          heatmapOn && entry.world === 'earth'
            ? markerHex
            : isSel
              ? 0xffffff
              : isSimWin || rankIdx === 0
                ? 0xf59e0b
                : rankIdx >= 1
                  ? 0x38bdf8
                  : markerHex;

        (entry.ring.material as THREE.MeshBasicMaterial).color.setHex(ringHex);

        const baseScale = isSel || isSimWin || rankIdx === 0 ? 1.55 : rankIdx > 0 ? 1.25 : 1.0;
        const pulse = 1 + 0.22 * Math.sin(elapsed * 3.5);
        entry.ring.scale.setScalar(
          baseScale * (isSel || isSimWin || rankIdx >= 0 ? pulse : 1)
        );
      });

      // Update Top-3 Bezier Arcs
      arcObjects.forEach((arcObj, idx) => {
        const pair = pairs[idx];
        const fromEntry = pair ? markerMap.get(pair.fromId) : null;
        const toEntry = pair ? markerMap.get(pair.toId) : null;

        if (fromEntry && toEntry) {
          arcObj.line.visible = true;
          arcObj.pulse.visible = true;

          fromEntry.mesh.getWorldPosition(_worldPosA);
          toEntry.mesh.getWorldPosition(_worldPosB);
          _midArc.copy(_worldPosA).add(_worldPosB).multiplyScalar(0.5);
          _midArc.y += 1.55 - idx * 0.28;
          _midArc.z += 1.25 + idx * 0.2;

          arcObj.curve.v0.copy(_worldPosA);
          arcObj.curve.v1.copy(_midArc);
          arcObj.curve.v2.copy(_worldPosB);

          const posAttr = arcObj.geo.getAttribute('position') as THREE.BufferAttribute;
          for (let i = 0; i <= ARC_SEGMENTS; i++) {
            arcObj.curve.getPoint(i / ARC_SEGMENTS, _curveVec);
            posAttr.setXYZ(i, _curveVec.x, _curveVec.y, _curveVec.z);
          }
          posAttr.needsUpdate = true;

          const t = (elapsed * (0.44 - idx * 0.06) + idx * 0.25) % 1;
          arcObj.curve.getPoint(t, arcObj.pulse.position);
        } else {
          arcObj.line.visible = false;
          arcObj.pulse.visible = false;
        }
      });

      renderer.render(scene, camera);

      // Update projected 2D HTML site labels
      if (elapsed - lastProjectionTime > 0.045) {
        lastProjectionTime = elapsed;
        const w = mountEl.clientWidth;
        const h = mountEl.clientHeight;
        const nextMarkers: ProjectedMarker[] = [];

        markerMap.forEach((entry, id) => {
          entry.mesh.getWorldPosition(_worldPosA);
          worldGroups[entry.world].getWorldPosition(_worldCenter);
          _toCam.copy(camera.position).sub(_worldCenter).normalize();
          const normal = _worldPosA.clone().sub(_worldCenter).normalize();
          const facing = normal.dot(_toCam);

          _projVec.copy(_worldPosA).project(camera);
          const x = ((_projVec.x + 1) / 2) * w;
          const y = ((-_projVec.y + 1) / 2) * h;

          const arcEntry = pairs.find((p) => p.toId === id);

          const siteMode: 'Live' | 'Pre-processed' =
            entry.world === 'earth' ? 'Live' : 'Pre-processed';

          nextMarkers.push({
            id,
            name: entry.site.name,
            world: entry.world,
            dataStatus: siteMode,
            x,
            y,
            visible: facing > 0.14 && _projVec.z < 1,
            isSelected: selectedSiteRef.current.id === id,
            rankIndex: arcEntry ? arcEntry.rank : -1,
            earthScorePct: entry.world === 'earth' ? scores[id]?.score : undefined,
          });
        });

        setMarkers2D(nextMarkers);
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();
    onSceneReady();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('wheel', onWheel);
      renderer.dispose();
      if (dom.parentNode === mountEl) {
        mountEl.removeChild(dom);
      }
    };
  }, [allSites, onSceneReady]);

  // Center selected globe & primary #1 matched globe smoothly
  useEffect(() => {
    const objs = globeObjectsRef.current;
    if (!objs) return;

    const localVec = latLonToLocalVector(selectedSite.lat, selectedSite.lon, 1);
    objs.targetQuats[selectedSite.world] = getQuaternionToFaceCamera(localVec);

    const primaryToId = activeArcPairs[0]?.toId;
    if (primaryToId) {
      const matched = allSites.find((s) => s.id === primaryToId);
      if (matched) {
        const mLocal = latLonToLocalVector(matched.lat, matched.lon, 1);
        objs.targetQuats[matched.world] = getQuaternionToFaceCamera(mLocal);
      }
    }
  }, [selectedSite, activeArcPairs, allSites]);

  // Switch Earth GIBS texture layer
  useEffect(() => {
    const objs = globeObjectsRef.current;
    if (!objs) return;
    let cancelled = false;

    const applyEarthTexture = async () => {
      const mat = objs.earthMesh.material as THREE.MeshStandardMaterial;
      const fallbackTextures = getPlanetaryTextures(4);

      setLayerLoading(true);
      setLayerNotice(null);
      const img = await loadGibsWmsImage(earthLayer);
      if (cancelled) return;

      if (img) {
        const tex = new THREE.Texture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        mat.map = tex;
        mat.needsUpdate = true;
        setLayerNotice(
          `Live NASA GIBS: ${GIBS_LAYERS[earthLayer].dataset} (${GIBS_LAYERS[earthLayer].resolution})`
        );
      } else {
        mat.map =
          earthLayer === 'modis-lst'
            ? fallbackTextures.earthModisLstFallback
            : fallbackTextures.earthColor;
        mat.needsUpdate = true;
        setLayerNotice(
          `${GIBS_LAYERS[earthLayer].shortLabel} offline — showing calibrated fallback`
        );
      }
      setLayerLoading(false);
    };

    applyEarthTexture();
    return () => {
      cancelled = true;
    };
  }, [earthLayer]);

  const primaryMatch = top3Matches[0] ?? null;
  const inspectedMatchForSelectedEarth =
    selectedSite.world === 'earth'
      ? rankedEarthMatches.find((m) => m.earthSite.id === selectedSite.id) ?? primaryMatch
      : primaryMatch;

  const activeEarthForPower =
    selectedSite.world === 'earth'
      ? (selectedSite as EarthAnalogSite)
      : primaryMatch?.earthSite ?? null;

  const activePower = activeEarthForPower ? powerCache[activeEarthForPower.id] : undefined;
  const isPowerLoading =
    activeEarthForPower !== null && powerLoadingId === activeEarthForPower.id;

  const radarTargetEarth =
    selectedSite.world === 'earth'
      ? (selectedSite as EarthAnalogSite)
      : primaryMatch?.earthSite ?? null;

  const radarImgSrc =
    radarTargetEarth?.radarView.available && radarTargetEarth.radarView.imageKey
      ? RADAR_IMAGE_BY_KEY[radarTargetEarth.radarView.imageKey]
      : null;

  return (
    <section
      id="worlds"
      className="relative mx-auto max-w-[1280px] px-5 pt-10 pb-16 md:px-8"
    >
      {/* Header + Earth GIBS Layer Switcher + Similarity Heatmap Toggle */}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-cyan-400">
            01. Planetary Stage
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-100 md:text-3xl">
            Moon, Earth &amp; Mars in Synchronized 3D
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Click any Moon or Mars target to rank all 10 Earth analogs and trace live 3D arcs to the top 3 matches.
          </p>
        </div>

        <div
          className={`flex flex-wrap items-center gap-2 rounded-lg border p-1.5 bg-[#0D1321] transition-colors ${
            highlightedForTour === 'layers'
              ? 'border-cyan-400 ring-2 ring-cyan-400/40'
              : 'border-slate-800'
          }`}
        >
          <span className="inline-flex items-center gap-1.5 px-2 text-xs font-mono text-slate-400">
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <span>Earth GIBS:</span>
          </span>
          {(Object.keys(GIBS_LAYERS) as EarthLayerId[]).map((layerId) => {
            const active = earthLayer === layerId;
            return (
              <button
                key={layerId}
                type="button"
                onClick={() => onChangeEarthLayer(layerId)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {GIBS_LAYERS[layerId].shortLabel}
              </button>
            );
          })}
          {layerLoading && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400 mx-0.5" />
          )}

          {/* Similarity Heatmap Toggle */}
          <button
            type="button"
            onClick={onToggleSimilarityHeatmap}
            className={`ml-1 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              similarityHeatmap
                ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                : 'border-slate-700 bg-[#080C17] text-slate-300 hover:border-slate-500'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Similarity heatmap</span>
          </button>

          <button
            type="button"
            onClick={() => globeObjectsRef.current?.resetView()}
            title="Reset globe zoom"
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-slate-500 hover:text-white cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* 3D WebGL Globe Stage */}
      <div
        className={`relative w-full overflow-hidden rounded-xl border bg-[#050811] transition-all ${
          highlightedForTour === 'worlds'
            ? 'border-cyan-400 ring-2 ring-cyan-400/35'
            : 'border-slate-800'
        }`}
      >
        <div
          ref={canvasMountRef}
          className="h-[680px] md:h-[510px] w-full cursor-grab active:cursor-grabbing"
          aria-label="Interactive 3D globes of Moon, Earth, and Mars"
        />

        {/* Projected 2D Site Labels */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {markers2D.map((m) => {
            if (!m.visible) return null;
            const tier =
              similarityHeatmap && m.world === 'earth' && m.earthScorePct !== undefined
                ? getHeatmapTier(m.earthScorePct)
                : null;

            const heatmapBorder =
              tier === 'high'
                ? 'border-emerald-400 bg-emerald-950/95 text-emerald-100'
                : tier === 'medium'
                  ? 'border-amber-400 bg-amber-950/95 text-amber-100'
                  : tier === 'low'
                    ? 'border-rose-400 bg-rose-950/95 text-rose-100'
                    : '';

            const dotClass =
              tier === 'high'
                ? 'bg-emerald-400'
                : tier === 'medium'
                  ? 'bg-amber-400'
                  : tier === 'low'
                    ? 'bg-rose-400'
                    : m.world === 'earth'
                      ? 'bg-sky-400'
                      : m.world === 'mars'
                        ? 'bg-orange-400'
                        : 'bg-slate-300';

            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  const s = allSites.find((item) => item.id === m.id);
                  if (s) onSelectSite(s);
                }}
                style={{
                  transform: `translate3d(${m.x}px, ${m.y}px, 0) translate(-50%, -135%)`,
                }}
                className={`pointer-events-auto absolute left-0 top-0 flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  heatmapBorder
                    ? heatmapBorder
                    : m.isSelected
                      ? 'z-20 border-white bg-[#090F1E] text-white shadow-lg'
                      : m.rankIndex === 0
                        ? 'z-10 border-amber-400 bg-[#090F1E]/95 text-amber-200'
                        : m.rankIndex > 0
                          ? 'z-10 border-cyan-500/70 bg-[#090F1E]/95 text-cyan-200'
                          : 'border-slate-700/90 bg-[#090F1E]/88 text-slate-200 hover:border-cyan-400 hover:text-white'
                }`}
              >
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotClass}`} />
                <span>{m.name}</span>
                {m.world === 'earth' && m.earthScorePct !== undefined && (
                  <span className="font-mono text-[10px] font-bold">
                    {m.earthScorePct}%
                  </span>
                )}
                <span
                  className={`font-mono text-[9px] uppercase px-1 rounded-xs ${
                    m.dataStatus === 'Live'
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'bg-slate-700/60 text-slate-300'
                  }`}
                >
                  {m.dataStatus}
                </span>
              </button>
            );
          })}
        </div>

        {/* Bottom HUD status */}
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2">
          {layerNotice && (
            <div className="rounded border border-slate-800 bg-[#090F1E]/95 px-3 py-1.5 text-[11px] font-mono text-slate-300">
              {layerNotice}
            </div>
          )}

          {similarityHeatmap && (
            <div className="ml-auto rounded border border-slate-700 bg-[#090F1E]/95 px-3 py-1.5 text-[11px] font-mono text-slate-200 flex items-center gap-3">
              <span className="text-slate-400">Heatmap vs {activeTargetSite.name}:</span>
              <span className="text-emerald-400">● High (≥75%)</span>
              <span className="text-amber-400">● Med (55–74%)</span>
              <span className="text-rose-400">● Low (&lt;55%)</span>
            </div>
          )}
        </div>
      </div>

      {/* Real Physical World Specs */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {WORLD_SPECS.map((w) => (
          <div
            key={w.id}
            className="rounded-lg border border-slate-800/90 bg-[#0D1321] px-4 py-3"
          >
            <div className="flex items-center justify-between">
              <span className={`font-display text-sm font-bold ${w.accent}`}>
                {w.label}
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {w.id === 'moon'
                  ? 'No Atmosphere'
                  : w.id === 'earth'
                    ? 'N₂/O₂ Atmosphere'
                    : 'CO₂ Thin Atmosphere'}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-slate-500">Radius</div>
                <div className="font-mono text-slate-200">{w.radius}</div>
              </div>
              <div>
                <div className="text-slate-500">Gravity</div>
                <div className="font-mono text-slate-200">{w.gravity}</div>
              </div>
              <div>
                <div className="text-slate-500">Day Length</div>
                <div className="font-mono text-slate-200">{w.dayLength}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* SECTION 3: Clickable Sites Directory & Detailed Match Inspector */}
      <div
        id="sites"
        className={`mt-10 grid grid-cols-1 gap-6 lg:grid-cols-12 rounded-xl transition-all ${
          highlightedForTour === 'sites' ? 'ring-2 ring-cyan-400/50 p-2 -m-2' : ''
        }`}
      >
        {/* Left: All 6 Moon + 5 Mars + 10 Earth sites */}
        <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0D1321] p-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-cyan-400">
                02. Mission Targets &amp; Earth Analogs
              </p>
              <h3 className="font-display text-lg font-bold text-slate-100">
                21 Planetary &amp; Analog Sites
              </h3>
            </div>
            <Compass className="w-5 h-5 text-slate-400" />
          </div>

          <div className="mt-4 space-y-5">
            {/* Mars Target Markers (5) */}
            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="text-orange-400 font-semibold">Mars Targets (5)</span>
                <span>MOLA &amp; HiRISE</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {marsSites.map((s) => {
                  const active = selectedSite.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSelectSite(s)}
                      className={`text-left rounded-lg border px-3 py-2 transition-all cursor-pointer ${
                        active
                          ? 'border-orange-400 bg-orange-500/15 text-white'
                          : 'border-slate-800 bg-[#090E1A] text-slate-300 hover:border-orange-500/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-semibold truncate">{s.name}</span>
                        <span className="font-mono text-[9px] text-orange-300/80 shrink-0">
                          PDS
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] font-mono text-slate-400 truncate">
                        {s.lat.toFixed(2)}°, {s.lon.toFixed(2)}°
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Moon Target Markers (6) */}
            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="text-slate-200 font-semibold">Moon Targets (6)</span>
                <span>LRO LROC/LOLA &amp; Diviner</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {moonSites.map((s) => {
                  const active = selectedSite.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSelectSite(s)}
                      className={`text-left rounded-lg border px-3 py-2 transition-all cursor-pointer ${
                        active
                          ? 'border-slate-200 bg-slate-800/80 text-white'
                          : 'border-slate-800 bg-[#090E1A] text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-semibold truncate">{s.name}</span>
                        <span className="font-mono text-[9px] text-slate-400 shrink-0">
                          LRO
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] font-mono text-slate-400 truncate">
                        {s.lat.toFixed(2)}°, {s.lon.toFixed(2)}°
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Earth Analog Markers (10) */}
            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="text-sky-400 font-semibold">Earth Analogs (10)</span>
                <span>5 Mars · 5 Moon · Live POWER</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {earthSites.map((s) => {
                  const active = selectedSite.id === s.id;
                  const scoreInfo = earthScoreMap[s.id];
                  const isTop3 = scoreInfo && scoreInfo.rank < 3 && selectedSite.world !== 'earth';
                  const tier =
                    similarityHeatmap && scoreInfo ? getHeatmapTier(scoreInfo.score) : null;

                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSelectSite(s)}
                      className={`text-left rounded-lg border px-3 py-2 transition-all cursor-pointer ${
                        active
                          ? 'border-sky-400 bg-sky-500/15 text-white'
                          : tier === 'high'
                            ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-100'
                            : tier === 'medium'
                              ? 'border-amber-500/60 bg-amber-500/10 text-amber-100'
                              : tier === 'low'
                                ? 'border-rose-500/50 bg-rose-500/10 text-rose-100'
                                : isTop3
                                  ? 'border-amber-400/60 bg-amber-500/10 text-amber-100'
                                  : 'border-slate-800 bg-[#090E1A] text-slate-300 hover:border-sky-500/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-semibold truncate">{s.name}</span>
                        <span className="font-mono text-[10px] text-cyan-300 shrink-0">
                          {scoreInfo ? `${scoreInfo.score}%` : 'Live'}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span className="truncate">
                          {s.expectedTwinWorld.toUpperCase()} analog · {s.lat.toFixed(1)}°, {s.lon.toFixed(1)}°
                        </span>
                        <span className="text-cyan-400/80 ml-1 shrink-0">Live</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Site Telemetry Dossier + Top 3 Ranked Twins + Confidence Badge */}
        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#0D1321] p-5 flex flex-col justify-between space-y-4">
          <div>
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400">
                  <span
                    className={
                      selectedSite.world === 'moon'
                        ? 'text-slate-200 font-semibold'
                        : selectedSite.world === 'mars'
                          ? 'text-orange-400 font-semibold'
                          : 'text-sky-400 font-semibold'
                    }
                  >
                    {selectedSite.world.toUpperCase()}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedSite.region}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {selectedSite.lat.toFixed(2)}°, {selectedSite.lon.toFixed(2)}°
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-cyan-300">
                    {selectedSite.world === 'earth' ? 'Live NASA POWER + Pre-processed' : 'Pre-processed PDS'}
                  </span>
                </div>
                <h3 className="mt-1 font-display text-2xl font-bold text-white">
                  {selectedSite.name}
                </h3>
                <p className="mt-1 text-sm text-slate-300 max-w-2xl">
                  {selectedSite.summary}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedSite.world !== 'earth' && (
                  <button
                    type="button"
                    onClick={() => onOpenInSimulator(selectedSite as PlanetarySite)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/60 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-colors cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Tune in Simulator</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpenReport}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-white transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Report</span>
                </button>
              </div>
            </div>

            {/* Telemetry Cards powered directly by the 5-Factor Sub-Factors */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-[#080C17] p-3.5">
                <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-slate-400">
                  <span>Terrain &amp; Geology</span>
                  <span className="text-slate-300">
                    {selectedSite.terrain.rock_soil_type.mode === 'live' ? 'Live' : 'Pre-processed'}
                  </span>
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-100 capitalize">
                  {selectedSite.terrain.rock_soil_type.value ?? 'Unclassified'} ·{' '}
                  {selectedSite.terrain.slope_deg.value ?? '—'}° slope
                </div>
                <div className="mt-1.5 text-[10px] font-mono text-cyan-400/90 leading-relaxed">
                  {selectedSite.terrain.rock_soil_type.dataset} via{' '}
                  {selectedSite.terrain.rock_soil_type.source}
                  <br />
                  Res: {selectedSite.terrain.rock_soil_type.resolution} · Roughness:{' '}
                  {selectedSite.terrain.roughness_index.value ?? '—'}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#080C17] p-3.5">
                <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-slate-400">
                  <span>Elevation &amp; Rock Abundance</span>
                  <span className="text-slate-300">
                    {selectedSite.terrain.elevation_m.mode === 'live' ? 'Live' : 'Pre-processed'}
                  </span>
                </div>
                <div className="mt-1 font-mono text-lg font-semibold text-slate-100">
                  {(selectedSite.terrain.elevation_m.value ?? 0).toLocaleString()} m
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    ({selectedSite.terrain.rock_abundance_pct.value ?? '—'}% rock)
                  </span>
                </div>
                <div className="mt-1 text-[10px] font-mono text-cyan-400/90 leading-relaxed">
                  {selectedSite.terrain.elevation_m.dataset} via{' '}
                  {selectedSite.terrain.elevation_m.source}
                  <br />
                  DEM Res: {selectedSite.terrain.elevation_m.resolution} · Coverage:{' '}
                  {Math.round((selectedSite.data_quality.coverage.value ?? 0) * 100)}%
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#080C17] p-3.5">
                <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-slate-400">
                  <span>Temperature Range</span>
                  <span className={selectedSite.world === 'earth' ? 'text-emerald-300' : 'text-slate-300'}>
                    {selectedSite.world === 'earth'
                      ? activePower?.isLive
                        ? 'Live'
                        : 'Pre-processed'
                      : 'Pre-processed'}
                  </span>
                </div>
                {selectedSite.world === 'earth' ? (
                  <div className="mt-1 font-mono text-lg font-semibold text-slate-100">
                    {(
                      activePower?.tMinC ??
                      (selectedSite as EarthAnalogSite).climate.temp_night_c.value ??
                      0
                    ).toFixed(1)}{' '}
                    °C to{' '}
                    {(
                      activePower?.tMaxC ??
                      (selectedSite as EarthAnalogSite).climate.temp_day_c.value ??
                      0
                    ).toFixed(1)}{' '}
                    °C
                  </div>
                ) : (
                  <div className="mt-1 font-mono text-lg font-semibold text-slate-100">
                    {selectedSite.climate.temp_night_c.value ?? '—'} °C to{' '}
                    {selectedSite.climate.temp_day_c.value ?? '—'} °C
                  </div>
                )}
                <div className="mt-1 text-[10px] font-mono text-cyan-400/90 leading-relaxed">
                  {selectedSite.world === 'earth' && activePower?.isLive
                    ? `${activePower.dataset} · Res: ${activePower.resolution}`
                    : `${selectedSite.climate.temp_day_c.dataset} via ${selectedSite.climate.temp_day_c.source} · Res: ${selectedSite.climate.temp_day_c.resolution}`}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#080C17] p-3.5">
                <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-slate-400">
                  <span>Radiation &amp; Comm Delay</span>
                  <span className="text-slate-300">
                    {selectedSite.climate.radiation_proxy.mode === 'live' ? 'Live' : 'Pre-processed'}
                  </span>
                </div>
                <div className="mt-1 font-mono text-sm font-semibold text-slate-100">
                  Rad Proxy {((selectedSite.climate.radiation_proxy.value ?? 0) * 100).toFixed(0)}% ·{' '}
                  {selectedSite.operations.comm_delay_s.value ?? 0} s one-way
                </div>
                <div className="mt-1 text-[10px] font-mono text-cyan-400/90 leading-relaxed">
                  {selectedSite.climate.radiation_proxy.dataset} via{' '}
                  {selectedSite.climate.radiation_proxy.source}
                  <br />
                  Water/Ice: {selectedSite.resources.water_ice_presence.value ?? '—'} · Sunlight:{' '}
                  {selectedSite.resources.sunlight_hours_per_day.value ?? '—'} hrs/d
                </div>
              </div>
            </div>

            {/* Top 3 Earth Twin Arc Matches + Confidence Badge Tooltip */}
            {selectedSite.world !== 'earth' && top3Matches.length > 0 && (
              <div className="mt-4 rounded-lg border border-cyan-500/40 bg-cyan-950/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-500/20 pb-2.5">
                  <div>
                    <div className="text-xs font-mono uppercase tracking-wider text-cyan-300">
                      Top 3 Earth Analog Arcs for {selectedSite.name}
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      {top3Matches[0].reason}
                    </p>
                  </div>
                  <ConfidenceTooltipBadge
                    level={top3Matches[0].confidence}
                    scorePct={top3Matches[0].confidenceScorePct}
                    explanation={top3Matches[0].confidenceExplanation}
                  />
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {top3Matches.map((m, idx) => (
                    <button
                      key={m.earthSite.id}
                      type="button"
                      onClick={() => onSelectSite(m.earthSite)}
                      className={`text-left rounded-md border p-2.5 transition-colors cursor-pointer ${
                        idx === 0
                          ? 'border-amber-400/70 bg-amber-500/10 hover:bg-amber-500/20'
                          : 'border-slate-700 bg-[#080C17] hover:border-cyan-400'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-slate-400">#{idx + 1}</span>
                        <span
                          className={`font-mono font-bold ${
                            idx === 0 ? 'text-amber-300' : 'text-cyan-300'
                          }`}
                        >
                          {m.similarityPct}%
                        </span>
                      </div>
                      <div className="mt-1 text-xs font-semibold text-white truncate">
                        {m.earthSite.name}
                      </div>
                      <div className="mt-0.5 text-[10px] font-mono text-slate-400">
                        {m.confidence} conf · {m.earthSite.region.split(',')[0]}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedSite.world === 'earth' && bestPlanetaryMatch && (
              <div className="mt-4 rounded-lg border border-orange-500/40 bg-orange-950/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-mono uppercase tracking-wider text-orange-300">
                      Closest Moon / Mars Target Twin
                    </div>
                    <div className="mt-0.5 flex items-baseline gap-2.5">
                      <span className="font-display text-xl font-bold text-white">
                        {bestPlanetaryMatch.planetarySite.name}
                      </span>
                      <span className="text-xs font-mono uppercase text-orange-300">
                        {bestPlanetaryMatch.planetarySite.world}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-mono ${confidenceBadgeStyle(
                        bestPlanetaryMatch.confidence
                      )}`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {bestPlanetaryMatch.confidence} Confidence
                    </span>
                    <div className="text-right">
                      <div className="font-mono text-2xl font-bold text-orange-300">
                        {bestPlanetaryMatch.similarityPct}%
                      </div>
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-200">{bestPlanetaryMatch.reason}</p>
              </div>
            )}
          </div>

          {/* Live NASA POWER Climatology + Optional SAR Radar View */}
          {activeEarthForPower && (
            <div className="rounded-lg border border-slate-800 bg-[#080C17] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-sky-400">
                    NASA POWER Climatology · {activeEarthForPower.name}
                  </span>
                  {isPowerLoading ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-300">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Fetching live API...</span>
                    </span>
                  ) : (
                    <span
                      className={`text-[11px] font-mono ${
                        activePower?.isLive ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      {activePower?.isLive ? '● Live API' : '▲ Baseline'}
                    </span>
                  )}
                </div>

                {radarImgSrc && (
                  <button
                    type="button"
                    onClick={() => setShowRadarModal(true)}
                    className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-cyan-300 hover:border-cyan-400 cursor-pointer"
                  >
                    <Radar className="w-3.5 h-3.5" />
                    <span>SAR Radar View</span>
                  </button>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                <div>
                  <div className="text-slate-500">Day / Night Temp</div>
                  <div className="font-mono text-sm font-semibold text-slate-100">
                    {(activePower?.tMaxC ?? activeEarthForPower.climate.temp_day_c.value ?? 0).toFixed(1)}° /{' '}
                    {(activePower?.tMinC ?? activeEarthForPower.climate.temp_night_c.value ?? 0).toFixed(1)}°C
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Pressure / RH</div>
                  <div className="font-mono text-sm font-semibold text-slate-100">
                    {(activePower?.pressureKpa ?? activeEarthForPower.climate.air_pressure_kpa.value ?? 0).toFixed(1)} kPa ·{' '}
                    {(activePower?.humidityPct ?? activeEarthForPower.climate.humidity_pct.value ?? 0).toFixed(0)}%
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Wind Speed</div>
                  <div className="font-mono text-sm font-semibold text-slate-100">
                    {(activePower?.windSpeedMs ?? activeEarthForPower.climate.wind_speed_ms.value ?? 0).toFixed(1)} m/s
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Sunlight Hours</div>
                  <div className="font-mono text-sm font-semibold text-slate-100">
                    {(activePower?.sunlightHoursPerDay ?? activeEarthForPower.resources.sunlight_hours_per_day.value ?? 0).toFixed(1)} hrs/d
                  </div>
                </div>
              </div>

              {inspectedMatchForSelectedEarth && (
                <div className="mt-2.5 text-[11px] font-mono text-slate-400">
                  {inspectedMatchForSelectedEarth.confidenceExplanation}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Optional SAR Radar View Modal */}
      {showRadarModal && radarTargetEarth && radarImgSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setShowRadarModal(false)}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-slate-700 bg-[#0D1321] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-3">
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-cyan-400">
                  Orbital Synthetic Aperture Radar (SAR)
                </p>
                <h4 className="font-display text-xl font-bold text-white">
                  {radarTargetEarth.name} — Radar Backscatter
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowRadarModal(false)}
                className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-slate-800 bg-black">
              <img
                src={radarImgSrc}
                alt={`Synthetic Aperture Radar backscatter image of ${radarTargetEarth.name}`}
                referrerPolicy="no-referrer"
                className="w-full h-72 object-cover"
              />
            </div>

            <div className="mt-3 space-y-1 text-xs">
              <div className="font-mono text-cyan-300">
                Instrument: {radarTargetEarth.radarView.instrument} · Source: {radarTargetEarth.radarView.source}
              </div>
              <p className="text-slate-300">{radarTargetEarth.radarView.caption}</p>
              <a
                href="https://donnees-data.asc-csa.gc.ca/en/dataset/rcm"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 pt-1 text-cyan-400 hover:underline"
              >
                <span>Explore CSA RCM &amp; RADARSAT-1 Open Data</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
