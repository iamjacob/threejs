// BOOOKS · Book Aura V4 — vertex shader (pass-through)
// Plain pass-through. Works as-is in a three.js ShaderMaterial / R3F <shaderMaterial>
// (three injects projectionMatrix, modelViewMatrix, position and uv).
// Geometry: a PlaneGeometry of size uPlaneSize, centred on the cover, placed just behind it.
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
