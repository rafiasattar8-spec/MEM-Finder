import * as THREE from 'three';

/**
 * Procedural equirectangular planetary texture & elevation bump-map generator.
 * Ensures instant zero-404 rendering and exact (lat, lon) coordinate alignment
 * for Earth continents, Moon Maria, and Mars basins — even offline.
 */

// Fast deterministic 2D hash & FBM noise for surface micro-relief and cratering
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function valueNoise2(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, octaves = 4): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * valueNoise2(x * freq, y * freq);
    freq *= 2.04;
    amp *= 0.5;
  }
  return val;
}

// Convert (lat, lon) in degrees to equirectangular canvas (x, y)
function latLonToXY(lat: number, lon: number, w: number, h: number): [number, number] {
  const x = ((lon + 180) / 360) * w;
  const y = ((90 - lat) / 180) * h;
  return [x, y];
}

// Simplified authentic continental polygons [lat, lon] so Earth markers land precisely on real geography
const CONTINENT_POLYGONS: Array<Array<[number, number]>> = [
  // North America + Central America
  [
    [70, -165], [71, -155], [70, -135], [68, -110], [72, -94], [69, -82], [63, -78],
    [59, -64], [52, -55], [47, -53], [44, -65], [41, -70], [35, -75], [25, -80],
    [29, -83], [29, -90], [26, -97], [20, -96], [21, -87], [16, -84], [9, -82],
    [8, -77], [7, -81], [14, -92], [19, -104], [24, -107], [31, -114], [23, -110],
    [32, -117], [40, -124], [48, -125], [56, -135], [60, -148], [55, -162], [61, -166],
  ],
  // Greenland & Devon Island / Canadian High Arctic
  [
    [83, -34], [81, -18], [74, -20], [66, -34], [60, -44], [65, -53], [74, -57], [81, -62],
  ],
  [
    [77, -96], [76, -79], [74, -80], [74, -96],
  ],
  // South America
  [
    [11, -75], [10, -62], [6, -53], [0, -49], [-6, -35], [-15, -39], [-23, -42],
    [-33, -53], [-42, -64], [-54, -68], [-55, -71], [-46, -75], [-33, -72],
    [-20, -70], [-12, -77], [-5, -81], [2, -79], [9, -77],
  ],
  // Africa
  [
    [36, -6], [37, 10], [32, 15], [31, 32], [22, 37], [12, 44], [11, 51],
    [2, 45], [-8, 40], [-16, 40], [-26, 33], [-34, 26], [-34, 18], [-22, 14],
    [-12, 13], [4, 9], [5, -8], [14, -17], [24, -16], [33, -9],
  ],
  // Madagascar
  [
    [-12, 49], [-16, 50], [-25, 47], [-25, 44], [-17, 44],
  ],
  // Europe
  [
    [36, -9], [43, -9], [44, -2], [48, -5], [51, 2], [54, 8], [58, 5], [64, 10],
    [70, 20], [70, 30], [66, 40], [58, 30], [50, 38], [45, 36], [42, 28],
    [38, 24], [40, 18], [44, 14], [40, 15], [44, 8], [41, 2], [36, -5],
  ],
  // UK & Ireland + Iceland
  [
    [58, -6], [58, -2], [51, 1], [50, -5], [55, -6],
  ],
  [
    [66.4, -24], [66.2, -14], [63.5, -15], [63.8, -22],
  ],
  // Asia + Middle East + India + SE Asia
  [
    [41, 27], [42, 40], [45, 48], [68, 55], [72, 72], [75, 105], [71, 140],
    [66, 178], [60, 165], [52, 141], [43, 132], [35, 129], [39, 122], [31, 122],
    [22, 114], [12, 109], [8, 105], [13, 101], [2, 103], [8, 98], [21, 91],
    [16, 81], [8, 77], [22, 69], [25, 62], [26, 56], [23, 59], [13, 45],
    [22, 39], [31, 34], [36, 36],
  ],
  // Japan & Maritime SE Asia & New Zealand
  [[44, 145], [40, 142], [34, 136], [32, 130], [37, 137]],
  [[6, 100], [0, 104], [-6, 106], [-8, 114], [0, 117], [5, 115]],
  [[-35, 173], [-39, 178], [-46, 168], [-42, 171]],
  // Australia
  [
    [-12, 131], [-12, 136], [-15, 136], [-12, 142], [-20, 149], [-28, 153],
    [-37, 150], [-38, 141], [-33, 135], [-34, 115], [-22, 114], [-15, 125],
  ],
  // Antarctica
  [
    [-66, -180], [-65, -130], [-72, -100], [-63, -58], [-74, -50], [-70, 0],
    [-67, 60], [-66, 110], [-71, 165], [-78, 175], [-77, -170], [-90, 180], [-90, -180],
  ],
];

function drawContinentMask(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.beginPath();
  for (const poly of CONTINENT_POLYGONS) {
    poly.forEach(([lat, lon], idx) => {
      const [x, y] = latLonToXY(lat, lon, w, h);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }
}

export interface PlanetaryTextureSet {
  earthColor: THREE.CanvasTexture;
  earthBump: THREE.CanvasTexture;
  earthClouds: THREE.CanvasTexture;
  earthModisLstFallback: THREE.CanvasTexture;
  moonColor: THREE.CanvasTexture;
  moonBump: THREE.CanvasTexture;
  marsColor: THREE.CanvasTexture;
  marsBump: THREE.CanvasTexture;
}

let cachedSet: PlanetaryTextureSet | null = null;

export function getPlanetaryTextures(maxAnisotropy = 4): PlanetaryTextureSet {
  if (cachedSet) return cachedSet;

  const W = 1024;
  const H = 512;

  // 1. EARTH COLOR + BUMP + MODIS LST FALLBACK
  const eColorCanvas = document.createElement('canvas');
  eColorCanvas.width = W;
  eColorCanvas.height = H;
  const ec = eColorCanvas.getContext('2d')!;

  const eBumpCanvas = document.createElement('canvas');
  eBumpCanvas.width = W;
  eBumpCanvas.height = H;
  const eb = eBumpCanvas.getContext('2d')!;

  // Deep ocean bathymetry gradient
  const oceanGrad = ec.createLinearGradient(0, 0, 0, H);
  oceanGrad.addColorStop(0, '#0a2240');
  oceanGrad.addColorStop(0.5, '#072a4f');
  oceanGrad.addColorStop(1, '#091f3b');
  ec.fillStyle = oceanGrad;
  ec.fillRect(0, 0, W, H);

  eb.fillStyle = '#0c0c0c';
  eb.fillRect(0, 0, W, H);

  // Landmask offscreen check
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = W;
  maskCanvas.height = H;
  const mc = maskCanvas.getContext('2d')!;
  mc.fillStyle = '#000000';
  mc.fillRect(0, 0, W, H);
  drawContinentMask(mc, W, H);
  mc.fillStyle = '#ffffff';
  mc.fill();

  const maskData = mc.getImageData(0, 0, W, H).data;
  const colorImg = ec.getImageData(0, 0, W, H);
  const bumpImg = eb.getImageData(0, 0, W, H);

  // MODIS LST Fallback Canvas
  const lstCanvas = document.createElement('canvas');
  lstCanvas.width = W;
  lstCanvas.height = H;
  const lc = lstCanvas.getContext('2d')!;
  const lstImg = lc.createImageData(W, H);

  for (let y = 0; y < H; y++) {
    const lat = 90 - (y / H) * 180;
    const absLat = Math.abs(lat);
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const lon = (x / W) * 360 - 180;
      const isLand = maskData[idx] > 128;

      const n = fbm(x * 0.025, y * 0.025, 4);
      const fine = fbm(x * 0.09, y * 0.09, 3);

      // Earth Blue Marble shading
      if (isLand) {
        let r = 38;
        let g = 86;
        let b = 52;

        // Arid belts (Sahara, Atacama, Arabian, Outback, Utah)
        const isAridBelt =
          (absLat > 16 && absLat < 36) ||
          (lat < -18 && lat > -28 && lon > -73 && lon < -66) ||
          (lat > 33 && lat < 42 && lon > -117 && lon < -105);

        if (absLat > 66 || lat < -64) {
          // Polar ice / permafrost
          r = 212 + n * 35;
          g = 224 + n * 25;
          b = 236 + n * 18;
        } else if (isAridBelt && n > 0.36) {
          // Arid ochre/tan
          r = 162 + n * 48;
          g = 132 + n * 36;
          b = 88 + n * 26;
        } else {
          // Temperate / tropical vegetation + mountain relief
          r = 34 + n * 75 + fine * 20;
          g = 78 + n * 62 + fine * 18;
          b = 44 + n * 38;
        }

        // Mountain ranges highlight
        const elev = Math.min(255, Math.floor(80 + n * 120 + fine * 55));
        colorImg.data[idx] = Math.min(255, r);
        colorImg.data[idx + 1] = Math.min(255, g);
        colorImg.data[idx + 2] = Math.min(255, b);
        colorImg.data[idx + 3] = 255;

        bumpImg.data[idx] = elev;
        bumpImg.data[idx + 1] = elev;
        bumpImg.data[idx + 2] = elev;
        bumpImg.data[idx + 3] = 255;

        // MODIS LST false color (purple/blue poles -> cyan -> green -> yellow -> red equator)
        const heat = Math.max(0, Math.min(1, 1 - absLat / 82 + (n - 0.5) * 0.25));
        lstImg.data[idx] = Math.floor(heat > 0.5 ? 240 : heat * 200);
        lstImg.data[idx + 1] = Math.floor(heat < 0.7 ? heat * 255 : (1 - heat) * 450);
        lstImg.data[idx + 2] = Math.floor(heat < 0.4 ? 220 : 40);
        lstImg.data[idx + 3] = 255;
      } else {
        // Ocean shelf + bathymetry noise
        const shelf = n * 24;
        colorImg.data[idx] = Math.min(255, 8 + shelf * 0.5);
        colorImg.data[idx + 1] = Math.min(255, 38 + shelf * 1.1);
        colorImg.data[idx + 2] = Math.min(255, 78 + shelf * 1.3);
        colorImg.data[idx + 3] = 255;

        bumpImg.data[idx] = 8;
        bumpImg.data[idx + 1] = 8;
        bumpImg.data[idx + 2] = 8;
        bumpImg.data[idx + 3] = 255;

        lstImg.data[idx] = 10;
        lstImg.data[idx + 1] = 22;
        lstImg.data[idx + 2] = 48;
        lstImg.data[idx + 3] = 255;
      }
    }
  }
  ec.putImageData(colorImg, 0, 0);
  eb.putImageData(bumpImg, 0, 0);
  lc.putImageData(lstImg, 0, 0);

  // Earth Cloud Layer
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = W;
  cloudCanvas.height = H;
  const cc = cloudCanvas.getContext('2d')!;
  const cloudImg = cc.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const c = fbm(x * 0.02 + 7.2, y * 0.035 + 3.1, 4);
      const alpha = c > 0.53 ? Math.min(210, (c - 0.53) * 460) : 0;
      cloudImg.data[idx] = 240;
      cloudImg.data[idx + 1] = 247;
      cloudImg.data[idx + 2] = 255;
      cloudImg.data[idx + 3] = alpha;
    }
  }
  cc.putImageData(cloudImg, 0, 0);

  // 2. MOON LROC COLOR + LOLA ELEVATION (with accurate Maria coordinates!)
  const moonColorCanvas = document.createElement('canvas');
  moonColorCanvas.width = W;
  moonColorCanvas.height = H;
  const mc2 = moonColorCanvas.getContext('2d')!;
  const moonBumpCanvas = document.createElement('canvas');
  moonBumpCanvas.width = W;
  moonBumpCanvas.height = H;
  const mb = moonBumpCanvas.getContext('2d')!;

  const moonMaria: Array<[number, number, number, number]> = [
    // [lat, lon, radiusDeg, darkness]
    [0.7, 26, 17, 0.45],   // Mare Tranquillitatis (Apollo 11)
    [28, 17, 14, 0.42],    // Mare Serenitatis
    [33, -16, 22, 0.48],   // Mare Imbrium
    [14, -46, 28, 0.44],   // Oceanus Procellarum (Marius Hills)
    [16, 56, 11, 0.43],    // Mare Crisium
    [-12, 47, 14, 0.36],   // Mare Fecunditatis
    [-21, -15, 13, 0.38],  // Mare Nubium
    [-53, -169, 34, 0.25], // South Pole-Aitken Basin
  ];

  // Generate scattered impact craters
  const craters: Array<{ x: number; y: number; r: number }> = [];
  for (let i = 0; i < 240; i++) {
    craters.push({
      x: hash2(i, 1.3) * W,
      y: hash2(i, 4.7) * H,
      r: 3 + Math.pow(hash2(i, 9.1), 2.5) * 26,
    });
  }

  const mColImg = mc2.createImageData(W, H);
  const mBmpImg = mb.createImageData(W, H);

  for (let y = 0; y < H; y++) {
    const lat = 90 - (y / H) * 180;
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const lon = (x / W) * 360 - 180;
      const n = fbm(x * 0.03, y * 0.03, 4);

      let albedo = 0.62 + n * 0.22;
      let elev = 0.55 + n * 0.3;

      for (const [mLat, mLon, mRad, dark] of moonMaria) {
        const dLat = lat - mLat;
        const dLon = (lon - mLon) * Math.cos((mLat * Math.PI) / 180);
        const d = Math.sqrt(dLat * dLat + dLon * dLon);
        if (d < mRad) {
          const factor = 1 - Math.pow(d / mRad, 2.2);
          albedo -= dark * factor * (0.75 + n * 0.35);
          elev -= 0.22 * factor;
        }
      }

      const shade = Math.max(40, Math.min(235, Math.floor(albedo * 255)));
      const bVal = Math.max(15, Math.min(245, Math.floor(elev * 255)));

      mColImg.data[idx] = shade;
      mColImg.data[idx + 1] = shade + 1;
      mColImg.data[idx + 2] = Math.min(255, shade + 4);
      mColImg.data[idx + 3] = 255;

      mBmpImg.data[idx] = bVal;
      mBmpImg.data[idx + 1] = bVal;
      mBmpImg.data[idx + 2] = bVal;
      mBmpImg.data[idx + 3] = 255;
    }
  }
  mc2.putImageData(mColImg, 0, 0);
  mb.putImageData(mBmpImg, 0, 0);

  // Overlay crisp crater rims onto Moon color & bump
  for (const c of craters) {
    const grad = mb.createRadialGradient(c.x, c.y, c.r * 0.1, c.x, c.y, c.r);
    grad.addColorStop(0, 'rgba(20, 20, 20, 0.55)');
    grad.addColorStop(0.75, 'rgba(35, 35, 35, 0.35)');
    grad.addColorStop(0.92, 'rgba(235, 235, 235, 0.5)');
    grad.addColorStop(1, 'rgba(128, 128, 128, 0)');
    mb.fillStyle = grad;
    mb.beginPath();
    mb.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    mb.fill();

    const cGrad = mc2.createRadialGradient(c.x, c.y, c.r * 0.1, c.x, c.y, c.r);
    cGrad.addColorStop(0, 'rgba(40, 42, 46, 0.28)');
    cGrad.addColorStop(0.88, 'rgba(220, 224, 230, 0.25)');
    cGrad.addColorStop(1, 'rgba(128, 128, 128, 0)');
    mc2.fillStyle = cGrad;
    mc2.beginPath();
    mc2.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    mc2.fill();
  }

  // 3. MARS VIKING/MGS COLOR + MOLA ELEVATION
  const marsColorCanvas = document.createElement('canvas');
  marsColorCanvas.width = W;
  marsColorCanvas.height = H;
  const rcc = marsColorCanvas.getContext('2d')!;
  const marsBumpCanvas = document.createElement('canvas');
  marsBumpCanvas.width = W;
  marsBumpCanvas.height = H;
  const rbc = marsBumpCanvas.getContext('2d')!;

  const rColImg = rcc.createImageData(W, H);
  const rBmpImg = rbc.createImageData(W, H);

  for (let y = 0; y < H; y++) {
    const lat = 90 - (y / H) * 180;
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const lon = (x / W) * 360 - 180;
      const n = fbm(x * 0.025 + 11.4, y * 0.025 + 5.7, 4);
      const fine = fbm(x * 0.08, y * 0.08, 3);

      // Base Martian dichotomy: lower northern plains, higher cratered southern highlands
      let elev = lat > 15 ? 0.34 + n * 0.18 : 0.62 + n * 0.24;
      let darkBasalt = 0;

      // Hellas Planitia (-42.4, 70.5)
      const dHellas = Math.hypot(lat + 42.4, (lon - 70.5) * 0.74);
      if (dHellas < 24) {
        const f = 1 - Math.pow(dHellas / 24, 2);
        elev -= 0.42 * f;
      }

      // Syrtis Major dark basaltic shield (10, 68)
      const dSyrtis = Math.hypot(lat - 10, lon - 68);
      if (dSyrtis < 18) {
        darkBasalt += (1 - dSyrtis / 18) * 0.55;
      }

      // Tharsis Rise & Olympus Mons (-2..20, -133..-95)
      const dTharsis = Math.hypot(lat - 2, lon + 112);
      if (dTharsis < 28) {
        elev += (1 - dTharsis / 28) * 0.36;
      }

      // Valles Marineris canyon (-14, -90..-40)
      if (lat > -18 && lat < -9 && lon > -92 && lon < -42) {
        const canyonFactor = 1 - Math.abs(lat + 13.5) / 4.5;
        elev -= 0.35 * canyonFactor;
        darkBasalt += 0.3 * canyonFactor;
      }

      // Polar CO2/water ice caps
      const isPolarCap = Math.abs(lat) > 81 - n * 4;

      if (isPolarCap) {
        rColImg.data[idx] = 236;
        rColImg.data[idx + 1] = 226;
        rColImg.data[idx + 2] = 218;
        rColImg.data[idx + 3] = 255;
      } else {
        const shade = 1 - darkBasalt * 0.5 + (fine - 0.5) * 0.16;
        rColImg.data[idx] = Math.min(255, Math.max(45, Math.floor((182 + n * 48) * shade)));
        rColImg.data[idx + 1] = Math.min(255, Math.max(32, Math.floor((92 + n * 34) * shade)));
        rColImg.data[idx + 2] = Math.min(255, Math.max(24, Math.floor((54 + n * 24) * shade)));
        rColImg.data[idx + 3] = 255;
      }

      const bVal = Math.max(10, Math.min(248, Math.floor(elev * 255)));
      rBmpImg.data[idx] = bVal;
      rBmpImg.data[idx + 1] = bVal;
      rBmpImg.data[idx + 2] = bVal;
      rBmpImg.data[idx + 3] = 255;
    }
  }
  rcc.putImageData(rColImg, 0, 0);
  rbc.putImageData(rBmpImg, 0, 0);

  // Helper to configure Three.js CanvasTextures properly
  const makeTex = (canvas: HTMLCanvasElement, isColor: boolean): THREE.CanvasTexture => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = maxAnisotropy;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  };

  cachedSet = {
    earthColor: makeTex(eColorCanvas, true),
    earthBump: makeTex(eBumpCanvas, false),
    earthClouds: makeTex(cloudCanvas, true),
    earthModisLstFallback: makeTex(lstCanvas, true),
    moonColor: makeTex(moonColorCanvas, true),
    moonBump: makeTex(moonBumpCanvas, false),
    marsColor: makeTex(marsColorCanvas, true),
    marsBump: makeTex(marsBumpCanvas, false),
  };

  return cachedSet;
}
