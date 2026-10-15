import * as Cesium from 'cesium';
import {
  ARENA, COMBAT, arenaToLonLat, orthonormalize, vAdd, vNorm, vRight, vScale, vSub,
} from './shared.js';

let anchor = ARENA.anchor;

/** Point the local arena frame at the room's geodetic centre. */
export function setAnchor(next) {
  anchor = next;
}

const ellipsoid = Cesium.Ellipsoid.WGS84;
const scratchCart = new Cesium.Cartesian3();
const scratchWin = new Cesium.Cartesian2();
const scratchEnu = new Cesium.Matrix4();
const scratchDelta = new Cesium.Cartesian3();

const worldToWindow = Cesium.SceneTransforms.worldToWindowCoordinates
  ?? Cesium.SceneTransforms.wgs84ToWindowCoordinates;

/** Arena metres [x, y, z] → ECEF. */
export function toCartesian(p, out = new Cesium.Cartesian3()) {
  const { lat, lon } = arenaToLonLat(p[0], p[1], anchor);
  return Cesium.Cartesian3.fromDegrees(lon, lat, p[2], ellipsoid, out);
}

/** Rotate an arena-frame vector into ECEF using an ENU matrix. */
function enuVector(enu, v, out = new Cesium.Cartesian3()) {
  out.x = enu[0] * v[0] + enu[4] * v[1] + enu[8] * v[2];
  out.y = enu[1] * v[0] + enu[5] * v[1] + enu[9] * v[2];
  out.z = enu[2] * v[0] + enu[6] * v[1] + enu[10] * v[2];
  return out;
}

function setColumn(m, i, enu, v) {
  m[i * 4] = enu[0] * v[0] + enu[4] * v[1] + enu[8] * v[2];
  m[i * 4 + 1] = enu[1] * v[0] + enu[5] * v[1] + enu[9] * v[2];
  m[i * 4 + 2] = enu[2] * v[0] + enu[6] * v[1] + enu[10] * v[2];
  m[i * 4 + 3] = 0;
}

function hueTint(id) {
  return Cesium.Color.fromHsl(((id * 0.381966) % 1), 0.85, 0.55);
}

export async function createWorld(container, creditContainer) {
  const viewer = new Cesium.Viewer(container, {
    animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
    homeButton: false, sceneModePicker: false, navigationHelpButton: false,
    fullscreenButton: false, vrButton: false, selectionIndicator: false, infoBox: false,
    baseLayer: false, creditContainer,
  });
  const { scene, camera } = viewer;

  viewer.imageryLayers.addImageryProvider(new Cesium.OpenStreetMapImageryProvider({
    url: 'https://tile.openstreetmap.org/',
    credit: '© OpenStreetMap contributors',
  }));
  scene.globe.baseColor = Cesium.Color.fromCssColorString('#10243a');
  scene.globe.enableLighting = false;
  scene.screenSpaceCameraController.enableInputs = false;
  scene.fog.enabled = true;
  scene.postProcessStages.fxaa.enabled = true;
  viewer.clock.currentTime = Cesium.JulianDate.fromIso8601('2026-06-21T20:00:00Z');
  viewer.clock.shouldAnimate = false;

  const tracerPoints = scene.primitives.add(new Cesium.PointPrimitiveCollection());
  const fxPoints = scene.primitives.add(new Cesium.PointPrimitiveCollection());

  const bullets = [];
  const fx = [];
  const tracerStyles = [
    { size: 5, color: Cesium.Color.fromCssColorString('#fff7c2'), back: 0 },
    { size: 4, color: Cesium.Color.fromCssColorString('#ffd34d').withAlpha(0.8), back: 14 },
    { size: 3, color: Cesium.Color.fromCssColorString('#ff9a1f').withAlpha(0.5), back: 28 },
  ];

  const chase = { f: [0, 1, 0], u: [0, 0, 1], ready: false };

  function applyCamera(pos, dir, up) {
    const cart = toCartesian(pos, scratchCart);
    Cesium.Transforms.eastNorthUpToFixedFrame(cart, ellipsoid, scratchEnu);
    camera.setView({
      destination: Cesium.Cartesian3.clone(cart),
      orientation: { direction: enuVector(scratchEnu, dir), up: enuVector(scratchEnu, up) },
    });
  }

  return {
    viewer,

    /** Slow orbit above the arena, shown behind the menu. */
    menuCamera(seconds) {
      camera.lookAt(
        toCartesian([0, 0, 0]),
        new Cesium.HeadingPitchRange(seconds * 0.04, -0.38, 7500),
      );
    },

    enterGameCamera() {
      camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      chase.ready = false;
    },

    /**
     * Place the camera for a flight state.
     * @param {{p:number[], f:number[], u:number[]}} s
     * @param {object} plane
     * @param {'chase'|'cockpit'} mode
     */
    followCamera(s, plane, mode, dt) {
      const size = plane.spanM * plane.scale;
      if (mode === 'cockpit') {
        applyCamera(vAdd(s.p, vScale(s.u, 1 + size * 0.08)), s.f, s.u);
        chase.f = s.f; chase.u = s.u;
        return;
      }
      if (!chase.ready) { chase.f = s.f; chase.u = s.u; chase.ready = true; }
      const k = 1 - Math.exp(-dt * 7);
      const mix = (a, b) => vAdd(vScale(a, 1 - k), vScale(b, k));
      const n = orthonormalize(mix(chase.f, s.f), mix(chase.u, s.u));
      chase.f = n.f; chase.u = n.u;
      const dist = 25 + size * 1.1;
      const lift = 6 + size * 0.25;
      applyCamera(vAdd(vSub(s.p, vScale(chase.f, dist)), vScale(chase.u, lift)), chase.f, chase.u);
    },

    /** Screen position of an arena point, or null when behind the camera. */
    project(p) {
      toCartesian(p, scratchCart);
      const toPoint = Cesium.Cartesian3.subtract(scratchCart, camera.positionWC, scratchDelta);
      if (Cesium.Cartesian3.dot(toPoint, camera.directionWC) <= 0) return null;
      const w = worldToWindow(scene, scratchCart, scratchWin);
      return w ? { x: w.x, y: w.y } : null;
    },

    cameraPosition() {
      return ellipsoid.cartesianToCartographic(camera.positionWC);
    },

    addTracer(origin, velocity, now) {
      bullets.push({ p: [...origin], v: velocity, born: now });
    },

    updateEffects(dt, now) {
      let used = 0;
      for (let i = bullets.length - 1; i >= 0; i -= 1) {
        const b = bullets[i];
        b.p = vAdd(b.p, vScale(b.v, dt));
        if (now - b.born > COMBAT.bulletLifeS * 1000 || b.p[2] <= 0) bullets.splice(i, 1);
      }
      for (const b of bullets) {
        const dir = vNorm(b.v);
        for (const style of tracerStyles) {
          let pt = tracerPoints.get(used);
          if (!pt) {
            pt = tracerPoints.add({
              position: Cesium.Cartesian3.ZERO, pixelSize: style.size, color: style.color,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            });
          }
          pt.pixelSize = style.size;
          pt.color = style.color;
          pt.position = toCartesian(vSub(b.p, vScale(dir, style.back)), scratchCart);
          pt.show = true;
          used += 1;
        }
      }
      for (let i = used; i < tracerPoints.length; i += 1) tracerPoints.get(i).show = false;

      for (let i = fx.length - 1; i >= 0; i -= 1) {
        const e = fx[i];
        e.age += dt;
        if (e.age >= e.life) {
          fxPoints.remove(e.pt);
          fx.splice(i, 1);
          continue;
        }
        e.p = vAdd(e.p, vScale(e.v, dt));
        e.v = vScale(e.v, Math.exp(-dt * 1.4));
        const t = e.age / e.life;
        e.pt.position = toCartesian(e.p, scratchCart);
        e.pt.pixelSize = e.size * (1 + t * 0.8);
        e.pt.color = e.from.withAlpha(Math.max(0, 1 - t) * e.from.alpha);
      }
    },

    explosion(p) {
      const palette = ['#ffefb0', '#ffb347', '#ff6a2b', '#d93a1c', '#555555'];
      for (let i = 0; i < 44; i += 1) {
        const dir = vNorm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.3]);
        const color = Cesium.Color.fromCssColorString(palette[Math.floor(Math.random() * palette.length)]);
        spawnFx(p, vScale(dir, 15 + Math.random() * 110), color, 10 + Math.random() * 18, 0.8 + Math.random() * 1.5);
      }
    },

    spark(p) {
      const color = Cesium.Color.fromCssColorString('#ffe27a');
      for (let i = 0; i < 6; i += 1) {
        const dir = vNorm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
        spawnFx(p, vScale(dir, 30 + Math.random() * 50), color, 4, 0.3);
      }
    },

    createPlaneVisual(plane, { id = 0, tint = false } = {}) {
      return createPlaneVisual(scene, plane, tint ? hueTint(id) : null);
    },
  };

  function spawnFx(p, v, color, size, life) {
    const pt = fxPoints.add({
      position: toCartesian(p), pixelSize: size, color,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new Cesium.NearFarScalar(200, 1.5, 9000, 0.35),
    });
    fx.push({ pt, p: [...p], v, age: 0, life, size, from: color });
  }
}

function createPlaneVisual(scene, plane, tint) {
  let model = null;
  let disposed = false;
  let wantShow = true;
  const pos = new Cesium.Cartesian3();
  const enu = new Cesium.Matrix4();

  Cesium.Model.fromGltfAsync({
    url: plane.model,
    scale: plane.scale,
    minimumPixelSize: 40,
    modelMatrix: Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY),
    show: false,
    ...(tint ? { color: tint, colorBlendMode: Cesium.ColorBlendMode.MIX, colorBlendAmount: 0.4 } : {}),
  }).then((m) => {
    if (disposed) { m.destroy(); return; }
    model = m;
    scene.primitives.add(model);
  }).catch((error) => console.warn('[dogfight] model failed', plane.id, error));

  return {
    /**
     * Pose from arena-frame position and body axes.
     * Measured in Cesium: after its glTF axis correction the bundled models
     * have the nose along −Y, starboard along −X and up along +Z.
     */
    update(p, f, u) {
      if (!model) return;
      toCartesian(p, pos);
      Cesium.Transforms.eastNorthUpToFixedFrame(pos, ellipsoid, enu);
      const r = vRight(f, u);
      const m = model.modelMatrix;
      setColumn(m, 0, enu, [-r[0], -r[1], -r[2]]);
      setColumn(m, 1, enu, [-f[0], -f[1], -f[2]]);
      setColumn(m, 2, enu, u);
      m[12] = pos.x; m[13] = pos.y; m[14] = pos.z; m[15] = 1;
      model.show = wantShow;
    },
    setVisible(show) {
      wantShow = show;
      if (model && !show) model.show = false;
    },
    destroy() {
      disposed = true;
      if (model) {
        scene.primitives.remove(model);
        model = null;
      }
    },
  };
}
