import makeTerrain from "./terrain.js";

const loadJS = (src) =>
	new Promise((resolve, reject) => {
		const tag = document.createElement("script");
		tag.onload = resolve;
		tag.onerror = reject;
		tag.src = src;
		document.body.appendChild(tag);
	});

const canvas = document.querySelector("canvas");
document.addEventListener("touchmove", (e) => e.preventDefault(), {
	passive: false,
});

document.body.onload = async () => {
	await Promise.all([loadJS("lib/regl.js"), loadJS("lib/gl-matrix.js")]);
	const regl = createREGL({ canvas, attributes: { antialias: false } });
	const { mat4, vec3 } = glMatrix;

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
				return regl.texture({ data: image, flipY: true });
			})
		);

	const resolution = 0.25;
	const fov = 26;

	const resize = () => {
		canvas.width = Math.ceil(
			canvas.clientWidth * window.devicePixelRatio * resolution
		);
		canvas.height = Math.ceil(
			canvas.clientHeight * window.devicePixelRatio * resolution
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

	const camera = mat4.create();
	const transform = mat4.create();

	const updateAirplane = (time, deltaTime) => {
		mat4.identity(transform);
		mat4.rotateX(transform, transform, Math.PI / 2);

		// mat4.translate(transform, transform, vec3.fromValues(0, -500, 72));
		// mat4.rotateZ(transform, transform, time * 0.25);
		// mat4.translate(transform, transform, vec3.fromValues(-1000, -1000, 0));

		mat4.translate(transform, transform, vec3.fromValues(0, 0, 72));
		mat4.rotateZ(transform, transform, time * 0.25);
		mat4.translate(transform, transform, vec3.fromValues(-1000, -1000, 0));

		// mat4.rotateX(transform, transform, Math.PI * 0.5);
		// mat4.translate(transform, transform, vec3.fromValues(0, 0, 5000));
		// mat4.translate(transform, transform, vec3.fromValues(-1000, -1000, 0));
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
				float y = (uv.y - 0.5) * 480. / textureHeight;
				vec3 color = vec3(0.0);
				if (y > 0.0) {
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
			textureHeight: horizonTexture.height,
			tex: horizonTexture,
		},

		depth: { enable: false },
	});

	const terrain = makeTerrain(data);

	const drawTerrain = regl({
		vert: `
			precision mediump float;

			uniform float time;
			uniform mat4 camera, transform;

			attribute vec3 aPosition;
			attribute float aBrightness;

			varying vec2 vUV;
			varying float vBrightness;
			varying float vFogDepth;
			varying float vWhichTexture;

			void main() {
				vBrightness = aBrightness;
				vWhichTexture = 0.0;
				vUV = 0.5 * (aPosition.xy + 1.0);
				vec4 position = vec4(aPosition, 1);
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
			uniform float textureHeight;
			uniform float terrainScale;
			uniform vec3 fogColor;
			uniform float fogNear;
			uniform float fogFar;

			varying vec2 vUV;
			varying float vBrightness;
			varying float vFogDepth;
			varying float vWhichTexture;

			void main() {

				if (vWhichTexture == 0.0) {
					gl_FragColor = texture2D(moonscapeTexture, fract(vUV / terrainScale));
				}
				if (vWhichTexture == 1.0) {
					gl_FragColor = texture2D(platformTexture, fract(vUV / terrainScale));
				}
				if (vWhichTexture == 2.0) {
					gl_FragColor = texture2D(creditsTexture, fract(vUV / terrainScale));
				}

				gl_FragColor.rgb *= vBrightness;

				float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
				// gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
			}
		`,

		attributes: terrain.attributes,
		count: terrain.numVertices,

		uniforms: {
			time: regl.context("time"),
			tick: regl.context("tick"),
			camera: regl.prop("camera"),
			transform: regl.prop("transform"),
			terrainScale: terrain.scale,
			fogColor: [0, 0, 0],
			fogNear: 1,
			fogFar: 1000,
			moonscapeTexture,
			platformTexture,
			creditsTexture,
		},
	});

	const dimensions = { width: 1, height: 1 };
	let lastFrameTime = -1;
	const tick = regl.frame(({ viewportWidth, viewportHeight, time, tick }) => {
		if (
			dimensions.width !== viewportWidth ||
			dimensions.height !== viewportHeight
		) {
			dimensions.width = viewportWidth;
			dimensions.height = viewportHeight;
			const aspectRatio = viewportWidth / viewportHeight;
			mat4.perspective(
				camera,
				(Math.PI / 180) * fov,
				aspectRatio,
				0.1,
				1000000
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
			drawTerrain({ camera, transform });
		} catch {
			tick.cancel();
		}
	});
};
