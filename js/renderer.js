import Model from "./model.js";
import GUI from "./gui.js";
import Controls from "./controls.js";
const { mat4, vec2 } = glMatrix;

export default (async () => {
	const { events, settings } = await GUI;
	const { data, terrain } = await Model;
	const {
		update,
		transform,
		horizonTransform,
		position,
		rotation,
		timeOffset,
	} = await Controls;

	const canvas = document.querySelector("canvas");

	document.addEventListener("touchmove", (event) => event.preventDefault(), {
		passive: false,
	});

	events.addEventListener("settingsChanged", (event) => {
		deferredTrueColorLoad();
		resize();
	});

	const deferredTrueColorLoad = async () => {
		if (settings.trueColorTextures && trueColorTexturePack == null) {
			trueColorTexturePack = await loadTexturePack(
				data.rendering.texture_packs.true_color
			);
		}
	};

	const regl = createREGL({
		canvas,
		attributes: { antialias: false },
		extensions: ["OES_standard_derivatives", "EXT_texture_filter_anisotropic"],
	});

	const [
		horizonIndexedVert,
		horizonIndexedFrag,
		terrainIndexedVert,
		terrainIndexedFrag,
	] = await Promise.all(
		[
			"glsl/indexed_color/horizon.vert",
			"glsl/indexed_color/horizon.frag",
			"glsl/indexed_color/terrain.vert",
			"glsl/indexed_color/terrain.frag",
		].map((url) => fetch(url).then((response) => response.text()))
	);

	const [
		horizonTrueColorVert,
		horizonTrueColorFrag,
		terrainTrueColorVert,
		terrainTrueColorFrag,
	] = await Promise.all(
		[
			"glsl/true_color/horizon.vert",
			"glsl/true_color/horizon.frag",
			"glsl/true_color/terrain.vert",
			"glsl/true_color/terrain.frag",
		].map((url) => fetch(url).then((response) => response.text()))
	);

	const loadImage = async (url, isSDF) => {
		const image = new Image();
		image.crossOrigin = "anonymous";
		image.src = url;
		await image.decode();

		const isNPOT =
			Math.log2(image.width) % 1 > 0 || Math.log2(image.height) % 1 > 0;

		const mipmap = !isNPOT && !isSDF;

		return {
			image: {
				data: image,
				mipmap,
				anisotropic: data.rendering.anisotropicLevels,
				min: mipmap ? "mipmap" : "linear",
				mag: "linear",
			},
		};
	};

	const littleEndian = (() => {
		const buffer = new ArrayBuffer(2);
		new DataView(buffer).setInt16(0, 256, true);
		return new Int16Array(buffer)[0] === 256;
	})();

	const loadIndexedBitmap = async (url) => {
		const file = await fetch(url).then((response) => response.arrayBuffer());
		const header = new DataView(file);

		// assert "BM" DIB
		if (header.getUint16(0) !== 0x424d) {
			throw new Error(`file at ${url} is not properly formatted.`);
		}

		// Assert 8 bits per pixel
		const bitsPerPixel = header.getUint16(28, littleEndian);
		if (bitsPerPixel !== 8) {
			throw new Error(`Bitmap ${url} has the wrong bpp.`);
		}

		const colorTableSize =
			header.getUint32(46, littleEndian) || 1 << bitsPerPixel;

		const colorTableBytes = new Uint8Array(file, 54, colorTableSize * 4);
		const colorTable = Array(colorTableSize)
			.fill()
			.map((_, index) => [
				colorTableBytes[index * 4 + 2],
				colorTableBytes[index * 4 + 1],
				colorTableBytes[index * 4 + 0],
			]);
		const colorTableWidth = 1 << Math.ceil(bitsPerPixel / 2);

		const width = header.getUint32(18, littleEndian);
		const height = header.getUint32(22, littleEndian);
		const pixelStart = header.getUint32(10, littleEndian);
		let pixels = Array(height)
			.fill()
			.map((_, index) =>
				Array.from(new Uint8Array(file, pixelStart + width * index, width))
			)
			.reverse()
			.flat();

		return {
			image: {
				format: "luminance",
				type: "uint8",
				width,
				height,
				data: pixels,
			},
			colorTable: {
				format: "rgb",
				type: "uint8",
				wrapS: "clamp",
				wrapT: "clamp",
				width: colorTableWidth,
				height: colorTableWidth,
				data: colorTable,
			},
		};
	};

	const loadColorTableTexture = async (url, linear) =>
		regl.texture({
			...(await loadIndexedBitmap(url)).colorTable,
			min: linear ? "linear" : "nearest",
			mag: linear ? "linear" : "nearest",
		});

	const loadTexturePack = async (pack) => {
		const textures = await Promise.all(
			Object.values(pack).map(async (entry) => {
				const isIndexedColor = entry.type === "indexed_color";
				if (isIndexedColor) {
					return regl.texture((await loadIndexedBitmap(entry.url)).image);
				} else {
					const isSDF = entry.type === "sdf";
					return regl.texture((await loadImage(entry.url, isSDF)).image);
				}
			})
		);
		return Object.fromEntries(
			Object.keys(pack).map((key, index) => [key, textures[index]])
		);
	};

	const texturePack = await loadTexturePack(
		data.rendering.texture_packs.standard
	);
	const colorTableTexture = await loadColorTableTexture(
		data.rendering.color_table,
		false
	);
	const linearColorTableTexture = await loadColorTableTexture(
		data.rendering.color_table,
		true
	);
	let trueColorTexturePack = null;
	await deferredTrueColorLoad();

	const camera = mat4.create();

	const renderProperties = {
		camera,
		transform,
		horizonTransform,
		position,
		rotation,
		timeOffset,
		repeatOffset: vec2.create(),
		birdsEyeView: 0,
		lightingCutoff: 1,
		limitDrawResolution: 1,
		vertexJiggle: data.rendering.vertexJiggle,
		quadBorder: 0,
		showSindogs: 0,
		screenSize: [0, 0],
		fogFar: data.rendering.fogFar,
		colorTableTexture,
		linearColorTableTexture,
		colorTableWidth: colorTableTexture.width,
	};

	const resize = () => {
		let scaleFactor = window.devicePixelRatio;
		if (settings.limitDrawResolution) {
			scaleFactor =
				canvas.clientWidth > canvas.clientHeight
					? data.rendering.resolution[0] / canvas.clientWidth
					: data.rendering.resolution[1] / canvas.clientHeight;
			scaleFactor = Math.min(scaleFactor, window.devicePixelRatio);
		}
		const width = Math.ceil(canvas.clientWidth * scaleFactor);
		const height = Math.ceil(canvas.clientHeight * scaleFactor);
		renderProperties.screenSize = [width, height];
		canvas.width = width;
		canvas.height = height;
	};

	window.addEventListener("resize", (event) => resize());
	screen.orientation.addEventListener("change", (event) => resize());
	resize();

	const drawHorizon = regl({
		vert: regl.prop("horizonVert"),
		frag: regl.prop("horizonFrag"),

		attributes: {
			aPosition: [-1000, -1, 1000, -1, 0, 1],
		},
		count: 3,

		uniforms: {
			horizonTexture: regl.prop("horizonTexture"),
			horizonHeight: data.horizon.height,
			showSindogs: regl.prop("showSindogs"),
			rotation: regl.prop("rotation"),

			colorTableTexture: regl.prop("colorTableTexture"),
			linearColorTableTexture: regl.prop("linearColorTableTexture"),
			colorTableWidth: regl.prop("colorTableWidth"),

			camera: regl.prop("camera"),
			horizonTransform: regl.prop("horizonTransform"),

			time: regl.prop("time"),
			timeOffset: regl.prop("timeOffset"),
		},

		depth: { enable: false },
	});

	const creditColors = data.rendering.creditColors;

	const drawTerrain = regl({
		cull: {
			enable: true,
			face: "back",
		},
		vert: regl.prop("terrainVert"),
		frag: regl.prop("terrainFrag"),

		attributes: terrain.attributes,
		count: terrain.numVertices,

		uniforms: {
			tick: regl.context("tick"),
			camera: regl.prop("camera"),
			transform: regl.prop("transform"),
			screenSize: regl.prop("screenSize"),
			airplanePosition: regl.prop("position"),
			terrainSize: terrain.size,
			maxDrawDistance: data.rendering.maxDrawDistance,
			currentQuadID: regl.prop("currentQuadID"),
			birdsEyeView: regl.prop("birdsEyeView"),
			lightingCutoff: regl.prop("lightingCutoff"),
			limitDrawResolution: regl.prop("limitDrawResolution"),
			vertexJiggle: regl.prop("vertexJiggle"),
			quadBorder: regl.prop("quadBorder"),
			repeatOffset: regl.prop("repeatOffset"),
			time: regl.prop("time"),
			fogNear: data.rendering.fogNear,
			fogFar: regl.prop("fogFar"),
			moonscapeTexture: regl.prop("moonscapeTexture"),
			platformTexture: regl.prop("platformTexture"),
			creditsTexture: regl.prop("creditsTexture"),

			colorTableTexture: regl.prop("colorTableTexture"),
			linearColorTableTexture: regl.prop("linearColorTableTexture"),
			colorTableWidth: regl.prop("colorTableWidth"),

			creditColor1: creditColors[0],
			creditColor2: creditColors[1],

			timeOffset: regl.prop("timeOffset"),
		},
	});

	const indexedShaders = {
		horizonVert: horizonIndexedVert,
		horizonFrag: horizonIndexedFrag,
		terrainVert: terrainIndexedVert,
		terrainFrag: terrainIndexedFrag,
	};

	const trueColorShaders = {
		horizonVert: horizonTrueColorVert,
		horizonFrag: horizonTrueColorFrag,
		terrainVert: terrainTrueColorVert,
		terrainFrag: terrainTrueColorFrag,
	};

	const dimensions = { width: 1, height: 1 };
	let lastFrameTime = -1;
	const start = Date.now();
	const raf = regl.frame(({ viewportWidth, viewportHeight, time, tick }) => {
		// raf.cancel();

		const deltaTime = time - lastFrameTime;

		let mustResize =
			dimensions.width !== viewportWidth ||
			dimensions.height !== viewportHeight;

		if (mustResize) {
			dimensions.width = viewportWidth;
			dimensions.height = viewportHeight;
			const aspectRatio = viewportWidth / viewportHeight;

			mat4.perspective(
				camera,
				(Math.PI / 180) * data.rendering.fov,
				aspectRatio,
				0.01,
				terrain.size * 2
			);
		}

		if (
			!mustResize &&
			settings.limitDrawSpeed &&
			deltaTime < 1 / data.rendering.targetFPS
		) {
			return;
		}
		lastFrameTime = time;

		update(deltaTime);

		const trueColor = settings.trueColorTextures && trueColorTexturePack != null;
		const textures = trueColor ? trueColorTexturePack : texturePack;
		Object.assign(renderProperties, textures);
		const shaders = trueColor ? trueColorShaders : indexedShaders;
		Object.assign(renderProperties, shaders);

		renderProperties.currentQuadID = terrain.getQuadAt(...position).id;
		renderProperties.time = (Date.now() - start) / 1000;

		renderProperties.birdsEyeView = settings.birdsEyeView ? 1 : 0;
		renderProperties.lightingCutoff = settings.lightingCutoff ? 1 : 0;
		renderProperties.limitDrawResolution = settings.limitDrawResolution ? 1 : 0;
		renderProperties.fogFar =
			data.rendering.fogFar * (settings.lightingCutoff ? 1 : 3);
		renderProperties.quadBorder = settings.showQuadEdges
			? data.rendering.quadBorder
			: 0;
		renderProperties.showSindogs = settings.showSindogs ? 1 : 0;

		if (!settings.birdsEyeView) {
			drawHorizon(renderProperties);
		}

		if (renderProperties.lightingCutoff == 0) {
			for (let y = -1; y < 2; y++) {
				for (let x = -1; x < 2; x++) {
					vec2.set(renderProperties.repeatOffset, x, y);
					drawTerrain(renderProperties);
				}
			}
		} else {
			vec2.set(renderProperties.repeatOffset, 0, 0);
			drawTerrain(renderProperties);
		}
	});
})();
