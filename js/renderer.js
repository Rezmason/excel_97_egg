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

	const demoId = data.rendering.supported_demos.indexOf(settings.demo);

	const indexedShaderSet = await loadShaderSet(["INDEXED_COLOR"], {
		DEMO_ID: demoId,
	});
	const trueColorShaderSet = await loadShaderSet(["TRUE_COLOR"], {
		DEMO_ID: demoId,
	});

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
	});

	const resize = () => {
		if (settings.cursed) {
			const resolution = data.rendering.resolution;
			vec2.set(screenSize, ...resolution);
			[canvas.width, canvas.height] = resolution;
			return;
		}

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
	let lastFrameTime = -1;
	const start = Date.now();
	const helper = document.createElement("canvas");
	const helperContext = helper.getContext("2d");
	const helperData = new ImageData(...data.rendering.resolution);
	const render = ({ time }) => {
		const deltaTime = time - lastFrameTime;
		const mustDraw =
			!settings.limitDrawSpeed || deltaTime >= 1 / data.rendering.targetFPS;
		const mustResize = !vec2.equals(lastScreenSize, screenSize);

		if (!(mustDraw || mustResize)) {
			return;
		}

		regl.clear({ depth: 1 });

		if (mustResize) {
			vec2.copy(lastScreenSize, screenSize);
			const aspectRatio = screenSize[0] / screenSize[1];
			const fovRadians = (Math.PI / 180) * data.rendering.fov;
			mat4.perspective(camera, fovRadians, aspectRatio, 0.01, terrain.size * 2);

			mat3.identity(viewport);
			mat3.scale(
				viewport,
				viewport,
				vec2.scale(vec2.create(), screenSize, 0.5)
			);
			mat3.translate(viewport, viewport, vec2.fromValues(1, 1));
		}

		lastFrameTime = time;
		update(deltaTime);
		state.currentQuadID = terrain.getQuadAt(...controlData.position).id;
		state.time = (Date.now() - start) / 1000;

		if (!settings.birdsEyeView) {
			drawHorizon(state);
		}

		for (const offset of offsets) {
			vec2.set(repeatOffset, ...offset);
			drawTerrain(state);
		}

		if (settings.cursed) {
			helper.width = canvas.width;
			helper.height = canvas.height;
			regl.read(helperData.data);
			helperContext.putImageData(helperData, 0, 0);
			viewscreenImage.src = helper.toDataURL();
		}
	};
	regl.poll();
	render({ time: 0 }); // If there's an error, the RAF is never constructed
	const raf = regl.frame(render);
})();
