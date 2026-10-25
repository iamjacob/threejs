precision highp float;
varying vec3 vColor; varying float vLit; varying float vShape; varying float vPhase; varying float vAlpha;
uniform float uTime; uniform float uMotion; uniform float uFade;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  vec3 col;
  float back = (1.0 - smoothstep(0.38, 0.62, r)) * 0.62;
  if (vShape < 0.5) {
    float glow = 0.88 + 0.12 * sin(uTime * 1.1 * uMotion + vPhase);
    float core = smoothstep(0.40, 0.30, r);
    float halo = exp(-r * r * 5.0) * (1.0 - smoothstep(0.85, 1.0, r));
    vec3 lit = vColor * (core * 0.9 + halo * 0.5 * glow) + vec3(1.0) * core * 0.12 * smoothstep(0.16, 0.0, r);
    float ring = smoothstep(0.07, 0.0, abs(r - 0.32));
    col = mix(vColor * ring * 0.6, lit, vLit);
  } else if (vShape < 1.5) {
    col = vec3(0.92, 0.96, 1.0) * (smoothstep(0.09, 0.0, abs(r - 0.48)) * 0.75 + smoothstep(0.20, 0.10, r) * 0.85);
    back = (1.0 - smoothstep(0.50, 0.66, r)) * 0.55;
  } else {
    float a = smoothstep(1.0, 0.45, r);
    col = vColor * a; back = a;
  }
  float k = uFade * vAlpha;
  vec3 backCol = vec3(0.031, 0.043, 0.094) * back * step(vShape, 1.5);
  gl_FragColor = vec4((col + backCol) * k, back * k);
}
