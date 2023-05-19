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

	document.addEventListener("touchmove", (event) => event.preventDefault(), {
		passive: false,
	});

	events.addEventListener("settingsChanged", (event) => {
		deferredTrueColorLoad();
		resize();
	});

	const deferredTrueColorLoad = async () => {
		if (settings.trueColorTextures && trueColorTextures == null) {
			trueColorTextures = await loadTexturePack(
				regl,
				data.rendering.texture_packs.true_color
			);
		}
	};

	const regl = createREGL({
		canvas,
		attributes: { antialias: false },
		extensions: ["OES_standard_derivatives", "EXT_texture_filter_anisotropic"],
	});

	const indexedColorTextures = await loadTexturePack(
		regl,
		data.rendering.texture_packs.indexed_color
	);
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
	let trueColorTextures = null;
	await deferredTrueColorLoad();

	const camera = mat4.create();
	const repeatOffset = vec2.create();
	const screenSize = vec2.create();

	const renderProperties = {
		camera,
		repeatOffset,
		screenSize,

		...controlData,

		birdsEyeView: 0,
		lightingCutoff: 1,
		limitDrawResolution: 1,
		vertexJiggle: data.rendering.vertexJiggle,
		quadBorder: 0,
		showSindogs: 0,
		fogFar: data.rendering.fogFar,
		colorTable,
		linearColorTable,
		colorTableWidth: colorTable.width,
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
		vec2.set(screenSize, width, height);
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
			horizonHeight: indexedColorTextures.horizonTexture.height,
			showSindogs: regl.prop("showSindogs"),
			rotation: regl.prop("rotation"),

			colorTable: regl.prop("colorTable"),
			linearColorTable: regl.prop("linearColorTable"),
			colorTableWidth: regl.prop("colorTableWidth"),

			camera: regl.prop("camera"),
			horizonTransform: regl.prop("horizonTransform"),

			time: regl.prop("time"),
			timeOffset: regl.prop("timeOffset"),
		},

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

		uniforms: {
			camera: regl.prop("camera"),
			transform: regl.prop("transform"),
			screenSize: regl.prop("screenSize"),
			position: regl.prop("position"),
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

			colorTable: regl.prop("colorTable"),
			linearColorTable: regl.prop("linearColorTable"),
			colorTableWidth: regl.prop("colorTableWidth"),

			titleCreditColor: data.rendering.titleCreditColor,
			bodyCreditColor: data.rendering.bodyCreditColor,

			timeOffset: regl.prop("timeOffset"),
		},
	});

	const indexedShaderSet = await loadShaderSet("indexed_color");
	const trueColorShaderSet = await loadShaderSet("true_color");

	const dimensions = { width: 1, height: 1 };
	let lastFrameTime = -1;
	const start = Date.now();
	const raf = regl.frame(({ viewportWidth, viewportHeight, time }) => {
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

		const trueColor = settings.trueColorTextures && trueColorTextures != null;
		const textures = trueColor ? trueColorTextures : indexedColorTextures;
		Object.assign(renderProperties, textures);
		const shaderSet = trueColor ? trueColorShaderSet : indexedShaderSet;
		Object.assign(renderProperties, shaderSet);

		renderProperties.currentQuadID = terrain.getQuadAt(
			...controlData.position
		).id;
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
					vec2.set(repeatOffset, x, y);
					drawTerrain(renderProperties);
				}
			}
		} else {
			vec2.set(repeatOffset, 0, 0);
			drawTerrain(renderProperties);
		}
	});
})();
