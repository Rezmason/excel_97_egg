import Model from "./model.js";
import GUI from "./gui.js";
import Controls from "./controls.js";
import {
	loadShaderSet,
	loadBase64Shader,
	loadColorTable,
	loadTexturePack,
} from "./utils.js";
const { vec2, mat3, mat4 } = glMatrix;

export default (async () => {
	const { events, settings } = await GUI;
	const { data, terrain } = await Model;
	const { update, controlData } = await Controls;

	const viewscreenCanvas = document.querySelector("viewscreen canvas");
	const viewscreenImage = document.querySelector("viewscreen img");
	const viewElement = settings.cursed ? viewscreenImage : viewscreenCanvas;
	(settings.cursed ? viewscreenCanvas : viewscreenImage).remove();

	const canvas = settings.cursed
		? document.createElement("canvas")
		: viewscreenCanvas;

	const regl = createREGL({
		canvas,
		attributes: { antialias: false, preserveDrawingBuffer: settings.cursed },
		extensions: ["OES_standard_derivatives", "EXT_texture_filter_anisotropic"],
	});

	const [colorTable, linearColorTable, indexedColorTextures] =
		await Promise.all([
			loadColorTable(regl, data.rendering.color_table, false),
			loadColorTable(regl, data.rendering.color_table, true),
			loadTexturePack(regl, data.rendering.texture_packs.indexed_color),
		]);

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

	let terrainOffsets = singleOffset;
	const screenSize = vec2.create();
	const camera = mat4.create();
	const viewport = mat3.create();
	const repeatOffset = vec2.create();

	const demoProps = {
		DEMO_ID: data.rendering.supported_demos.indexOf(settings.demo),
	};
	const cursedFlag = settings.cursed ? ["CURSED"] : [];

	const [indexedShaderSet, trueColorShaderSet, base64Shader] =
		await Promise.all([
			loadShaderSet(["INDEXED_COLOR", ...cursedFlag], demoProps),
			loadShaderSet(["TRUE_COLOR", ...cursedFlag], demoProps),
			settings.cursed ? loadBase64Shader() : {},
		]);

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

	const resize = () => {
		if (settings.cursed) {
			return;
		}

		let scaleFactor = window.devicePixelRatio;
		if (settings.limitDrawResolution) {
			scaleFactor =
				viewElement.clientWidth > viewElement.clientHeight
					? data.rendering.resolution[0] / viewElement.clientWidth
					: data.rendering.resolution[1] / viewElement.clientHeight;
			scaleFactor = Math.min(scaleFactor, window.devicePixelRatio);
		}
		const width = Math.ceil(viewElement.clientWidth * scaleFactor);
		const height = Math.ceil(viewElement.clientHeight * scaleFactor);
		vec2.set(screenSize, width, height);
		canvas.width = width;
		canvas.height = height;
	};

	const interpretSettings = async () => {
		await deferredTrueColorLoad();

		for (const key in settings) {
			state[key] = settings[key] ? 1 : 0;
		}

		state.fogFar = data.rendering.fogFar * (settings.lightingCutoff ? 1 : 3);
		state.quadBorder = settings.showQuadEdges ? data.rendering.quadBorder : 0;

		terrainOffsets = settings.lightingCutoff ? singleOffset : repeatingOffsets;

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

	const sceneFBO = settings.cursed ? regl.framebuffer() : null;
	const base64FBO = settings.cursed ? regl.framebuffer() : null;

	const bmpPrefix = settings.cursed ? data.cursed.prefix.join("") : null;
	const bmpSuffix = settings.cursed ? data.cursed.suffix.join("") : null;
	const cursedData = settings.cursed
		? new Uint8Array(
				(data.cursed.resolution[0] * data.cursed.resolution[1] * 4) / 3
		  )
		: null;
	const decoder = settings.cursed ? new TextDecoder("ascii") : null;

	if (settings.cursed) {
		const cursedResolution = data.cursed.resolution;
		vec2.set(screenSize, ...cursedResolution);
		[canvas.width, canvas.height] = cursedResolution;
		sceneFBO.resize(...cursedResolution);
		base64FBO.resize(cursedResolution[0], cursedResolution[1] / 3);
	}

	const encodeBase64 = settings.cursed
		? regl({
				depth: { enable: false },
				...base64Shader,
				attributes: {
					aPos: [tl, bl, tr, br, tr, bl],
				},
				count: 6,
				uniforms: {
					size: data.cursed.resolution,
					src: sceneFBO,
					tab: regl.texture({
						data: data.cursed.base64Table,
						width: 64,
						height: 1,
						format: "luminance",
					}),
				},
				framebuffer: base64FBO,
		  })
		: null;

	const drawHorizon = regl({
		depth: { enable: false },
		vert: regl.prop("horizonVert"),
		frag: regl.prop("horizonFrag"),
		attributes: {
			aPosition: [tl, bl, tr, br, tr, bl],
		},
		count: 6,
		uniforms,
		framebuffer: sceneFBO,
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
		framebuffer: sceneFBO,
	});

	events.addEventListener("settingsChanged", async (event) => {
		interpretSettings();
	});

	window.addEventListener("resize", (event) => resize());
	if (screen.orientation != null) {
		screen.orientation.addEventListener("change", (event) => resize());
	}

	await interpretSettings();

	const lastScreenSize = vec2.fromValues(1, 1);
	let lastTime = -1;

	const startTime = Date.now();
	const fovRadians = (Math.PI / 180) * data.rendering.fov;
	const targetFrameTime = 1 / data.rendering.targetFPS;

	const draw = () => {
		regl.poll();
		regl.clear({ depth: 1, framebuffer: sceneFBO });

		if (!settings.birdsEyeView) {
			drawHorizon(state);
		}

		for (const offset of terrainOffsets) {
			vec2.set(repeatOffset, ...offset);
			drawTerrain(state);
		}

		if (settings.cursed) {
			encodeBase64();
			regl.read({ data: cursedData, framebuffer: base64FBO });
			viewElement.src = bmpPrefix + decoder.decode(cursedData) + bmpSuffix;
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
