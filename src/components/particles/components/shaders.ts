export const particleVertexShader = `
  uniform float uProgress;
  uniform float uTime;
  uniform float uViewportHeight;

  attribute vec3 targetPosition;
  attribute vec3 color;
  attribute float opacity;
  attribute float size;
  attribute vec3 velocity;
  attribute vec3 faceNormal;

  varying vec3 vColor;
  varying float vAlpha;

  float randomFromPosition(vec3 value) {
    return fract(sin(dot(value, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  }

  mat2 rotate2d(float angle) {
    float sine = sin(angle);
    float cosine = cos(angle);
    return mat2(cosine, -sine, sine, cosine);
  }

  void main() {
    vColor = color;
    // Allow the actual six-face image to settle before handing off to the mesh.
    float formation = smoothstep(0.0, 0.82, uProgress);
    float motionFade = 1.0 - smoothstep(0.55, 0.82, uProgress);
    float seed = randomFromPosition(position);
    float direction = seed > 0.5 ? 1.0 : -1.0;
    float orbitAngle = direction * formation * mix(1.2, 2.8, seed) * 6.283185;
    orbitAngle += uTime * mix(0.08, 0.22, seed) * motionFade;

    vec3 orbitingStart = position;
    orbitingStart.xz = rotate2d(orbitAngle) * orbitingStart.xz;
    vec3 pos = mix(orbitingStart, targetPosition, formation);
    vec3 radial = normalize(vec3(position.x, 0.0, position.z) + vec3(0.0001));
    vec3 tangent = vec3(-radial.z, 0.0, radial.x);
    float envelope = sin(formation * 3.141593) * motionFade;
    pos += tangent * mix(0.35, 1.25, seed) * envelope;
    pos.y += sin(uTime * 0.9 + seed * 30.0 + formation * 12.0)
      * envelope * mix(0.15, 0.55, seed);
    pos += velocity * 55.0 * envelope * sin(uTime * 1.2 + seed * 40.0);

    vec4 viewPosition = modelViewMatrix * vec4(pos, 1.0);
    vec3 targetView = (modelViewMatrix * vec4(targetPosition, 1.0)).xyz;
    float facing = dot(normalize(normalMatrix * faceNormal), normalize(-targetView));
    // A back cover must not bleed through the front as the book assembles.
    float visibility = mix(1.0, step(0.0, facing), smoothstep(0.55, 0.82, uProgress));
    float twinkle = mix(1.0, 0.65 + 0.35 * sin(uTime * 2.0 + seed * 50.0), motionFade);
    vAlpha = opacity * mix(0.4, 1.0, formation) * visibility * twinkle
      * (1.0 - smoothstep(0.9, 1.0, uProgress));

    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = size * uViewportHeight * 0.5 * projectionMatrix[1][1]
      / max(0.01, -viewPosition.z);
  }
`;

export const particleFragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float dist = length(gl_PointCoord - 0.5);
    float alpha = (1.0 - smoothstep(0.3, 0.5, dist)) * vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor, alpha);
    #include <colorspace_fragment>
  }
`;
