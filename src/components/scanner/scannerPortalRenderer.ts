// Adapted from https://boooks-portal-scanner.insidyou.chatgpt.site:
// the oval, moving ribbons and camera mapping retain the supplied shader.
// The surrounding pixels stay transparent for the app's UI.
const vertexSource = `
attribute vec2 p;
varying vec2 uv;
void main() {
	uv = p * .5 + .5;
	gl_Position = vec4(p, 0., 1.);
}`;

const fragmentSource = `
precision mediump float;
varying vec2 uv;
uniform vec2 res;
uniform vec2 vr;
uniform float time, live, portalScale, guide;
uniform vec2 shape;
uniform sampler2D cam;
// Signed distance to a rounded rectangle with half-extents b and radius r.
float roundBox(vec2 p, vec2 b, float r) {
	vec2 d = abs(p) - b + r;
	return length(max(d, 0.)) + min(max(d.x, d.y), 0.) - r;
}
void main() {
	if (portalScale < .001) { gl_FragColor = vec4(0.); return; }
	vec2 p = (uv - .5) * vec2(res.x / res.y, 1.);
	p.y += .015;
	p /= portalScale * min(1., res.x / res.y / .8);
	float a = atan(p.y, p.x);
	// Rounded rectangle sized per face (front / spine / back), not a circle.
	float dist = roundBox(p, shape, .045);
	vec2 q = p / shape;
	float r = max(abs(q.x), abs(q.y));
	float wave = .023 * sin(a * 5. + time * .8)
		+ .014 * sin(a * 9. - time * 1.1)
		+ .012 * sin(a * 3. + time * .4);
	float edge = dist / min(shape.x, shape.y) - wave * .6;
	float core = 1. - smoothstep(-.018, .008, edge);
	float glow = exp(-abs(edge) * 19.);
	float strand = exp(-abs(edge + .012 * sin(a * 14. + time * 2.)) * 105.);
	float ribbon = exp(-abs(edge - .046 - .017 * sin(a * 7. - time)) * 65.);
	// Left-to-right #7C1414 → #E22424 from public/icons/logo.svg.
	vec3 col = mix(vec3(124., 20., 20.) / 255., vec3(226., 36., 36.) / 255.,
		clamp(q.x * .5 + .5, 0., 1.));
	vec2 t = q * .5 + .5;
	// Fill the window with the camera feed, cropping rather than stretching.
	float portalAspect = shape.x / shape.y;
	float va = vr.x / max(vr.y, 1.);
	if (va > portalAspect) t.x = (t.x - .5) * portalAspect / va + .5;
	else t.y = (t.y - .5) * va / portalAspect + .5;
	// Guide mode (0.4): map the feed as if it covered the whole canvas
	// (object-fit: cover), so the window shows the camera at full-screen size,
	// exactly the pixels capture keeps, and nothing is drawn outside it.
	vec2 s = uv;
	float ca = res.x / max(res.y, 1.);
	if (va > ca) s.x = (s.x - .5) * ca / va + .5;
	else s.y = (s.y - .5) * va / ca + .5;
	t = mix(t, s, guide);
	t.y = 1. - t.y;
	vec3 feed = texture2D(cam, t).rgb;
	float ripple = sin(r * 28. - time * 1.8 + a * 2.) * .5 + .5;
	vec3 dream = vec3(.095, .018, .018) + col * .06 * ripple;
	float star = pow(max(0., sin(p.x * 143. + p.y * 79.)
		* sin(p.y * 173. - p.x * 93.)), 28.) * .25;
	dream += star * vec3(1., .3, .18);
	vec3 inside = mix(dream, feed, live);
	// Guide mode keeps the true image: no vignette inside the window.
	inside *= 1. - .18 * (1. - guide) * pow(min(r, 1.), 3.);
	float alpha = clamp(core + glow * .42 + strand + ribbon * .4, 0., 1.);
	vec3 color = inside * core + col * (glow * .23 + strand * .85 + ribbon * .25);
	gl_FragColor = vec4(color / max(alpha, .001), alpha);
}`;

export const PORTAL_OPENING_MS = 650;
const MAX_CANVAS_DIMENSION = 960;
const MAX_VIDEO_DIMENSION = 1024;

export function portalOpeningScale(elapsedMs: number, reducedMotion = false) {
	if (reducedMotion) return 1;
	const progress = Math.max(0, Math.min(1, elapsedMs / PORTAL_OPENING_MS));
	return progress * progress * (3 - 2 * progress);
}

function boundedSize(
	width: number,
	height: number,
	multiplier: number,
	maximum: number,
) {
	const safeWidth = Math.max(1, Number.isFinite(width) ? width : 1);
	const safeHeight = Math.max(1, Number.isFinite(height) ? height : 1);
	const factor = Math.min(
		multiplier,
		maximum / Math.max(safeWidth, safeHeight),
	);
	return {
		width: Math.max(1, Math.round(safeWidth * factor)),
		height: Math.max(1, Math.round(safeHeight * factor)),
	};
}

export function portalCanvasSize(
	width: number,
	height: number,
	pixelRatio = 1,
) {
	const ratio = Number.isFinite(pixelRatio)
		? Math.max(1, Math.min(1.25, pixelRatio))
		: 1;
	return boundedSize(width, height, ratio, MAX_CANVAS_DIMENSION);
}

export function portalVideoTextureSize(width: number, height: number) {
	return boundedSize(width, height, 1, MAX_VIDEO_DIMENSION);
}

export type PortalFrame = {
	time: number;
	scale: number;
	live: boolean;
	video?: HTMLVideoElement | null;
	pixelRatio?: number;
	/** Half-extents of the window in portal units (x, y). */
	shape?: [number, number];
	/**
	 * Full-screen mapping: the window shows the camera at the scale it would
	 * have covering the whole canvas; nothing is drawn outside the window.
	 */
	guide?: boolean;
	/** Multiplies the window size (1 = the classic portal). */
	size?: number;
};

/** 0.4 guide: the portal window is 22% smaller than the classic one. */
export const GUIDE_PORTAL_SIZE = 0.78;
/** Shader nudges the window down by this much of the height (`p.y += .015`). */
const PORTAL_CENTRE_OFFSET = 0.015;

export type ViewRect = { x: number; y: number; width: number; height: number };

/**
 * Where the portal window sits on a canvas of `width` × `height` CSS px.
 * Mirrors the fragment shader: half-extents `shape * S` in units of the
 * height, with S = size · min(1, aspect / 0.8), centred slightly low.
 */
export function portalWindowRect(
	width: number,
	height: number,
	shape: [number, number] = PORTAL_SHAPES.front,
	size = 1,
): ViewRect {
	const w = Math.max(1, Number.isFinite(width) ? width : 1);
	const h = Math.max(1, Number.isFinite(height) ? height : 1);
	const s = size * Math.min(1, w / h / 0.8);
	const halfW = shape[0] * s * h;
	const halfH = shape[1] * s * h;
	const cx = w / 2;
	const cy = h * (0.5 + PORTAL_CENTRE_OFFSET);
	return { x: cx - halfW, y: cy - halfH, width: halfW * 2, height: halfH * 2 };
}

/** Without WebGL the CSS draws the guide as a box: fractions of the view. */
export const FALLBACK_GUIDE: Record<"cover" | "spine", [number, number]> = {
	cover: [0.6, 0.8],
	spine: [0.17, 0.84],
};
export function fallbackGuideRect(
	width: number,
	height: number,
	face: PortalFace,
	size = 1,
): ViewRect {
	const [fw, fh] = FALLBACK_GUIDE[face === "spine" ? "spine" : "cover"];
	const gw = width * fw * size;
	const gh = height * fh * size;
	return { x: (width - gw) / 2, y: (height - gh) / 2, width: gw, height: gh };
}

/**
 * Map a rect on a full-screen preview (`object-fit: cover`) back to video
 * pixels, grown by `pad` on every side and clamped to the frame. Only what is
 * inside the guide is kept, however large the preview is.
 */
export function coverRectToVideo(
	rect: ViewRect,
	viewWidth: number,
	viewHeight: number,
	videoWidth: number,
	videoHeight: number,
	pad = 0,
): ViewRect {
	const vw = Math.max(1, Number.isFinite(videoWidth) ? videoWidth : 1);
	const vh = Math.max(1, Number.isFinite(videoHeight) ? videoHeight : 1);
	const sw = Math.max(1, Number.isFinite(viewWidth) ? viewWidth : 1);
	const sh = Math.max(1, Number.isFinite(viewHeight) ? viewHeight : 1);
	// Cover: the video is scaled up until it fills the view, then centred.
	const scale = Math.max(sw / vw, sh / vh);
	const offsetX = (sw - vw * scale) / 2;
	const offsetY = (sh - vh * scale) / 2;
	const grow = Math.max(0, pad);
	const px = rect.width * grow;
	const py = rect.height * grow;
	const left = (rect.x - px - offsetX) / scale;
	const top = (rect.y - py - offsetY) / scale;
	const right = (rect.x + rect.width + px - offsetX) / scale;
	const bottom = (rect.y + rect.height + py - offsetY) / scale;
	const x = Math.max(0, Math.min(vw - 1, Math.round(left)));
	const y = Math.max(0, Math.min(vh - 1, Math.round(top)));
	return {
		x,
		y,
		width: Math.max(1, Math.min(Math.round(vw), Math.round(right)) - x),
		height: Math.max(1, Math.min(Math.round(vh), Math.round(bottom)) - y),
	};
}

export type PortalFace = "front" | "spine" | "back" | "page" | "shelf";
/** Window per face: covers are tall, the spine is a narrow slot, a shelf is wide. */
export const PORTAL_SHAPES: Record<PortalFace, [number, number]> = {
	front: [0.3, 0.4],
	back: [0.3, 0.4],
	page: [0.3, 0.4],
	spine: [0.085, 0.42],
	shelf: [0.44, 0.26],
};

/** Extra room kept around the window so the book's edges aren't on the cut. */
export const PORTAL_CROP_PAD = 0.04;

/**
 * The part of the camera frame the portal window shows, in video pixels.
 * Mirrors the fragment shader: the feed is centred and "covers" the window, so
 * the visible region is centred and has the window's aspect ratio. `pad` grows
 * it by that fraction on every side (clamped to the frame).
 */
export function portalCropRect(
	videoWidth: number,
	videoHeight: number,
	shape: [number, number] = PORTAL_SHAPES.front,
	pad = 0,
) {
	const width = Math.max(1, Number.isFinite(videoWidth) ? videoWidth : 1);
	const height = Math.max(1, Number.isFinite(videoHeight) ? videoHeight : 1);
	const portalAspect = shape[0] / shape[1];
	const videoAspect = width / height;
	const grow = 1 + 2 * Math.max(0, pad);
	const w = Math.min(
		width,
		width * Math.min(1, portalAspect / videoAspect) * grow,
	);
	const h = Math.min(
		height,
		height * Math.min(1, videoAspect / portalAspect) * grow,
	);
	const x = Math.max(0, Math.round((width - w) / 2));
	const y = Math.max(0, Math.round((height - h) / 2));
	return {
		x,
		y,
		width: Math.max(1, Math.min(Math.round(w), Math.round(width) - x)),
		height: Math.max(1, Math.min(Math.round(h), Math.round(height) - y)),
	};
}

export function createScannerPortalRenderer(canvas: HTMLCanvasElement) {
	const gl = canvas.getContext("webgl", {
		alpha: true,
		antialias: false,
		depth: false,
		stencil: false,
		premultipliedAlpha: false,
		powerPreference: "low-power",
	});
	if (!gl) return null;
	const shaders: WebGLShader[] = [];
	let program: WebGLProgram | null = null;
	let buffer: WebGLBuffer | null = null;
	let texture: WebGLTexture | null = null;
	let sampleCanvas: HTMLCanvasElement | null = null;
	let sampleContext: CanvasRenderingContext2D | null = null;
	let lastVideoTime = -1;
	let hasFrame = false;
	let disposed = false;
	let released = false;
	const dispose = (releaseContext = false) => {
		if (!disposed) {
			disposed = true;
			if (texture) gl.deleteTexture(texture);
			if (buffer) gl.deleteBuffer(buffer);
			if (program) gl.deleteProgram(program);
			for (const shader of shaders) gl.deleteShader(shader);
			if (sampleCanvas) sampleCanvas.width = sampleCanvas.height = 1;
			sampleCanvas = null;
			sampleContext = null;
		}
		if (releaseContext && !released) {
			released = true;
			gl.getExtension("WEBGL_lose_context")?.loseContext();
		}
	};
	try {
		const shader = (type: number, source: string) => {
			const value = gl.createShader(type);
			if (!value) throw new Error("Portal shader unavailable");
			shaders.push(value);
			gl.shaderSource(value, source);
			gl.compileShader(value);
			if (!gl.getShaderParameter(value, gl.COMPILE_STATUS))
				throw new Error("Portal shader could not compile");
			return value;
		};
		program = gl.createProgram();
		if (!program) throw new Error("Portal program unavailable");
		gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource));
		gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource));
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS))
			throw new Error("Portal program could not link");
		gl.useProgram(program);
		buffer = gl.createBuffer();
		texture = gl.createTexture();
		if (!buffer || !texture) throw new Error("Portal resources unavailable");
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
			gl.STATIC_DRAW,
		);
		const position = gl.getAttribLocation(program, "p");
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
		const uniforms = Object.fromEntries(
			["res", "vr", "time", "live", "portalScale", "cam", "shape", "guide"].map(
				(name) => [name, gl.getUniformLocation(program!, name)],
			),
		);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			1,
			1,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			new Uint8Array([30, 6, 6, 255]),
		);
		gl.uniform1i(uniforms.cam, 0);
		return {
			dispose,
			draw({
				time,
				scale,
				live,
				video,
				pixelRatio = 1,
				shape = PORTAL_SHAPES.front,
				guide = false,
				size: windowSize = 1,
			}: PortalFrame) {
				if (disposed || gl.isContextLost()) return;
				const size = portalCanvasSize(
					canvas.clientWidth,
					canvas.clientHeight,
					pixelRatio,
				);
				if (canvas.width !== size.width || canvas.height !== size.height) {
					canvas.width = size.width;
					canvas.height = size.height;
					gl.viewport(0, 0, size.width, size.height);
				}
				const ready =
					live &&
					video &&
					video.readyState >= 2 &&
					video.videoWidth > 0 &&
					video.videoHeight > 0;
				if (!live) {
					hasFrame = false;
					lastVideoTime = -1;
				}
				if (ready && (!hasFrame || video.currentTime !== lastVideoTime)) {
					const videoSize = portalVideoTextureSize(
						video.videoWidth,
						video.videoHeight,
					);
					let source: HTMLVideoElement | HTMLCanvasElement = video;
					if (
						videoSize.width !== video.videoWidth ||
						videoSize.height !== video.videoHeight
					) {
						if (!sampleCanvas) {
							sampleCanvas = document.createElement("canvas");
							sampleContext = sampleCanvas.getContext("2d", { alpha: false });
						}
						if (!sampleContext)
							throw new Error("Portal video sampling unavailable");
						if (
							sampleCanvas.width !== videoSize.width ||
							sampleCanvas.height !== videoSize.height
						) {
							sampleCanvas.width = videoSize.width;
							sampleCanvas.height = videoSize.height;
						}
						sampleContext.drawImage(
							video,
							0,
							0,
							videoSize.width,
							videoSize.height,
						);
						source = sampleCanvas;
					}
					gl.texImage2D(
						gl.TEXTURE_2D,
						0,
						gl.RGBA,
						gl.RGBA,
						gl.UNSIGNED_BYTE,
						source,
					);
					lastVideoTime = video.currentTime;
					hasFrame = true;
				}
				gl.uniform2f(uniforms.res, size.width, size.height);
				gl.uniform2f(
					uniforms.vr,
					video?.videoWidth || 1,
					video?.videoHeight || 1,
				);
				gl.uniform1f(uniforms.time, time);
				gl.uniform1f(uniforms.portalScale, scale * windowSize);
				gl.uniform1f(uniforms.guide, guide ? 1 : 0);
				gl.uniform2f(uniforms.shape, shape[0], shape[1]);
				gl.uniform1f(uniforms.live, live && hasFrame ? 1 : 0);
				gl.drawArrays(gl.TRIANGLES, 0, 6);
			},
		};
	} catch (error) {
		dispose(true);
		throw error;
	}
}
