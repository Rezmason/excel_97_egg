import makeTerrain from "./terrain.js";
import Controls from "./controls.js";

const canvas = document.querySelector("canvas");
document.addEventListener("touchmove", (e) => e.preventDefault(), {
	passive: false,
});

document.body.onload = async () => {
	const regl = createREGL({
		canvas,
		attributes: { antialias: false },
		optionalExtensions: ["OES_standard_derivatives"],
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
							min: isNPOT ? "linear" : "linear",
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
	let useHiRezTextures = false;

	const { transform, position, rollMat } = Controls;

	const renderProperties = {
		camera,
		repeatOffset: vec2.create(),

		spotlight: 0,
		clipping: 1,
		quadBorder: 0,
		fogFar: data.fogFar,
	};

	const resize = () => {
		canvas.width = Math.ceil(
			canvas.clientWidth * window.devicePixelRatio * resolution
		);
		canvas.height = Math.ceil(
			canvas.clientHeight * window.devicePixelRatio * resolution
		);
		Controls.resize();
	};
	window.onresize = resize;
	resize();

	if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
		document.addEventListener("keydown", async (event) => {
			if (event.repeat) {
				return;
			}
			switch (event.code) {
				case "KeyF": {
					if (document.fullscreenEnabled) {
						if (document.fullscreenElement == null) {
							canvas.requestFullscreen();
						} else {
							document.exitFullscreen();
						}
					} else if (document.webkitFullscreenEnabled) {
						if (document.webkitFullscreenElement == null) {
							canvas.webkitRequestFullscreen();
						} else {
							document.webkitExitFullscreen();
						}
					}
					break;
				}
				case "KeyB": {
					Controls.birdsEyeView = !Controls.birdsEyeView;
					renderProperties.spotlight = Controls.birdsEyeView ? 1 : 0;
					resolution =
						Controls.birdsEyeView || !reduceResolution ? 1 : data.resolution;
					resize();
					break;
				}
				case "KeyC": {
					renderProperties.clipping = renderProperties.clipping === 0 ? 1 : 0;
					renderProperties.fogFar =
						data.fogFar * (renderProperties.clipping === 1 ? 1 : 3);
					break;
				}
				case "KeyS": {
					smooth = !smooth;
					break;
				}
				case "KeyR": {
					reduceResolution = !reduceResolution;
					resolution =
						Controls.birdsEyeView || !reduceResolution ? 1 : data.resolution;
					resize();
					break;
				}
				case "KeyQ": {
					showQuads = !showQuads;
					renderProperties.quadBorder = showQuads ? 0.05 : 0;
					break;
				}
				case "KeyT": {
					if (hiRezTexturePack == null) {
						console.log("loading");
						hiRezTexturePack = await loadTexturePack(data.texture_packs.hi_res);
					}
					useHiRezTextures = !useHiRezTextures;
					break;
				}
			}
		});
	}

	const location = data.locations.spawn;
	// const location = data.locations.looking_at_monolith;
	// const location = data.locations.credits;
	// const location = data.locations.poolside;
	// const location = data.locations.spikes;

	Controls.goto(location);

	const drawBackground = regl({
		vert: `
			precision mediump float;

			uniform float pitch;
			uniform mat2 rollMat;

			attribute vec2 aPosition;

			varying vec2 vUV;

			void main() {
				vUV = 0.5 * (aPosition + 1.0);
				vUV.y += pitch * -0.04;
				vUV = rollMat * (vUV - 0.5) + 0.5;
				gl_Position = vec4(aPosition, 0, 1);
			}
		`,

		frag: `
			precision mediump float;

			uniform sampler2D horizonTexture;
			uniform float horizonHeight;

			varying vec2 vUV;

			void main() {
				vec2 uv = vUV;
				float y = (0.5 - uv.y) * 480. / horizonHeight + 1.0;
				vec3 color = vec3(0.0);
				if (y < 1.0) {
					color = texture2D(horizonTexture, vec2(uv.x, y)).rgb;
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
			pitch: regl.prop("pitch"),
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
			uniform float spotlight, clipping;
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
			varying float vBrightness;
			varying float vSpotlight;

			void main() {
				vWhichTexture = aWhichTexture;
				vUV = aUV + 0.5;

				vec2 centroid = (fract((aCentroid + airplanePosition.xy) / terrainSize + 0.5) - 0.5) * terrainSize - airplanePosition.xy;

				centroid += terrainSize * repeatOffset;

				vec2 diff = maxDrawDistance - abs(centroid + airplanePosition.xy);
				if (clipping == 1.0 && (diff.x < 0.0 || diff.y < 0.0)) {
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
			varying float vBrightness;
			varying float vSpotlight;

			void main() {

				int whichTexture = int(vWhichTexture);

				float borderDistance = 1.0 - max(abs(vUV.x - 0.5), abs(vUV.y - 0.5)) * 2.0;

				if (vSpotlight == 1.0 && borderDistance < quadBorder * 3.0) {
					gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0);
					return;
				}
				if (borderDistance < quadBorder) {
					gl_FragColor = vec4(1.0, 0.0, 0.5, 1.0);
					return;
				} else if (whichTexture == 0) {
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
			clipping: regl.prop("clipping"),
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

		Controls.update(terrain.clampAltitude, deltaTime, smooth);
		const textures = useHiRezTextures ? hiRezTexturePack : texturePack;
		Object.assign(renderProperties, textures);
		renderProperties.pitch = Controls.pitch;
		renderProperties.rollMat = rollMat;
		renderProperties.transform = transform;
		renderProperties.position = position;
		renderProperties.currentQuadID = terrain.currentQuadID;
		renderProperties.time = (Date.now() - start) / 1000;

		try {
			if (!Controls.birdsEyeView) {
				drawBackground(renderProperties);
			}

			if (renderProperties.clipping == 0) {
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
