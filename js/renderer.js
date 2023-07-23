import Model from "./model.js";
import GUI from "./gui.js";
import Controls from "./controls.js";
import { loadShaderSet, loadColorTable, loadTexturePack } from "./utils.js";
const { vec2, mat3, mat4 } = glMatrix;

export default (async () => {
	const { events, settings } = await GUI;
	const { data, terrain } = await Model;
	const { update, controlData } = await Controls;

	const viewscreenCanvas = document.querySelector("viewscreen canvas");
	const viewscreenImage = document.querySelector("viewscreen img");

	if (settings.cursed) {
		viewscreenCanvas.remove();
	} else {
		viewscreenImage.remove();
	}

	const canvas = settings.cursed
		? document.createElement("canvas")
		: viewscreenCanvas;

	const regl = createREGL({
		canvas,
		attributes: { antialias: false, preserveDrawingBuffer: settings.cursed },
		extensions: ["OES_standard_derivatives", "EXT_texture_filter_anisotropic"],
	});

	const framebuffer = settings.cursed ? regl.framebuffer() : null;

	const deferredTrueColorLoad = async () => {
		const shouldLoad = settings.trueColorTextures && trueColorTextures == null;
		if (shouldLoad) {
			trueColorTextures = await loadTexturePack(
				regl,
				data.rendering.texture_packs.true_color
			);
		}

		if (settings.trueColorTextures) {
			Object.assign(state, trueColorTextures);
		}
	};

	const colorTable = await loadColorTable(
		regl,
		data.rendering.color_table,
		false
	);

	const linearColorTable = await loadColorTable(
		regl,
		data.rendering.color_table,
		true
	);

	const indexedColorTextures = await loadTexturePack(
		regl,
		data.rendering.texture_packs.indexed_color
	);

	let trueColorTextures = null;

	const repeatingOffsets = Array(3)
		.fill()
		.map((_, y) =>
			Array(3)
				.fill()
				.map((_, x) => [x - 1, y - 1])
		)
		.flat();
	const singleOffset = [[0, 0]];

	let offsets = singleOffset;
	const screenSize = vec2.create();
	const camera = mat4.create();
	const viewport = mat3.create();
	const repeatOffset = vec2.create();

	const demoProps = {
		DEMO_ID: data.rendering.supported_demos.indexOf(settings.demo),
	};
	const cursedFlag = settings.cursed ? ["CURSED"] : [];

	const indexedShaderSet = await loadShaderSet(
		["INDEXED_COLOR", ...cursedFlag],
		demoProps
	);
	const trueColorShaderSet = await loadShaderSet(
		["TRUE_COLOR", ...cursedFlag],
		demoProps
	);

	const state = {
		time: 0,
		camera,
		viewport,
		repeatOffset,
		screenSize,
		currentQuadID: -1,

		...controlData,
		...settings,
		...data.rendering,
		...indexedColorTextures,
		...indexedShaderSet,

		colorTable,
		linearColorTable,
		colorTableWidth: colorTable.width,

		terrainSize: terrain.size,
		horizonHeight: indexedColorTextures.horizonTexture.height,
	};

	const uniforms = Object.fromEntries(
		Object.keys(state).map((key) => [key, regl.prop(key)])
	);

	const interpretSettings = async () => {
		await deferredTrueColorLoad();

		for (const key in settings) {
			state[key] = settings[key] ? 1 : 0;
		}

		state.fogFar = data.rendering.fogFar * (settings.lightingCutoff ? 1 : 3);
		state.quadBorder = settings.showQuadEdges ? data.rendering.quadBorder : 0;

		offsets = settings.lightingCutoff ? offsets : repeatingOffsets;

		const trueColor = settings.trueColorTextures && trueColorTextures != null;
		const textures = trueColor ? trueColorTextures : indexedColorTextures;
		Object.assign(state, textures);
		const shaderSet = trueColor ? trueColorShaderSet : indexedShaderSet;
		Object.assign(state, shaderSet);

		resize();
	};

	const [tl, tr, bl, br] = [
		[1000, 1000],
		[-1000, 1000],
		[1000, -1000],
		[-1000, -1000],
	];

	const drawHorizon = regl({
		depth: { enable: false },
		vert: regl.prop("horizonVert"),
		frag: regl.prop("horizonFrag"),
		attributes: {
			aPosition: [tl, bl, tr, br, tr, bl],
		},
		count: 6,
		uniforms,
		framebuffer,
	});

	const drawTerrain = regl({
		cull: {
			enable: true,
			face: "back",
		},
		vert: regl.prop("terrainVert"),
		frag: regl.prop("terrainFrag"),
		attributes: terrain.attributes,
		count: terrain.numVertices,
		uniforms,
		framebuffer,
	});

	const resize = () => {
		if (settings.cursed) {
			const resolution = data.rendering.resolution;
			vec2.set(screenSize, ...resolution);
			[canvas.width, canvas.height] = resolution;
			framebuffer.resize(...resolution);
			return;
		}

		let scaleFactor = window.devicePixelRatio;
		if (settings.limitDrawResolution) {
			scaleFactor =
				viewscreenCanvas.clientWidth > viewscreenCanvas.clientHeight
					? data.rendering.resolution[0] / viewscreenCanvas.clientWidth
					: data.rendering.resolution[1] / viewscreenCanvas.clientHeight;
			scaleFactor = Math.min(scaleFactor, window.devicePixelRatio);
		}
		const width = Math.ceil(viewscreenCanvas.clientWidth * scaleFactor);
		const height = Math.ceil(viewscreenCanvas.clientHeight * scaleFactor);
		vec2.set(screenSize, width, height);
		canvas.width = width;
		canvas.height = height;
	};

	document.addEventListener("touchmove", (event) => event.preventDefault(), {
		passive: false,
	});

	events.addEventListener("settingsChanged", async (event) => {
		interpretSettings();
	});

	window.addEventListener("resize", (event) => resize());
	screen.orientation.addEventListener("change", (event) => resize());

	await interpretSettings();

	const lastScreenSize = vec2.fromValues(1, 1);
	let lastTime = -1;

	const startTime = Date.now();
	const fovRadians = (Math.PI / 180) * data.rendering.fov;
	const targetFrameTime = 1 / data.rendering.targetFPS;

	const bmpDataURL = await fetch("assets/empty_framebuffer_640x480@1080.bmp")
		.then((response) => response.blob())
		.then(
			(blob) =>
				new Promise((resolve) => {
					const fileReader = new FileReader();
					fileReader.onload = (evt) => {
						resolve(fileReader.result);
					};
					fileReader.readAsDataURL(blob);
				})
		);

	const dataURLPreambleLength = "data:image/bmp;base64,".length;
	const bmpHeaderLength = (1080 * 4) / 3; // TODO: put 640, 480 and 1080 someplace better
	const pixelArrayLength = (640 * 480 * 4) / 3;

	const bmpPrefix = bmpDataURL.substr(
		0,
		dataURLPreambleLength + bmpHeaderLength
	);
	const bmpSuffix = bmpDataURL.substr(
		dataURLPreambleLength + bmpHeaderLength + pixelArrayLength
	);
	let bmpBody = bmpDataURL.substr(
		dataURLPreambleLength + bmpHeaderLength,
		pixelArrayLength
	);

	const cursedDataUint8 = new Uint8Array(1228800);
	const cursedDataUint32 = new Uint32Array(cursedDataUint8.buffer);
	const cursedData = new Uint8Array(1228800 / 4);

	const charactersByCharCode = Object.fromEntries(
		Array(256)
			.fill()
			.map((_, i) => i)
			.map((i) => [i, String.fromCharCode(i)])
	);

	const draw = () => {
		regl.poll();
		regl.clear({ depth: 1, framebuffer });

		if (!settings.birdsEyeView) {
			drawHorizon(state);
		}

		for (const offset of offsets) {
			vec2.set(repeatOffset, ...offset);
			drawTerrain(state);
		}

		if (settings.cursed) {
			regl.read({ data: cursedDataUint8, framebuffer });
			cursedData.set(cursedDataUint32);
			let s = "";
			const n = 1228800 / 4;
			for (let i = 0; i < n; i++) {
				s += charactersByCharCode[cursedData[i]];
			}
			bmpBody = btoa(s);
			viewscreenImage.src = bmpPrefix + bmpBody + bmpSuffix;
		}
	};

	const animate = () => {
		const time = (Date.now() - startTime) / 1000;
		const frameTime = time - lastTime;

		const mustResize = !vec2.equals(lastScreenSize, screenSize);
		const mustDraw =
			mustResize || !settings.limitDrawSpeed || frameTime >= targetFrameTime;

		if (mustResize) {
			vec2.copy(lastScreenSize, screenSize);
			const aspectRatio = screenSize[0] / screenSize[1];
			mat4.perspective(camera, fovRadians, aspectRatio, 0.01, terrain.size * 2);

			mat3.identity(viewport);
			mat3.scale(
				viewport,
				viewport,
				vec2.scale(vec2.create(), screenSize, 0.5)
			);
			mat3.translate(viewport, viewport, vec2.fromValues(1, 1));
		}

		if (mustDraw) {
			lastTime = time;
			update(frameTime);
			state.currentQuadID = terrain.getQuadAt(...controlData.position).id;
			state.time = time;
			draw();
		}

		requestAnimationFrame(animate);
	};

	animate();
})();
