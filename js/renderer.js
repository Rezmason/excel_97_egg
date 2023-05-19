import Model from "./model.js";
import GUI from "./gui.js";
import Controls from "./controls.js";
import { loadShaderSet, loadColorTable, loadTexturePack } from "./utils.js";
const { mat4, vec2 } = glMatrix;

export default (async () => {
	const { events, settings } = await GUI;
	const { data, terrain } = await Model;
	const { update, controlData } = await Controls;

	const canvas = document.querySelector("canvas");

	const regl = createREGL({
		canvas,
		attributes: { antialias: false },
		extensions: ["OES_standard_derivatives", "EXT_texture_filter_anisotropic"],
	});

	const deferredTrueColorLoad = async () => {
		if (settings.trueColorTextures && trueColorTextures == null) {
			trueColorTextures = await loadTexturePack(
				regl,
				data.rendering.texture_packs.true_color
			);
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
	await deferredTrueColorLoad();

	const camera = mat4.create();
	const repeatOffset = vec2.create();
	const screenSize = vec2.create();

	const indexedShaderSet = await loadShaderSet("indexed_color");
	const trueColorShaderSet = await loadShaderSet("true_color");

	const state = {
		time: 0,
		camera,
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

	const interpretSettings = () => {
		for (const key in settings) {
			state[key] = settings[key] ? 1 : 0;
		}
		state.fogFar = data.rendering.fogFar * (settings.lightingCutoff ? 1 : 3);
		state.quadBorder = settings.showQuadEdges ? data.rendering.quadBorder : 0;
	};

	const drawHorizon = regl({
		vert: regl.prop("horizonVert"),
		frag: regl.prop("horizonFrag"),
		attributes: {
			aPosition: [-1000, -1, 1000, -1, 0, 1],
		},
		count: 3,
		uniforms,
		depth: { enable: false },
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

	events.addEventListener("settingsChanged", (event) => {
		deferredTrueColorLoad();
		interpretSettings();
		resize();
	});

	window.addEventListener("resize", (event) => resize());
	screen.orientation.addEventListener("change", (event) => resize());
	interpretSettings();
	resize();

	const dimensions = { width: 1, height: 1 };
	let lastFrameTime = -1;
	const start = Date.now();
	const raf = regl.frame(({ viewportWidth, viewportHeight, time }) => {
		// raf.cancel();

		const deltaTime = time - lastFrameTime;

		const mustResize =
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

		const trueColor = settings.trueColorTextures && trueColorTextures != null;
		const textures = trueColor ? trueColorTextures : indexedColorTextures;
		Object.assign(state, textures);
		const shaderSet = trueColor ? trueColorShaderSet : indexedShaderSet;
		Object.assign(state, shaderSet);

		state.currentQuadID = terrain.getQuadAt(...controlData.position).id;
		state.time = (Date.now() - start) / 1000;

		if (!settings.birdsEyeView) {
			drawHorizon(state);
		}

		if (state.lightingCutoff == 0) {
			for (let y = -1; y < 2; y++) {
				for (let x = -1; x < 2; x++) {
					vec2.set(repeatOffset, x, y);
					drawTerrain(state);
				}
			}
		} else {
			vec2.set(repeatOffset, 0, 0);
			drawTerrain(state);
		}
	});
})();
