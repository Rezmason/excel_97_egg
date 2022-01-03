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

	const fov = 26;
	const renderScale = 0.125;
	const maxDrawDistance = 1000;

	const resize = () => {
		canvas.width = Math.ceil(
			canvas.clientWidth * window.devicePixelRatio * renderScale
		);
		canvas.height = Math.ceil(
			canvas.clientHeight * window.devicePixelRatio * renderScale
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
		mat4.translate(transform, transform, vec3.fromValues(0, 0, -6));
		mat4.rotateY(transform, transform, time * 4);
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
			varying vec2 vUV;
			uniform sampler2D tex;
			uniform float textureHeight;
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

	const drawTerrain = regl({
		vert: `
			precision mediump float;
			uniform float time;
			attribute vec2 aPosition;
			varying vec2 vUV;
			uniform mat4 camera, transform;
			void main() {
				vUV = 0.5 * (aPosition + 1.0);
				vec4 position = vec4(aPosition, 0, 1);
				position = transform * position;
				position = camera * position;
				gl_Position = position;
			}
		`,

		frag: `
			precision mediump float;
			varying vec2 vUV;
			uniform float tick, time;
			uniform sampler2D moonscapeTexture;
			uniform sampler2D platformTexture;
			uniform sampler2D creditsTexture;
			uniform float textureHeight;
			void main() {
				gl_FragColor = texture2D(moonscapeTexture, fract(vUV));
			}
		`,

		attributes: {
			aPosition: [
				[-1, -Math.sqrt(3) / 2],
				[1, -Math.sqrt(3) / 2],
				[0, Math.sqrt(3) / 2],
			],
		},
		count: 3,

		uniforms: {
			time: regl.context("time"),
			tick: regl.context("tick"),
			camera: regl.prop("camera"),
			transform: regl.prop("transform"),
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
				maxDrawDistance
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
