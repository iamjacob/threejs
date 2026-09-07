export const particleVertexShader = `
  uniform float uProgress;
  uniform float uTime;
  uniform float uSize;

  attribute vec3 targetPosition;
  attribute vec3 color;
  attribute float size;
  attribute vec3 velocity;
  attribute float faceId;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vFaceId;
  varying float vTwinkle;

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
    vFaceId = faceId;

    vec3 pos;

    if (uProgress < 1.0) {
      float phase1Progress = uProgress;
      float formationProgress = smoothstep(0.0, 0.96, phase1Progress);
      float motionFade = 1.0 - smoothstep(0.7, 0.98, phase1Progress);
      float seed = randomFromPosition(position);
      float direction = seed > 0.5 ? 1.0 : -1.0;
      float turns = mix(1.2, 2.8, seed);
      float orbitAngle = direction * formationProgress * turns * 6.283185;
      orbitAngle += uTime * mix(0.08, 0.22, seed) * motionFade;

      vec3 orbitingStart = position;
      orbitingStart.xz = rotate2d(orbitAngle) * orbitingStart.xz;
      pos = mix(orbitingStart, targetPosition, formationProgress);

      vec3 radial = normalize(vec3(position.x, 0.0, position.z) + vec3(0.0001));
      vec3 tangent = vec3(-radial.z, 0.0, radial.x);
      float pathEnvelope = sin(formationProgress * 3.141593) * motionFade;
      float arcStrength = mix(0.35, 1.25, seed) * pathEnvelope;
      pos += tangent * arcStrength;
      pos.y += sin(uTime * 0.9 + seed * 30.0 + formationProgress * 12.0)
        * pathEnvelope * mix(0.15, 0.55, seed);
      pos += velocity * 55.0 * pathEnvelope
        * sin(uTime * 1.2 + seed * 40.0);

      float arrivalAlpha = mix(0.3, 1.0, phase1Progress);
      float handoffAlpha = 1.0 - smoothstep(0.82, 1.0, phase1Progress);
      vAlpha = arrivalAlpha * handoffAlpha;
      vTwinkle = 0.65 + 0.35 * sin(uTime * mix(1.5, 3.5, seed) + seed * 50.0);
    } else {
      pos = targetPosition;
      vAlpha = 0.0;
      vTwinkle = 1.0;
    }

    vec4 viewPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    float sizeMultiplier = 1.0;
    if (vFaceId < 1.5) sizeMultiplier = 1.5;
    else if (vFaceId < 2.5) sizeMultiplier = 1.3;
    else if (vFaceId < 3.5) sizeMultiplier = 1.4;
    else sizeMultiplier = 0.9;

    gl_PointSize = size * uSize * sizeMultiplier * mix(0.85, 1.15, vTwinkle) / -viewPosition.z;
  }
`;

export const particleFragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vFaceId;
  varying float vTwinkle;

  void main() {
    float dist = length(gl_PointCoord - 0.5);
    if (dist > 0.5) discard;

    float softParticle = pow(1.0 - dist * 2.0, 1.4);
    float alpha = softParticle * vAlpha * mix(0.7, 1.0, vTwinkle);
    vec3 finalColor = vColor;

    if (vFaceId < 1.5) {
      finalColor *= 1.4;
    } else if (vFaceId < 2.5) {
      finalColor *= 1.2;
    } else if (vFaceId < 3.5) {
      finalColor *= 1.1;
      finalColor = mix(finalColor, finalColor * 0.8, 0.2);
    } else {
      finalColor *= 0.9;
    }

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

export const fadeVertexShader = `
  uniform float uProgress;

  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    vPosition = position;
    vNormal = normal;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fadeFragmentShader = `
  uniform float uProgress;
  uniform vec3 uColor;
  uniform sampler2D uTexture;

  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    if (uProgress > 0.5) discard;

    vec4 textureColor = texture2D(uTexture, vUv);
    float alpha = 1.0 - (uProgress * 2.0);
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    float diff = max(dot(vNormal, lightDir), 0.0);
    vec3 finalColor = textureColor.rgb * uColor * (0.3 + 0.7 * diff);

    gl_FragColor = vec4(finalColor, textureColor.a * alpha);
  }
`;
