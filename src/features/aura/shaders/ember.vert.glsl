attribute vec3 aColor; attribute float aLit; attribute float aShape; attribute float aSize; attribute float aPhase; attribute float aAlpha;
varying vec3 vColor; varying float vLit; varying float vShape; varying float vPhase; varying float vAlpha;
uniform float uPR;
void main() {
  vColor = aColor; vLit = aLit; vShape = aShape; vPhase = aPhase; vAlpha = aAlpha;
  gl_PointSize = aSize * uPR;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
