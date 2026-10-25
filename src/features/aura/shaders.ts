import auraFrag from "./shaders/aura.frag.glsl?raw";
import auraVert from "./shaders/aura.vert.glsl?raw";
import emberFrag from "./shaders/ember.frag.glsl?raw";
import emberVert from "./shaders/ember.vert.glsl?raw";

/** Aura vertex shader. PlaneGeometry is scaled to the cover plus its margin. */
export const AURA_VERT = auraVert;

/** Aura fragment shader. Uniforms are documented in the shader header. */
export const AURA_FRAG = auraFrag;

/** Friend-ember / quiet-dot vertex shader. */
export const EMBER_VERT = emberVert;

/** Friend-ember / quiet-dot fragment shader. aShape 0 ember, 1 you-own marker, 2 quiet dot. */
export const EMBER_FRAG = emberFrag;
