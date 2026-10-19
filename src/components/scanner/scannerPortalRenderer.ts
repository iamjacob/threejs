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
uniform float time, live, portalScale;
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
	t.y = 1. - t.y;
	vec3 feed = texture2D(cam, t).rgb;
	float ripple = sin(r * 28. - time * 1.8 + a * 2.) * .5 + .5;
	vec3 dream = vec3(.095, .018, .018) + col * .06 * ripple;
	float star = pow(max(0., sin(p.x * 143. + p.y * 79.)
		* sin(p.y * 173. - p.x * 93.)), 28.) * .25;
	dream += star * vec3(1., .3, .18);
	vec3 inside = mix(dream, feed, live);
	inside *= 1. - .18 * pow(min(r, 1.), 3.);
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
};

export type PortalFace = "front" | "spine" | "back" | "page" | "shelf";
/** Window per face: covers are tall, the spine is a narrow slot, a shelf is wide. */
export const PORTAL_SHAPES: Record<PortalFace, [number, number]> = {
	front: [0.3, 0.4],
	back: [0.3, 0.4],
	page: [0.3, 0.4],
	spine: [0.085, 0.42],
	shelf: [0.44, 0.26],
};

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
			["res", "vr", "time", "live", "portalScale", "cam", "shape"].map(
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
				gl.uniform1f(uniforms.portalScale, scale);
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
