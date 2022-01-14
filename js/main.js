import makeTerrain from "./terrain.js";
import Controls from "./controls.js";

document.body.onload = async () => {
	const canvas = document.querySelector("canvas");
	document.addEventListener("touchmove", (event) => event.preventDefault(), {
		passive: false,
	});

	const checkboxesByKeyCode = Object.fromEntries(
		Array.from(document.querySelectorAll("input.mso")).map((checkbox) => [
			checkbox.getAttribute("data-keycode"),
			checkbox,
		])
	);

	const fullscreenCheckbox = document.querySelector("input#fullscreen");
	fullscreenCheckbox.disabled = !(
		document.fullscreenEnabled || document.webkitFullscreenEnabled
	);

	const fullscreenChangeEventType = document.fullscreenEnabled
		? "fullscreenchange"
		: "webkitfullscreenchange";
	document.addEventListener(fullscreenChangeEventType, (event) => {
		let isFullscreen;
		if (document.fullscreenEnabled) {
			isFullscreen = document.fullscreenElement != null;
		} else if (document.webkitFullscreenEnabled) {
			isFullscreen = document.webkitFullscreenElement != null;
		}
		const changed = isFullscreen != fullscreenCheckbox.checked;
		fullscreenCheckbox.checked = isFullscreen;
		if (changed) {
			updateSettings();
		}
	});

	const toolbar = document.querySelector("toolbar");
	toolbar.addEventListener("click", (event) => {
		if (event.target.tagName.toLowerCase() === "input") {
			updateSettings();
		}
	});

	const aboutButton = document.querySelector("button#about");
	aboutButton.addEventListener("click", (event) => {
		showAboutBox();
	});

	const showAboutBox = () => {
		// TODO: about box
	};

	const form = document.querySelector("toolbar form");
	const updateSettings = async () => {
		settings = Object.fromEntries(
			Array.from(new FormData(form).keys()).map((key) => [
				key.replace(/(_[a-z])/g, (s) => s.substr(1).toUpperCase()),
				true,
			])
		);

		if (settings.hiResTextures && hiResTexturePack == null) {
			hiResTexturePack = await loadTexturePack(data.texture_packs.hi_res);
		}

		if (settings.fullscreen) {
			if (document.fullscreenEnabled) {
				document.body.requestFullscreen();
			} else if (document.webkitFullscreenEnabled) {
				document.body.webkitRequestFullscreen();
			}
		} else {
			if (document.fullscreenEnabled) {
				if (document.fullscreenElement != null) {
					document.exitFullscreen();
				}
			} else if (document.webkitFullscreenEnabled) {
				if (document.webkitFullscreenElement == null) {
					document.webkitExitFullscreen();
				}
			}
		}

		resize();
	};

	const regl = createREGL({
		canvas,
		attributes: { antialias: false },
		extensions: ["OES_standard_derivatives", "EXT_texture_filter_anisotropic"],
	});

	const { mat4, vec2 } = glMatrix;

	const data = await fetch("assets/data.json").then((response) =>
		response.json()
	);

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

	Controls.attach(canvas);
	const terrain = makeTerrain(data);
	const camera = mat4.create();
	let settings;

	const { transform, position, rotation, rollMat } = Controls;

	const renderProperties = {
		camera,
		rollMat,
		transform,
		position,
		rotation,
		repeatOffset: vec2.create(),
		showSpotlight: 0,
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
		Controls.resize();
	};

	document.addEventListener("keyup", async (event) => {
		if (event.code === "Space" && toolbar.contains(event.target)) {
			event.preventDefault();
		}
	});

	document.addEventListener("keydown", async (event) => {
		if (event.repeat) {
			return;
		}

		if (event.code === "Space") {
			if (toolbar.contains(event.target)) {
				event.preventDefault();
			}

			// TODO: handbrake
			return;
		}

		if (event.code === "KeyA") {
			showAboutBox();
			return;
		}

		const checkbox = checkboxesByKeyCode[event.code];

		if (checkbox != null && !checkbox.disabled) {
			checkbox.checked = !checkbox.checked;
			updateSettings();
		}
	});

	const location = data.locations.spawn;
	// const location = data.locations.looking_at_monolith;
	// const location = data.locations.credits;
	// const location = data.locations.poolside;
	// const location = data.locations.spikes;
	Controls.goto(location);

	updateSettings();
	window.onresize = resize;
	resize();

	const drawBackground = regl({
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
			showSpotlight: regl.prop("showSpotlight"),
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
			creditColor3: [0.19, 0.09, 0.17 /* 0.06, 0.03, 0.06 */],
			creditColor4: [0.94, 0.52, 0.12],
		},
	});

	const dimensions = { width: 1, height: 1 };
	let lastFrameTime = -1;
	const start = Date.now();
	const raf = regl.frame(({ viewportWidth, viewportHeight, time, tick }) => {
		if (
			dimensions.width !== viewportWidth ||
			dimensions.height !== viewportHeight
		) {
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

		const deltaTime = time - lastFrameTime;
		if (settings.limitDrawSpeed && deltaTime < 1 / data.targetFPS) {
			return;
		}
		lastFrameTime = time;

		try {
			Controls.update(settings, terrain.clampAltitude, deltaTime);
		} catch (error) {
			raf.cancel();
			throw error;
		}
		const textures = settings.hiResTextures ? hiResTexturePack : texturePack;
		Object.assign(renderProperties, textures);
		renderProperties.currentQuadID = terrain.currentQuadID;
		renderProperties.time = (Date.now() - start) / 1000;

		renderProperties.showSpotlight = settings.birdsEyeView ? 1 : 0;
		renderProperties.lightingCutoff = settings.lightingCutoff ? 1 : 0;
		renderProperties.fogFar = data.fogFar * (settings.lightingCutoff ? 1 : 3);
		renderProperties.quadBorder = settings.showQuadEdges ? 0.02 : 0;
		renderProperties.showSindogs = settings.showSindogs ? 1 : 0;

		try {
			if (!settings.birdsEyeView) {
				drawBackground(renderProperties);
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
};
