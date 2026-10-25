// BOOOKS · Book Aura V4 — fragment shader (V3 + uBloom; only the ONE focused book carries an aura)
// Flowing multicolour aurora bands + orbiting sparks + haze around a book cover, additive blend.
// Jacob's look (Aurora / Chakra / Arcane presets) with the four book signals on separate channels:
//
//   uAlignment  0..1   taste alignment -> VIBRANCE + PALETTE HARMONY
//                      low = dim, desaturated, one colour (monochrome); high = full vivid 4-colour aurora
//   uLiked     -1..1   liked / rating  -> SPREAD + PARTICLE COUNT
//                      0 = no rating (medium spread, a few sparks); 1 = loved (wide bands, many sparks);
//                      <0 = disliked (bands pulled tight, greyed, no sparks)
//   uReadState 0|1|2|3 read status     -> FLOW   (3 = unknown / not shared: neutral low drift, no breath, no arc, no ring)
//                      0 unread   = slow drifting breath, gentle waves
//                      1 reading  = bands stream around the cover + bright progress arc (uProgress)
//                      2 finished = waves settle flat: calm, concentric, still closed rings + thin full ring
//   uProgress  0..1    reading progress (clockwise from top-centre)
//   uOwned     0..1    owned           -> ANCHORING
//                      1 = bands hug the cover edge, solid edge rim, light pooled underneath
//                      0 = bands detached (gap), loose, broken and drifting outward like mist
//
//   uBloom     0..1   focus bloom (eased in JS): 0 = no aura at all, 1 = full aura. Colours AND spread grow
//                      from zero: bands start hugging the cover and travel outward, sparks thin in.
//
//   uInvite    0..1   friend's copy is available to borrow and I don't own it -> calm pulsing pool of light
//                      under the book in the friend's colour (uFriendColor), plus a faint halo in that colour
//
// V3 tuning: not-owned bands are quieter than owned; bands round into softer ovals as they spread;
//   a 4-ring style (Chakra) drops one ring when the book is loved + finished.
// Friend embers, the '+N' tag and the "you own it" marker are a separate tiny Points shader (see aura-v3.html).
//
// Style uniforms (Jacob's presets): uColors[4] (vec3, sRGB 0..1), uWaveA, uWaveB (wave counts),
//   uRings (1..4 layers per colour), uShape (0 flow / 1 petal / 2 crystal)
// Layout: uPlaneSize, uCoverSize, uCornerRadius (any unit), uSeed (0..1 per book), uTime (s)
// uMotion: 1 = normal, 0 = prefers-reduced-motion (pass a frozen uTime too; states stay readable statically)
//
// Material: transparent false (stays in the opaque list), depthWrite/depthTest false, AdditiveBlending, renderOrder -1.
// Plane size: cover + 2 * 1.45 * min(coverW, coverH) per axis.

precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform vec2  uPlaneSize;
uniform vec2  uCoverSize;
uniform float uCornerRadius;
uniform float uAlignment;
uniform float uLiked;
uniform float uReadState;
uniform float uProgress;
uniform float uOwned;
uniform float uSeed;
uniform float uMotion;
uniform float uInvite;
uniform float uBloom;
uniform vec3  uFriendColor;
uniform vec3  uColors[4];
uniform float uWaveA;
uniform float uWaveB;
uniform float uRings;
uniform float uShape;
uniform float uInnerGlow;   // 1 = let the haze show inside the card (transparent motifs like the open book)

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
vec3 saturateCol(vec3 c, float s) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return max(mix(vec3(l), c, s), 0.0);
}
// clockwise perimeter parameter 0..1 starting top-centre (h = half size)
float perimeterParam(vec2 p, vec2 h) {
  vec2 n = p / h;
  float P = 4.0 * (h.x + h.y);
  float L;
  if (n.y >= abs(n.x))        { float x = h.x * n.x / max(n.y, 1e-4);  L = x >= 0.0 ? x : P + x; }
  else if (n.x >= abs(n.y))   { float y = h.y * n.y / max(n.x, 1e-4);  L = h.x + (h.y - y); }
  else if (-n.y >= abs(n.x))  { float x = h.x * n.x / max(-n.y, 1e-4); L = h.x + 2.0 * h.y + (h.x - x); }
  else                        { float y = h.y * n.y / max(-n.x, 1e-4); L = 3.0 * h.x + 2.0 * h.y + (y + h.y); }
  return L / P;
}
float circDist(float a, float b) { float d = abs(a - b); return min(d, 1.0 - d); }

void main() {
  float unit = min(uCoverSize.x, uCoverSize.y);
  vec2 q  = (vUv - 0.5) * uPlaneSize / unit;     // cover-width units
  vec2 h  = 0.5 * uCoverSize / unit;
  float cr = uCornerRadius / unit;
  float t = uTime;

  float unread   = 1.0 - step(0.5, uReadState);
  float reading  = step(0.5, uReadState) * (1.0 - step(1.5, uReadState));
  float finished = step(1.5, uReadState) * (1.0 - step(2.5, uReadState));
  float unknown  = step(2.5, uReadState);                 // read status not shared
  float align   = clamp(uAlignment, 0.0, 1.0);
  float rating  = clamp(uLiked, 0.0, 1.0);
  float dislike = clamp(-uLiked, 0.0, 1.0);
  float owned   = clamp(uOwned, 0.0, 1.0);
  float ghost   = 1.0 - owned;

  // ---- ALIGNMENT -> vibrance + harmony
  float vib  = mix(0.30, 1.0, align);
  float satv = mix(0.25, 1.15, align);
  // ---- LIKED -> spread + sparks
  float spread  = mix(0.62, 1.12, rating);
  spread        = mix(spread, 0.30, dislike);
  float density = mix(0.16, 0.75, rating) * (1.0 - dislike) * mix(1.0, 0.5, 1.0 - clamp(uOwned, 0.0, 1.0));
  float bloom = clamp(uBloom, 0.0, 1.0);
  spread  *= mix(0.30, 1.0, bloom);                       // bands grow outward as the aura blooms in
  density *= bloom;
  float greyOut = dislike * 0.65;
  vib *= 1.0 - dislike * 0.35;
  // ---- READ -> flow
  float flowSpeed = (unread * 0.25 + reading * 1.0 + unknown * 0.12) * uMotion;
  float waveAmt   = 1.0 - finished - unknown * 0.5;       // finished = flat, calm rings; unknown = low neutral drift
  float breathe   = sin(t * 1.1 * uMotion + uSeed * 6.2832);
  spread *= 1.0 + unread * 0.06 * breathe;
  float ft    = t * flowSpeed + uSeed * 40.0;
  float swirl = reading * t * 0.55 * uMotion;             // bands stream around the cover

  float d0 = sdRoundBox(q, h, cr);
  float gap = ghost * 0.11;                               // detached when not owned

  vec3 acc = vec3(0.0);
  for (int c = 0; c < 4; c++) {
    float fc = float(c);
    float ph = 0.2 + fc * 1.48;
    // each colour channel wanders a little around the cover (like Jacob's ring centres)
    vec2 off = vec2(cos(ft * 0.32 + ph), sin(ft * 0.36 + ph)) * (0.010 + 0.008 * fc) * waveAmt * spread;
    vec2 pc = q - off;
    float d = sdRoundBox(pc, h, cr);
    float a = atan(pc.x, pc.y) - swirl;
    vec2 dir = vec2(sin(a + swirl), cos(a + swirl));      // seam-free direction for noise

    // palette harmony: extra colours fade in as alignment rises; otherwise they collapse to colour 0
    float thr = 0.08 + 0.235 * fc;
    float colOn = c == 0 ? 1.0 : smoothstep(thr - 0.10, thr + 0.10, align);
    vec3 col = mix(uColors[0], uColors[c], colOn);
    col = saturateCol(col, satv * (1.0 - greyOut));

    // ghost: broken bands, pattern drifting outward
    float n = vnoise(dir * 1.9 + vec2(d * 5.0 - t * 0.35 * uMotion, uSeed * 9.0 + fc * 3.1));
    float broken = mix(1.0, smoothstep(0.30, 0.75, n) * 1.05, ghost);
    float quiet  = mix(1.0, 0.62, ghost);                // not owned / wishlist reads quieter than owned

    for (int l = 0; l < 4; l++) {
      float lf = float(l);
      // 4-ring styles drop a ring when loved + finished (keeps Chakra from stacking 16 rings)
      float ringsEff = uRings - step(3.5, uRings) * finished * step(0.6, rating);
      if (lf >= ringsEff) break;
      float r = (0.035 + lf * (0.42 / ringsEff) + fc * 0.022) * spread + gap;
      float wph = ph + lf * 0.75;
      float wave;
      if (uShape > 0.5 && uShape < 1.5) {                 // petal
        wave = 1.7 * abs(sin(a * uWaveA * 0.5 + wph + ft * 0.55)) - 0.85
             + 0.4 * sin(a * uWaveB - wph * 1.4 - ft * 0.8);
      } else {
        wave = sin(a * uWaveA + wph + ft * 0.55) + 0.48 * sin(a * uWaveB - wph * 1.4 - ft * 0.8);
      }
      float amp = (0.012 + r * 0.075) * (1.0 + ghost * 0.9);
      float disp = wave * amp * waveAmt;
      if (uShape > 1.5) {                                  // crystal facets (style, kept when finished)
        float pt = pow(abs(cos(a * 4.0 + wph * 0.3)), 0.28);
        disp += (pt - 1.0) * 0.10 * (r + 0.12);
      }
      // bands round into softer ovals as they spread: corner radius grows faster than the offset
      float roundR = min(cr + r * (1.0 + 2.5 * r), min(h.x, h.y) + r);
      float x = sdRoundBox(pc, h + r, roundR) - disp;
      float w = (l == 0 ? 0.017 : 0.009) * (1.0 + ghost * 1.3);
      float band = exp(-x * x / (w * w)) + 0.30 * exp(-abs(x) / (w * 4.0));
      float op = (0.29 - fc * 0.018) / (lf * 0.52 + 1.0);
      acc += col * band * op * broken * quiet;
    }
  }
  acc *= vib * 2.1;

  // ---- OWNED: solid edge rim + pooled light underneath
  vec3 c01 = saturateCol(mix(uColors[0], uColors[1], 0.5 * smoothstep(0.2, 0.5, align)), satv * (1.0 - greyOut));
  // READ (reading) shares the edge: the rim only stays bright along the read part
  float per = perimeterParam(q, h);
  float prog = clamp(uProgress, 0.0, 1.0);
  float filled = 1.0 - smoothstep(prog - 0.003, prog + 0.003, per);
  float rim = exp(-abs(d0 - 0.006) / 0.008) * owned * mix(1.0, 0.30 + 0.70 * filled, reading);
  acc += mix(c01, vec3(1.0), 0.30) * rim * (0.25 + 0.55 * vib);
  vec2 gp = (q - vec2(0.0, -h.y)) ;
  float pool = exp(-pow(gp.x / (h.x * 1.25), 4.0) - pow(gp.y / 0.14, 2.0)) * owned;
  acc += c01 * pool * 0.75 * vib;

  // ---- haze (Jacob's blue -> magenta wash), scaled by vibrance and spread
  float hz = exp(-max(d0, 0.0) / (0.32 * spread + 0.04)) * (1.0 - smoothstep(0.5, 1.2, d0));
  vec3 hazeCol = mix(vec3(0.25, 0.44, 1.0), vec3(0.83, 0.19, 0.88), smoothstep(0.0, 0.45 * spread, d0));
  vec3 hazeAcc = saturateCol(hazeCol, satv * (1.0 - greyOut)) * hz * 0.16 * vib * mix(1.0, 0.6, ghost);
  acc += hazeAcc;

  // ---- FRIENDS: available-to-borrow invite (friend's colour, calm ~4.5 s pulse)
  float invitePulse = 0.78 + 0.22 * sin(t * 1.4 * uMotion + uSeed * 6.2832);
  float ipool = exp(-pow(gp.x / (h.x * 1.0), 2.0) - pow((gp.y + 0.04) / 0.15, 2.0));
  float ihalo = exp(-max(d0, 0.0) / 0.10) * (1.0 - smoothstep(0.3, 0.6, d0));
  acc += uFriendColor * (ipool * 1.4 + ihalo * 0.28) * uInvite * invitePulse;

  // ---- READ: progress arc (reading) / closed ring (finished)
  float track = exp(-pow((d0 - 0.016) / 0.013, 2.0));
  float trackGlow = exp(-abs(d0 - 0.016) / 0.05);
  float head = exp(-pow(circDist(per, prog) / 0.014, 2.0));
  vec3 arcCol = mix(vec3(1.0), saturateCol(uColors[0], 1.0), 0.20);
  acc += arcCol * reading * (track * filled * 3.0 + trackGlow * filled * 0.6 + head * trackGlow * 2.5);
  acc += arcCol * finished * track * 0.7;

  // ---- sparks orbiting in rows around the cover
  float rowH = 0.075;
  float dd = d0 - 0.03 + ghost * (-0.03 - fract(t * 0.05 * uMotion + uSeed) * rowH); // ghost rows drift outward
  float row = floor(dd / rowH);
  float N = 30.0;
  float rowDir = mod(row, 2.0) * 2.0 - 1.0;
  float u = per * N + t * flowSpeed * rowDir * (0.9 + 0.2 * hash(vec2(row, 3.0))) * 0.9;
  float cell = mod(floor(u), N);
  vec2 f = vec2(fract(u), fract(dd / rowH));
  float rnd = hash(vec2(cell + uSeed * 97.0, row + 11.0));
  vec2 ppos = vec2(0.2 + 0.6 * hash(vec2(cell, row + 5.3 + uSeed)), 0.2 + 0.6 * hash(vec2(row, cell + 2.7)));
  float perim = 4.0 * (h.x + h.y) + 6.2832 * max(d0, 0.0);
  vec2 dv = (f - ppos) * vec2(perim / N, rowH);
  float big = step(0.8, hash(vec2(cell * 1.7, row)));
  float s = mix(0.009, 0.015, big);
  float twinkle = 0.55 + 0.45 * sin(t * 2.1 * uMotion + rnd * 40.0);
  float sparkRange = (1.0 - smoothstep(0.38 * spread + gap, 0.70 * spread + gap, d0)) * step(0.0, row) * step(0.02, d0);
  float spark = exp(-dot(dv, dv) / (s * s)) * step(rnd, density) * twinkle * sparkRange;
  int ci = int(mod(cell, 4.0));
  vec3 sc = ci == 0 ? uColors[0] : ci == 1 ? uColors[1] : ci == 2 ? uColors[2] : uColors[3];
  float sActive = ci == 0 ? 1.0 : smoothstep(0.08 + 0.235 * float(ci) - 0.1, 0.08 + 0.235 * float(ci) + 0.1, align);
  sc = saturateCol(mix(uColors[0], sc, sActive), satv);
  acc += mix(sc, vec3(1.0), 0.35) * spark * 1.6 * mix(0.6, 1.0, vib);

  // ---- tone + masks
  // inside the card only the haze may show (for transparent motifs), everything else stays outside
  float inside = 1.0 - smoothstep(-0.02, 0.0, d0);
  acc = mix(acc, hazeAcc * 1.6, inside * uInnerGlow);
  acc *= bloom;                                            // colours fade in from zero
  vec3 col = 1.0 - exp(-acc * 1.25);                       // soft clip: hot cores go white, never harsh
  vec2 e = min(vUv, 1.0 - vUv);
  col *= smoothstep(0.0, 0.10, min(e.x, e.y));
  col *= mix(smoothstep(-0.02, 0.0, d0), 1.0, uInnerGlow);
  gl_FragColor = vec4(col, 1.0);
}
