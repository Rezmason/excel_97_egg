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
			updateToggles();
		}
	});

	const toolbar = document.querySelector("toolbar");
	toolbar.addEventListener("click", (event) => {
		if (event.target.tagName.toLowerCase() === "input") {
			updateToggles();
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
	const updateToggles = async () => {
		const toggles = Object.fromEntries(
			Array.from(new FormData(form).keys()).map((key) => [key, true])
		);

		if (toggles.hi_res && hiRezTexturePack == null) {
			hiRezTexturePack = await loadTexturePack(data.texture_packs.hi_res);
		}

		if (toggles.fullscreen) {
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

		Controls.birdsEyeView = toggles.birdseye;
		renderProperties.spotlight = toggles.birdseye ? 1 : 0;

		renderProperties.cutoff = toggles.cutoff ? 1 : 0;
		renderProperties.fogFar = data.fogFar * (toggles.cutoff ? 1 : 3);
		smooth = !toggles.smooth;
		reduceResolution = toggles.resolution;
		showQuads = toggles.quads;
		renderProperties.quadBorder = showQuads ? 0.02 : 0;
		sindogs = toggles.sindogs;
		renderProperties.sindogs = sindogs ? 1 : 0;
		useHiRezTextures = toggles.hi_res;

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

	const loadTexturePack = async (pack) => {
		const textures = await Promise.all(
			Object.values(pack).map(async (entry) => {
				const image = new Image();
				image.crossOrigin = "anonymous";
				image.src = entry.url;
				await image.decode();
				const isNPOT =
					Math.log2(image.width) % 1 > 0 || Math.log2(image.height) % 1 > 0;
				const hiRezParams = entry.hi_res
					? {
							mipmap: !isNPOT,
							anisotropic: 12,
							min: isNPOT ? "linear" : "mipmap",
							mag: "linear",
					  }
					: {};
				return regl.texture({ data: image, ...hiRezParams });
			})
		);
		return Object.fromEntries(
			Object.keys(pack).map((key, index) => [key, textures[index]])
		);
	};

	const texturePack = await loadTexturePack(data.texture_packs.standard);

	let hiRezTexturePack = null;

	Controls.attach(canvas);
	const terrain = makeTerrain(data);
	const camera = mat4.create();
	let smooth = false;
	let resolution = data.resolution;
	let reduceResolution = true;
	let showQuads = false;
	let sindogs = false;
	let useHiRezTextures = false;

	const { transform, position, rotation, rollMat } = Controls;

	const renderProperties = {
		camera,
		rollMat,
		transform,
		position,
		rotation,
		repeatOffset: vec2.create(),
		spotlight: 0,
		cutoff: 1,
		quadBorder: 0,
		sindogs: 0,
		fogFar: data.fogFar,
	};

	const resize = () => {
		let scaleFactor = window.devicePixelRatio;
		if (reduceResolution) {
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
	window.onresize = resize;
	resize();

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
			updateToggles();
		}
	});

	const location = data.locations.spawn;
	// const location = data.locations.looking_at_monolith;
	// const location = data.locations.credits;
	// const location = data.locations.poolside;
	// const location = data.locations.spikes;

	Controls.goto(location);

	updateToggles();

	const drawBackground = regl({
		vert: `
			precision mediump float;

			uniform vec3 rotation;
			uniform mat2 rollMat;

			attribute vec2 aPosition;

			varying vec2 vUV;

			void main() {
				vUV = 0.5 * (aPosition + 1.0);
				vUV.y += rotation.x * -0.04;
				vUV = rollMat * (vUV - 0.5) + 0.5;
				gl_Position = vec4(aPosition, 0, 1);
			}
		`,

		frag: `
			#define PI 3.14159265359
			precision mediump float;

			uniform sampler2D horizonTexture;
			uniform float horizonHeight;
			uniform vec3 rotation;
			uniform float sindogs;

			varying vec2 vUV;

			void main() {
				vec2 uv = vUV;
				float y = (0.5 - uv.y) * 480. / horizonHeight + 1.0;
				vec3 color = vec3(0.0);
				if (y < 1.0) {
					float brightness = 1.0;
					if (sindogs == 1.0) {
						brightness += (sin((rotation.y + uv.x * 2.0 * 26.0) * PI / 180.0 * 15.0) - (uv.y) + 1.0) * 0.5;
					}
					color = texture2D(horizonTexture, vec2(uv.x, y)).rgb * brightness;
				}

				gl_FragColor = vec4(color, 1.0);
			}
		`,

		attributes: {
			aPosition: [-4, -4, 4, -4, 0, 4],
		},
		count: 3,

		uniforms: {
			horizonTexture: regl.prop("horizonTexture"),
			horizonHeight: texturePack.horizonTexture.height,
			sindogs: regl.prop("sindogs"),
			rotation: regl.prop("rotation"),
			rollMat: regl.prop("rollMat"),
		},

		depth: { enable: false },
	});

	const drawTerrain = regl({
		vert: `
			precision mediump float;

			#define TWO_PI 6.2831853072

			uniform highp float time;
			uniform mat4 camera, transform;
			uniform vec3 airplanePosition;
			uniform float terrainSize, maxDrawDistance;
			uniform float currentQuadID;
			uniform float spotlight, cutoff;
			uniform float fogNear, fogFar;
			uniform vec2 repeatOffset;

			attribute float aQuadID;
			attribute vec2 aCentroid;
			attribute vec3 aPosition;
			attribute float aWhichTexture;
			attribute vec2 aUV;
			attribute float aBrightness;
			attribute float aWaveAmplitude, aWavePhase;

			varying float vWhichTexture;
			varying vec2 vUV;
			varying float vFogFactor, vBrightness, vSpotlight;

			void main() {
				vWhichTexture = aWhichTexture;
				vUV = aUV + 0.5;

				vec2 centroid = (fract((aCentroid + airplanePosition.xy) / terrainSize + 0.5) - 0.5) * terrainSize - airplanePosition.xy;

				centroid += terrainSize * repeatOffset;

				vec2 diff = maxDrawDistance - abs(centroid + airplanePosition.xy);
				if (cutoff == 1.0 && (diff.x < 0.0 || diff.y < 0.0)) {
					return;
				}

				vec4 position = vec4(aPosition + vec3(centroid, 0.0), 1);
				float wave = aWaveAmplitude * -10.0 * sin((time * 1.75 + aWavePhase) * TWO_PI);
				position.z += wave;

				vSpotlight = spotlight * 0.5 - length(abs(centroid + airplanePosition.xy)) * 0.0025;
				if (aQuadID == currentQuadID) {
					vSpotlight = spotlight;
				}
				vSpotlight = clamp(vSpotlight, 0.0, spotlight);
				if (repeatOffset.x != 0.0 || repeatOffset.y != 0.0) {
					vSpotlight = 0.0;
				}

				position = transform * position;

				vBrightness = aBrightness + wave * 0.08;
				float fogDepth = -position.z;
				float fogFactor = smoothstep( fogNear, fogFar, fogDepth );
				vFogFactor = fogFactor;
				// vBrightness *= (1.0 - fogFactor);
				vBrightness = pow(vBrightness, (1.0 + fogFactor * 2.0)) * (1.0 - fogFactor);

				position = camera * position;
				gl_Position = position;
			}
		`,

		frag: `
			#ifdef GL_OES_standard_derivatives
			#extension GL_OES_standard_derivatives: enable
			#endif

			precision mediump float;

			uniform highp float tick, time;
			uniform sampler2D moonscapeTexture;
			uniform sampler2D platformTexture;
			uniform sampler2D creditsTexture;
			uniform float quadBorder;


			uniform vec3 creditColor1;
			uniform vec3 creditColor2;
			uniform vec3 creditColor3;
			uniform vec3 creditColor4;

			varying float vWhichTexture;
			varying vec2 vUV;
			varying float vFogFactor, vBrightness, vSpotlight;

			void main() {

				int whichTexture = int(vWhichTexture);

				float borderDistance = 1.0 - max(abs(vUV.x - 0.5), abs(vUV.y - 0.5)) * 2.0;

				if (whichTexture == 0) {
					gl_FragColor = texture2D(moonscapeTexture, vUV);
				} else if (whichTexture == 1) {
					gl_FragColor = texture2D(platformTexture, vUV);
				} else if (whichTexture == 2) {
					highp vec2 uv = vUV;
					uv.y = fract(time * -0.006 + uv.y * 0.03 - 0.0225);

					uv.y *= 0.92;
					uv.y += 0.076;

					uv.y *= 5.0;
					uv.x = uv.x / 5.0 + (1.0 - 1.0 / 5.0);
					uv.x += 1.0 / 5.0 * (1.0 + floor(uv.y));

					uv = vec2(1.0) - uv;
					vec4 credits = texture2D(creditsTexture, fract(uv));
					vec3 creditColor = vec3(0.0);
					float amount = 0.0;
					if (credits.b > 0.0 && credits.b > credits.g) {
						amount = credits.b;
						creditColor = mix(creditColor2, creditColor1, abs(vUV.y - 0.5) * 2.0);
					} else if (credits.g > 0.0) {
						amount = credits.g;
						creditColor = mix(creditColor4, creditColor3, abs(vUV.y - 0.5) * 2.0);
					}

					float radius = 0.4;
					amount = clamp(smoothstep(radius - fwidth(amount), radius, amount), 0.0, 1.0);

					gl_FragColor = vec4(amount * creditColor, 1.0);
				}

				gl_FragColor.rgb *= vBrightness;
				if (quadBorder == 0.0) {
					gl_FragColor.rg += vSpotlight;
				}

				if (vSpotlight == 1.0 && borderDistance - quadBorder * 3.0 < 0.0) {
					gl_FragColor = mix(
						vec4(1.0, 1.0, 0.0, 1.0),
						gl_FragColor,
						smoothstep(quadBorder - 0.02, quadBorder, borderDistance - quadBorder * 3.0)
					);
				} else {
					vec4 borderColor = mix(
						vec4(1.0, 0.0, 0.5, 1.0),
						vec4(1.0, 0.5, 0.0, 1.0),
						vFogFactor
					);
					gl_FragColor = mix(
						borderColor,
						gl_FragColor,
						smoothstep(quadBorder * 0.5, quadBorder, borderDistance - quadBorder)
					);
				}

			}
		`,

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
			spotlight: regl.prop("spotlight"),
			cutoff: regl.prop("cutoff"),
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
		if (!smooth && deltaTime < 1 / data.targetFPS) {
			return;
		}
		lastFrameTime = time;

		try {
			Controls.update(terrain.clampAltitude, deltaTime, smooth);
		} catch (error) {
			raf.cancel();
			throw error;
		}
		const textures = useHiRezTextures ? hiRezTexturePack : texturePack;
		Object.assign(renderProperties, textures);
		renderProperties.currentQuadID = terrain.currentQuadID;
		renderProperties.time = (Date.now() - start) / 1000;

		try {
			if (!Controls.birdsEyeView) {
				drawBackground(renderProperties);
			}

			if (renderProperties.cutoff == 0) {
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
