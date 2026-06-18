/**
 * Procedural day/night Earth material for Globe3D.
 *
 * No textures, no network — entirely shader-driven. The polygon layer above
 * draws country landmasses; this material renders the ocean / atmosphere
 * substrate with a cinematic terminator, polar tint, fresnel rim glow and
 * a subtle night-side city-glow shimmer.
 *
 * Tuned to the ORBITA dark-space aesthetic. ~2 KB GPU cost, runs at 60 fps
 * on integrated GPUs.
 */
import * as THREE from "three";

export interface EarthMaterialOptions {
  /** Sun direction in world space (unit vector). Default: low west-side light. */
  sunDirection?: THREE.Vector3;
  /** 0 = static, 1 = slow rotation of the sun per second (rad). */
  sunRotationSpeed?: number;
}

export interface EarthMaterialHandle {
  material: THREE.ShaderMaterial;
  /** Advance time uniform from a render loop. */
  tick(deltaSeconds: number): void;
  dispose(): void;
}

const vert = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// Hash & value noise for subtle night-side shimmer.
const frag = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform vec3 uOceanDay;
  uniform vec3 uOceanNight;
  uniform vec3 uPolar;
  uniform vec3 uAtmosphere;
  uniform vec3 uCityGlow;

  float hash(vec3 p){
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x){
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f*f*(3.0-2.0*f);
    return mix(
      mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
          mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
          mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  void main() {
    vec3 N = normalize(vNormal);
    // Sphere-space normal (pre-camera) for stable lat shading via world pos.
    vec3 Nw = normalize(vWorldPos);

    float lat = Nw.y; // -1..1
    float polar = smoothstep(0.55, 0.95, abs(lat));

    // Sun lighting term (-1..1) → smooth day/night transition.
    float lambert = dot(Nw, normalize(uSunDir));
    float day = smoothstep(-0.15, 0.35, lambert);

    // Ocean band: warmer at equator on day side, cooler at poles.
    vec3 oceanDay = mix(uOceanDay, uPolar, polar * 0.6);
    vec3 oceanNight = mix(uOceanNight, vec3(0.01, 0.015, 0.04), polar * 0.5);
    vec3 base = mix(oceanNight, oceanDay, day);

    // Subtle equatorial highlight on day side (sun glint suggestion).
    float glint = pow(max(0.0, lambert), 6.0) * (1.0 - abs(lat));
    base += vec3(0.18, 0.22, 0.28) * glint * 0.35;

    // Terminator warm rim — orange/pink narrow band where day meets night.
    float term = exp(-pow((lambert + 0.05) * 7.0, 2.0));
    base += vec3(0.95, 0.42, 0.32) * term * 0.18;

    // Night-side city-glow shimmer (very subtle, animated).
    float nightMask = 1.0 - day;
    float shimmer = noise(Nw * 18.0 + vec3(0.0, 0.0, uTime * 0.05));
    shimmer = smoothstep(0.72, 0.95, shimmer);
    base += uCityGlow * shimmer * nightMask * 0.35;

    // Fresnel atmospheric rim — visible at oblique view angles.
    vec3 V = normalize(cameraPosition - vWorldPos);
    float fres = pow(1.0 - max(0.0, dot(N, V)), 2.2);
    base += uAtmosphere * fres * 0.55;

    gl_FragColor = vec4(base, 1.0);
  }
`;

export function createEarthMaterial(opts: EarthMaterialOptions = {}): EarthMaterialHandle {
  const sun = (opts.sunDirection ?? new THREE.Vector3(-0.6, 0.25, 0.75)).clone().normalize();
  const speed = opts.sunRotationSpeed ?? 0.015;

  const material = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uSunDir: { value: sun },
      uTime: { value: 0 },
      uOceanDay: { value: new THREE.Color(0x0b1c3a) },
      uOceanNight: { value: new THREE.Color(0x05060c) },
      uPolar: { value: new THREE.Color(0x1a2b4d) },
      uAtmosphere: { value: new THREE.Color(0x6c63ff) },
      uCityGlow: { value: new THREE.Color(0xffb84d) },
    },
    transparent: false,
    depthWrite: true,
  });

  // Precomputed rotation axis (Y).
  const tmp = new THREE.Vector3();
  function tick(deltaSeconds: number) {
    material.uniforms.uTime.value += deltaSeconds;
    if (speed !== 0) {
      const sd = material.uniforms.uSunDir.value as THREE.Vector3;
      tmp.copy(sd);
      const angle = speed * deltaSeconds;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      sd.x = tmp.x * cosA + tmp.z * sinA;
      sd.z = -tmp.x * sinA + tmp.z * cosA;
      sd.normalize();
    }
  }

  function dispose() {
    material.dispose();
  }

  return { material, tick, dispose };
}
