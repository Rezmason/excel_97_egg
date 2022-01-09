import makeTerrain from "./terrain.js";
import Controls from "./controls.js";

const canvas = document.querySelector("canvas");
document.addEventListener("touchmove", (e) => e.preventDefault(), {
	passive: false,
});
const { transform, position } = Controls;

document.body.onload = async () => {
	const regl = createREGL({
		canvas,
		attributes: { antialias: false },
		optionalExtensions: ["OES_standard_derivatives"],
	});
	const { mat4 } = glMatrix;

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
				const hiRezParams = entry.hi_rez
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
	let spotlight = 0.0;
	let clipping = 1.0;
	let smooth = false;
	let resolution = data.resolution;
	let reduceResolution = true;
	let revealQuads = false;
	let useHiRezTextures = false;

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
					spotlight = Controls.birdsEyeView ? 1 : 0;
					resolution =
						Controls.birdsEyeView || !reduceResolution ? 1 : data.resolution;
					resize();
					break;
				}
				case "KeyC": {
					clipping = 1.0 - clipping;
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
					revealQuads = !revealQuads;
					break;
				}
				case "KeyT": {
					if (hiRezTexturePack == null) {
						console.log("loading");
						hiRezTexturePack = await loadTexturePack(data.texture_packs.hi_rez);
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

			uniform float time;
			uniform mat4 camera, transform;
			uniform vec3 airplanePosition;
			uniform float terrainSize, maxDrawDistance;
			uniform float currentQuadID;
			uniform float spotlight, clipping;
			uniform float fogNear, fogFar;

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

			uniform float tick, time;
			uniform sampler2D moonscapeTexture;
			uniform sampler2D platformTexture;
			uniform sampler2D creditsTexture;
			uniform float quadScale;


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

				if (max(abs(vUV.x - 0.5), abs(vUV.y - 0.5)) * 2.0 > quadScale) {
					gl_FragColor = vec4(1.0, 0.0, 0.5, 1.0);
				} else if (whichTexture == 0) {
					gl_FragColor = texture2D(moonscapeTexture, vUV);
				} else if (whichTexture == 1) {
					gl_FragColor = texture2D(platformTexture, vUV);
				} else if (whichTexture == 2) {
					vec4 credits = texture2D(creditsTexture, vec2(1.0) - vec2(vUV.x, fract(time * -0.006 + vUV.y * 0.03 - 0.03)));
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
				gl_FragColor.rg += vSpotlight;
			}
		`,

		attributes: terrain.attributes,
		count: terrain.numVertices,

		uniforms: {
			time: regl.context("time"),
			tick: regl.context("tick"),
			camera: regl.prop("camera"),
			airplanePosition: regl.prop("position"),
			terrainSize: data.size,
			maxDrawDistance: data.maxDrawDistance,
			transform: regl.prop("transform"),
			currentQuadID: regl.prop("currentQuadID"),
			spotlight: regl.prop("spotlight"),
			clipping: regl.prop("clipping"),
			quadScale: regl.prop("quadScale"),
			fogNear: data.fogNear,
			fogFar: data.fogFar,
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
				10000
			);
		}

		const deltaTime = time - lastFrameTime;
		if (!smooth && deltaTime < 1 / data.targetFPS) {
			return;
		}
		lastFrameTime = time;

		Controls.update(terrain.clampAltitude, deltaTime, smooth);
		const { pitch, rollMat } = Controls;
		const textures = useHiRezTextures ? hiRezTexturePack : texturePack;
		const horizonTexture = textures.horizonTexture;

		try {
			if (!Controls.birdsEyeView) {
				drawBackground({ camera, transform, pitch, rollMat, horizonTexture });
			}
			drawTerrain({
				camera,
				transform,
				position,
				currentQuadID: terrain.currentQuadID,
				spotlight,
				clipping,
				quadScale: revealQuads ? 0.95 : 1.0,
				...textures,
			});
		} catch (error) {
			raf.cancel();
			throw error;
		}
	});
};
