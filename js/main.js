import Model from "./model.js";
import GUI from "./gui.js";
import Controls from "./controls.js";
const { mat4, vec2 } = glMatrix;

(async () => {
	const canvas = document.querySelector("canvas");

	document.addEventListener("touchmove", (event) => event.preventDefault(), {
		passive: false,
	});

	const { events, settings } = await GUI;

	events.addEventListener("settingsChanged", async (event) => {
		if (settings.hiResTextures && hiResTexturePack == null) {
			hiResTexturePack = await loadTexturePack(data.texture_packs.hi_res);
		}
		resize();
	});

	const { data, terrain } = await Model;

	const regl = createREGL({
		canvas,
		attributes: { antialias: false },
		extensions: ["OES_standard_derivatives", "EXT_texture_filter_anisotropic"],
	});

	const [horizonVert, horizonFrag, terrainVert, terrainFrag] =
		await Promise.all(
			[
				"glsl/horizon.vert",
				"glsl/horizon.frag",
				"glsl/terrain.vert",
				"glsl/terrain.frag",
			].map((url) => fetch(url).then((response) => response.text()))
		);

	const loadTexturePack = async (pack) => {
		const textures = await Promise.all(
			Object.values(pack).map(async (entry) => {
				const image = new Image();
				image.crossOrigin = "anonymous";
				image.src = entry.url;
				await image.decode();
				const isNPOT =
					Math.log2(image.width) % 1 > 0 || Math.log2(image.height) % 1 > 0;
				const hiResParams = entry.hi_res
					? {
							mipmap: !isNPOT,
							anisotropic: 12,
							min: isNPOT ? "linear" : "mipmap",
							mag: "linear",
					  }
					: {};
				return regl.texture({ data: image, ...hiResParams });
			})
		);
		return Object.fromEntries(
			Object.keys(pack).map((key, index) => [key, textures[index]])
		);
	};

	const texturePack = await loadTexturePack(data.texture_packs.standard);
	let hiResTexturePack = null;

	const camera = mat4.create();

	const { update, transform, position, rotation, rollMat } = await Controls;

	const renderProperties = {
		camera,
		rollMat,
		transform,
		position,
		rotation,
		repeatOffset: vec2.create(),
		birdsEyeView: 0,
		lightingCutoff: 1,
		quadBorder: 0,
		showSindogs: 0,
		fogFar: data.fogFar,
	};

	const resize = () => {
		let scaleFactor = window.devicePixelRatio;
		if (settings.limitDrawResolution) {
			scaleFactor =
				canvas.clientWidth > canvas.clientHeight
					? data.resolution[0] / canvas.clientWidth
					: data.resolution[1] / canvas.clientHeight;
			scaleFactor = Math.min(scaleFactor, window.devicePixelRatio);
		}
		canvas.width = Math.ceil(canvas.clientWidth * scaleFactor);
		canvas.height = Math.ceil(canvas.clientHeight * scaleFactor);
	};

	window.addEventListener("resize", (event) => resize);
	resize();

	const drawHorizon = regl({
		vert: horizonVert,
		frag: horizonFrag,

		attributes: {
			aPosition: [-4, -4, 4, -4, 0, 4],
		},
		count: 3,

		uniforms: {
			horizonTexture: regl.prop("horizonTexture"),
			horizonHeight: texturePack.horizonTexture.height,
			showSindogs: regl.prop("showSindogs"),
			rotation: regl.prop("rotation"),
			rollMat: regl.prop("rollMat"),
		},

		depth: { enable: false },
	});

	const drawTerrain = regl({
		cull: {
			enable: true,
			face: "back",
		},
		vert: terrainVert,
		frag: terrainFrag,

		attributes: terrain.attributes,
		count: terrain.numVertices,

		uniforms: {
			tick: regl.context("tick"),
			camera: regl.prop("camera"),
			airplanePosition: regl.prop("position"),
			terrainSize: data.size,
			maxDrawDistance: data.maxDrawDistance,
			transform: regl.prop("transform"),
			currentQuadID: regl.prop("currentQuadID"),
			birdsEyeView: regl.prop("birdsEyeView"),
			lightingCutoff: regl.prop("lightingCutoff"),
			quadBorder: regl.prop("quadBorder"),
			repeatOffset: regl.prop("repeatOffset"),
			time: regl.prop("time"),
			fogNear: data.fogNear,
			fogFar: regl.prop("fogFar"),
			moonscapeTexture: regl.prop("moonscapeTexture"),
			platformTexture: regl.prop("platformTexture"),
			creditsTexture: regl.prop("creditsTexture"),

			creditColor1: [0.0, 0.0, 0.0],
			creditColor2: [0.87, 0.87, 0.87],
			creditColor3: [0.19, 0.09, 0.17], // 0.06, 0.03, 0.06
			creditColor4: [0.94, 0.52, 0.12],
		},
	});

	const dimensions = { width: 1, height: 1 };
	let lastFrameTime = -1;
	const start = Date.now();
	const raf = regl.frame(({ viewportWidth, viewportHeight, time, tick }) => {
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
				(Math.PI / 180) * data.fov,
				aspectRatio,
				0.1,
				data.size * 1.5
			);
		}

		if (
			!mustResize &&
			settings.limitDrawSpeed &&
			deltaTime < 1 / data.targetFPS
		) {
			return;
		}
		lastFrameTime = time;

		try {
			update(deltaTime);
		} catch (error) {
			raf.cancel();
			throw error;
		}
		const textures = settings.hiResTextures ? hiResTexturePack : texturePack;
		Object.assign(renderProperties, textures);
		renderProperties.currentQuadID = terrain.getQuadAt(...position).id;
		renderProperties.time = (Date.now() - start) / 1000;

		renderProperties.birdsEyeView = settings.birdsEyeView ? 1 : 0;
		renderProperties.lightingCutoff = settings.lightingCutoff ? 1 : 0;
		renderProperties.fogFar = data.fogFar * (settings.lightingCutoff ? 1 : 3);
		renderProperties.quadBorder = settings.showQuadEdges ? 0.02 : 0;
		renderProperties.showSindogs = settings.showSindogs ? 1 : 0;

		try {
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
		} catch (error) {
			raf.cancel();
			throw error;
		}
	});
})();
