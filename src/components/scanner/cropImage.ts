import {
	isValidQuadrilateral,
	outputDimensions,
	type Point,
	squareToQuad,
} from "./perspective";

export async function decodePhoto(file: Blob): Promise<HTMLCanvasElement> {
	const url = URL.createObjectURL(file);
	try {
		const image = new Image();
		image.src = url;
		await image.decode();
		return imageCanvas(image, image.naturalWidth, image.naturalHeight);
	} finally {
		URL.revokeObjectURL(url);
	}
}

export function imageCanvas(
	source: CanvasImageSource,
	width: number,
	height: number,
) {
	const canvas = document.createElement("canvas");
	const scale = Math.min(1, 2560 / Math.max(width, height));
	canvas.width = Math.max(1, Math.round(width * scale));
	canvas.height = Math.max(1, Math.round(height * scale));
	const context = canvas.getContext("2d", { alpha: false });
	if (!context)
		throw new Error("Image processing is unavailable in this browser.");
	context.drawImage(source, 0, 0, canvas.width, canvas.height);
	return canvas;
}

export function rotatePhoto(source: HTMLCanvasElement, clockwise: boolean) {
	const canvas = document.createElement("canvas");
	canvas.width = source.height;
	canvas.height = source.width;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Image processing is unavailable.");
	context.translate(
		clockwise ? canvas.width : 0,
		clockwise ? 0 : canvas.height,
	);
	context.rotate(clockwise ? Math.PI / 2 : -Math.PI / 2);
	context.drawImage(source, 0, 0);
	return canvas;
}

// The same GPU homography as the supplied cropper, with bounded textures and cleanup.
export function cropPerspective(source: HTMLCanvasElement, points: Point[]) {
	if (!isValidQuadrilateral(points))
		throw new Error("Place the corners in order without crossing the edges.");
	const canvas = document.createElement("canvas");
	const gl = canvas.getContext("webgl", {
		alpha: false,
		antialias: false,
		preserveDrawingBuffer: true,
	});
	if (!gl)
		throw new Error(
			"Perspective cropping needs WebGL. Please try another browser.",
		);
	try {
		const limit = Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE));
		const dimensions = outputDimensions(points);
		const scale = Math.min(
			1,
			limit / Math.max(dimensions.width, dimensions.height),
		);
		canvas.width = Math.max(1, Math.round(dimensions.width * scale));
		canvas.height = Math.max(1, Math.round(dimensions.height * scale));
		const inputScale = Math.min(
			1,
			limit / Math.max(source.width, source.height),
		);
		const textureSource = document.createElement("canvas");
		textureSource.width = Math.max(1, Math.round(source.width * inputScale));
		textureSource.height = Math.max(1, Math.round(source.height * inputScale));
		const textureContext = textureSource.getContext("2d");
		if (!textureContext) throw new Error("Image processing is unavailable.");
		textureContext.drawImage(
			source,
			0,
			0,
			textureSource.width,
			textureSource.height,
		);
		const matrix = squareToQuad(
			points.map((p) => ({
				x: (p.x * textureSource.width) / source.width,
				y: (p.y * textureSource.height) / source.height,
			})),
		);
		const shader = (type: number, code: string) => {
			const value = gl.createShader(type);
			if (!value) throw new Error("Could not prepare the crop.");
			gl.shaderSource(value, code);
			gl.compileShader(value);
			if (!gl.getShaderParameter(value, gl.COMPILE_STATUS))
				throw new Error("Could not prepare the crop.");
			return value;
		};
		const vertex = shader(
			gl.VERTEX_SHADER,
			`
			attribute vec2 a_position; attribute vec2 a_destination; varying vec2 v_destination;
			void main() { gl_Position = vec4(a_position, 0.0, 1.0); v_destination = a_destination; }
		`,
		);
		const fragment = shader(
			gl.FRAGMENT_SHADER,
			`
			precision highp float; uniform sampler2D u_image;
			uniform vec3 u_h0; uniform vec3 u_h1; uniform vec3 u_h2; uniform vec2 u_sourceSize;
			varying vec2 v_destination;
			void main() {
				vec3 d = vec3(v_destination, 1.0);
				vec2 source = vec2(dot(u_h0, d), dot(u_h1, d)) / dot(u_h2, d) / u_sourceSize;
				gl_FragColor = texture2D(u_image, source);
			}
		`,
		);
		const program = gl.createProgram();
		if (!program) throw new Error("Could not prepare the crop.");
		gl.attachShader(program, vertex);
		gl.attachShader(program, fragment);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS))
			throw new Error("Could not prepare the crop.");
		// biome-ignore lint/correctness/useHookAtTopLevel: WebGL API, not a React hook.
		gl.useProgram(program);
		const attribute = (name: string, data: number[]) => {
			gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
			const location = gl.getAttribLocation(program, name);
			gl.enableVertexAttribArray(location);
			gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
		};
		attribute("a_position", [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
		attribute("a_destination", [0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]);
		gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			textureSource,
		);
		gl.uniform1i(gl.getUniformLocation(program, "u_image"), 0);
		gl.uniform3f(
			gl.getUniformLocation(program, "u_h0"),
			matrix[0],
			matrix[1],
			matrix[2],
		);
		gl.uniform3f(
			gl.getUniformLocation(program, "u_h1"),
			matrix[3],
			matrix[4],
			matrix[5],
		);
		gl.uniform3f(
			gl.getUniformLocation(program, "u_h2"),
			matrix[6],
			matrix[7],
			1,
		);
		gl.uniform2f(
			gl.getUniformLocation(program, "u_sourceSize"),
			textureSource.width,
			textureSource.height,
		);
		gl.viewport(0, 0, canvas.width, canvas.height);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		const output = imageCanvas(canvas, canvas.width, canvas.height);
		return {
			image: output.toDataURL("image/webp", 0.94),
			width: output.width,
			height: output.height,
		};
	} finally {
		gl.getExtension("WEBGL_lose_context")?.loseContext();
	}
}
