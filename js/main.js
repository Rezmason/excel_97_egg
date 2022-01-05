import makeTerrain from "./terrain.js";

const canvas = document.querySelector("canvas");
document.addEventListener("touchmove", (e) => e.preventDefault(), {
	passive: false,
});

document.body.onload = async () => {
	const regl = createREGL({ canvas, attributes: { antialias: false } });
	const { mat4, vec3, quat } = glMatrix;

	const data = await fetch("assets/data.json").then((response) =>
		response.json()
	);

	const [horizonTexture, moonscapeTexture, platformTexture, creditsTexture] =
		await Promise.all(
			[
				"horizon_screenshot",
				"moonscape_brighter",
				"platform_screenshot",
				"credits_rm",
			].map(async (url) => {
				const image = new Image();
				image.crossOrigin = "anonymous";
				image.src = `assets/textures/${url}.png`;
				await image.decode();
				document.body.appendChild(image);
				return regl.texture({ data: image, flipY: false });
			})
		);

	const resize = () => {
		canvas.width = Math.ceil(
			canvas.clientWidth * window.devicePixelRatio * data.resolution
		);
		canvas.height = Math.ceil(
			canvas.clientHeight * window.devicePixelRatio * data.resolution
		);
	};
	window.onresize = resize;
	resize();

	if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
		document.addEventListener("keydown", (event) => {
			if (event.repeat) {
				return;
			}
			if (event.code === "KeyF") {
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
			}
		});
	}

	const terrain = makeTerrain(data);

	const camera = mat4.create();
	const transform = mat4.create();

	const location = data.locations.spawn;
	// const location = data.locations.looking_at_monolith;
	// const location = data.locations.credits;
	// const location = data.locations.poolside;
	// const location = data.locations.spikes;

	const position = vec3.fromValues(...location.position);

	const euler = vec3.create();
	const rotQuat = quat.create();
	vec3.set(
		euler,
		location.rotation[0],
		location.rotation[1],
		location.rotation[2]
	);
	quat.fromEuler(rotQuat, ...euler, "xzy");

	const updateAirplane = (time, deltaTime) => {
		// position[0] -= deltaTime * 300;
		// position[1] -= deltaTime * 300;

		located: {
			mat4.fromQuat(transform, rotQuat);
			mat4.rotateX(transform, transform, Math.PI / 2);
			mat4.translate(transform, transform, position);
		}

		topDown: {
			// mat4.identity(transform);
			// mat4.rotateX(transform, transform, Math.PI);
			// mat4.rotateZ(transform, transform, Math.PI);
			// mat4.translate(transform, transform, vec3.fromValues(0, 0, 5000));
			// mat4.translate(transform, transform, vec3.fromValues(...position));
			// mat4.rotateX(transform, transform, Math.PI * 0.2 );
		}
	};

	const drawBackground = regl({
		vert: `
			precision mediump float;

			attribute vec2 aPosition;

			varying vec2 vUV;

			void main() {
				vUV = 0.5 * (aPosition + 1.0);
				gl_Position = vec4(aPosition, 0, 1);
			}
		`,

		frag: `
			precision mediump float;

			uniform sampler2D tex;
			uniform float textureHeight;

			varying vec2 vUV;

			void main() {
				vec2 uv = vUV;
				// TODO: apply tilt to UV
				float y = (0.5 - uv.y) * 480. / textureHeight + 1.0;
				vec3 color = vec3(0.0);
				if (y < 1.0) {
					color = texture2D(tex, vec2(uv.x, y)).rgb;
				}
				gl_FragColor = vec4(color, 1.0);
			}
		`,

		attributes: {
			aPosition: [-4, -4, 4, -4, 0, 4],
		},
		count: 3,

		uniforms: {
			tex: horizonTexture,
			textureHeight: horizonTexture.height,
		},

		depth: { enable: false },
	});

	const drawTerrain = regl({
		vert: `
			precision mediump float;

			#define TWO_PI 6.2831853072

			uniform float time;
			uniform mat4 camera, transform;
			uniform vec3 position;
			uniform float terrainSize, maxDrawDistance;

			attribute vec2 aCentroid;
			attribute vec3 aPosition;
			attribute float aWhichTexture;
			attribute vec2 aUV;
			attribute float aBrightness;
			attribute float aWaveAmplitude, aWavePhase;

			varying float vWhichTexture;
			varying vec2 vUV;
			varying float vBrightness;
			varying float vFogDepth;

			void main() {
				vWhichTexture = aWhichTexture;
				vUV = aUV + 0.5;

				vec2 centroid = aCentroid;
				centroid = (fract((centroid + position.xy) / terrainSize + 0.5) - 0.5) * terrainSize - position.xy;

				vec2 diff = -abs(centroid + position.xy) + maxDrawDistance;
				if (diff.x < 0.0 || diff.y < 0.0) {
					return;
				}

				vec4 position = vec4(
					aPosition
					// * 0.95 // shrink the quads to help differentiate them
					+ vec3(centroid, 0.0),
					1
				);
				float wave = aWaveAmplitude * -10.0 * sin((time * 1.75 + aWavePhase) * TWO_PI);
				position.z += wave;
				vBrightness = aBrightness + wave * 0.08;
				position = transform * position;
				vFogDepth = -position.z;
				position = camera * position;
				gl_Position = position;
			}
		`,

		frag: `
			precision mediump float;

			uniform float tick, time;
			uniform sampler2D moonscapeTexture;
			uniform sampler2D platformTexture;
			uniform sampler2D creditsTexture;
			uniform vec3 fogColor;
			uniform float fogNear;
			uniform float fogFar;

			uniform vec3 creditColor1;
			uniform vec3 creditColor2;
			uniform vec3 creditColor3;
			uniform vec3 creditColor4;

			varying float vWhichTexture;
			varying vec2 vUV;
			varying float vBrightness;
			varying float vFogDepth;

			void main() {

				int whichTexture = int(vWhichTexture);

				if (whichTexture == 0) {
					gl_FragColor = texture2D(moonscapeTexture, vUV);
				}
				if (whichTexture == 1) {
					gl_FragColor = texture2D(platformTexture, vUV);
				}
				if (whichTexture == 2) {
					vec4 credits = texture2D(creditsTexture, vec2(1.0) - vec2(vUV.x, fract(time * -0.006 + vUV.y * 0.03 - 0.03)));
					vec3 creditColor = vec3(0.0);
					if (credits.b == 1.0) {
						creditColor = mix(creditColor2, creditColor1, abs(vUV.y - 0.5) * 2.0);
					} else if (credits.g == 1.0) {
						creditColor = mix(creditColor4, creditColor3, abs(vUV.y - 0.5) * 2.0);
					}
					gl_FragColor = vec4(creditColor, 1.0);
				}

				gl_FragColor.rgb *= vBrightness;

				float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
				gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
			}
		`,

		attributes: terrain.attributes,
		count: terrain.numVertices,

		uniforms: {
			time: regl.context("time"),
			tick: regl.context("tick"),
			camera: regl.prop("camera"),
			position: regl.prop("position"),
			terrainSize: data.size,
			maxDrawDistance: data.maxDrawDistance,
			transform: regl.prop("transform"),
			fogColor: [0, 0, 0],
			fogNear: 1,
			fogFar: data.maxFog,
			moonscapeTexture,
			platformTexture,
			creditsTexture,

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
		if (deltaTime < 1 / data.targetFPS) {
			return;
		}
		lastFrameTime = time;

		try {
			updateAirplane(time, deltaTime);
			drawBackground({ camera, transform });
			drawTerrain({ camera, transform, position });
		} catch (error) {
			raf.cancel();
			throw error;
		}
	});
};
