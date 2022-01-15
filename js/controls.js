import Model from "./model.js";
import GUI from "./gui.js";
const { mat2, mat4, vec2, vec3, quat } = glMatrix;

const coarseModifier = (value, granularity = 1000) =>
	Math.round(value * granularity) / granularity;

const smoothModifier = (value) => value;

const degreesToRadians = Math.PI / 180;

const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

const lerp = (a, b, t) => a + t * (b - a);

export default (async () => {
	const canvas = document.querySelector("canvas");

	const mouseJoystick = vec2.create();
	const goalMouseJoystick = vec2.create();
	const viewportSize = vec2.create();
	const transform = mat4.create();
	const position = vec3.create();
	const rotation = vec3.create();
	const rollMat = mat2.create();
	const touchStartRotation = vec3.create();
	const rotQuat = quat.create();
	const touchStart = vec2.create();
	let mouseButtonDown = null;
	let forwardSpeed = 0;
	let modifier = coarseModifier;
	let braking = false;
	let useMouseJoystick = false;

	const { data, terrain } = await Model;
	const { settings } = await GUI;

	const forwardAcceleration = 400;
	const maxForwardSpeed = 1000;
	const turnSpeed = 0.125;

	document.addEventListener("keydown", async (event) => {
		if (event.repeat) {
			return;
		}

		if (event.code === "Space") {
			braking = true;
			goalMouseJoystick[0] = 0;
		}
	});

	document.addEventListener("keyup", async (event) => {
		if (event.code === "Space") {
			braking = false;
		}
	});

	canvas.addEventListener("contextmenu", (event) => event.preventDefault());
	canvas.addEventListener("dblclick", (event) => event.preventDefault());
	canvas.addEventListener("mousemove", (event) => {
		event.preventDefault();
		if (braking) {
			return;
		}
		useMouseJoystick = true;
		vec2.set(
			goalMouseJoystick,
			event.pageX - viewportSize[0] / 2,
			event.pageY - viewportSize[1] / 2
		);
	});

	canvas.addEventListener("mousedown", (event) => {
		event.preventDefault();
		mouseButtonDown = event.button === 0 ? "primary" : "secondary";
	});

	canvas.addEventListener("mouseup", (event) => {
		event.preventDefault();
		mouseButtonDown = null;
	});

	canvas.addEventListener("mouseleave", (event) => {
		if (!braking) {
			vec2.set(goalMouseJoystick, 0, 0);
		}
	});

	canvas.addEventListener("touchstart", (event) => {
		event.preventDefault();
		let { pageX, pageY } = event.touches.item(0);
		const maxViewportDimension = Math.max(...viewportSize);
		pageX /= maxViewportDimension;
		pageY /= maxViewportDimension;
		useMouseJoystick = false;
		vec2.set(touchStart, pageX, pageY);
		vec3.set(touchStartRotation, ...rotation);

		if (event.touches.length > 1) {
			handleSecondTouch(event.touches.item(1));
		}
	});

	canvas.addEventListener("touchmove", (event) => {
		event.preventDefault();
		let { pageX, pageY } = event.touches.item(0);
		const maxViewportDimension = Math.max(...viewportSize);
		pageX /= maxViewportDimension;
		pageY /= maxViewportDimension;
		const pitch = clamp(
			modifier(touchStartRotation[0] + (pageY - touchStart[1]) * -100),
			-9,
			18
		);
		const roll = 0;
		const flipYaw = settings.birdsEyeView ? -1 : 1;
		const yaw =
			touchStartRotation[1] + modifier(pageX - touchStart[0]) * -100 * flipYaw;
		vec3.set(rotation, pitch, yaw, roll);
		if (event.touches.length > 1) {
			handleSecondTouch(event.touches.item(1));
		}
	});

	canvas.addEventListener("touchend", (event) => {
		event.preventDefault();
		if (event.touches.length < 2) {
			mouseButtonDown = null;
			braking = false;
		}
	});

	const resize = () =>
		vec2.set(viewportSize, window.innerWidth, window.innerHeight);

	window.addEventListener("resize", (event) => resize());

	const handleSecondTouch = (touch) => {
		const verticalFraction = touch.pageY / viewportSize[1] - 0.5;
		braking = false;
		if (verticalFraction < -1 / 6) {
			mouseButtonDown = "primary";
		} else if (verticalFraction > 1 / 6) {
			mouseButtonDown = "secondary";
		} else {
			mouseButtonDown = null;
			braking = true;
		}
	};

	const updateTransform = () => {
		if (settings.birdsEyeView) {
			mat4.identity(transform);
			mat4.rotateX(transform, transform, Math.PI);
			mat4.translate(transform, transform, vec3.fromValues(0, 0, 2000 / 26));
			mat4.scale(transform, transform, vec3.fromValues(0.03, 0.03, 0.03));
			mat4.rotateX(transform, transform, -Math.PI * 0.375);
			mat4.rotateZ(transform, transform, degreesToRadians * -rotation[1]);
			mat4.translate(
				transform,
				transform,
				vec3.fromValues(position[0], position[1], -80)
			);
		} else {
			quat.fromEuler(rotQuat, ...rotation, "xzy");
			mat4.fromQuat(transform, rotQuat);
			mat4.rotateX(transform, transform, Math.PI / 2);
			mat4.translate(transform, transform, position);
		}
	};

	const updateForwardSpeed = (deltaTime) => {
		const lastForwardSpeed = forwardSpeed;

		if (braking) {
			forwardSpeed = lerp(forwardSpeed, 0, clamp(deltaTime * 5, 0, 1));
		} else if (mouseButtonDown != null) {
			const direction = mouseButtonDown === "primary" ? -1 : 1;
			forwardSpeed += deltaTime * forwardAcceleration * direction;
		}

		forwardSpeed = modifier(forwardSpeed, 10);
		forwardSpeed = clamp(forwardSpeed, -maxForwardSpeed, maxForwardSpeed);

		// When rapidly accelerating or decelerating, this guarantees
		// that at some point the forward speed is zero
		if (lastForwardSpeed != 0 && lastForwardSpeed < 0 != forwardSpeed < 0) {
			forwardSpeed = 0;
		}

		// Rounds any forward speed near zero to zero
		if (Math.abs(forwardSpeed) < 5) {
			forwardSpeed = 0;
		}
	};

	const updateRotation = (deltaTime) => {
		vec2.lerp(
			mouseJoystick,
			mouseJoystick,
			goalMouseJoystick,
			clamp(0.5 + deltaTime, 0, 1)
		);

		if (useMouseJoystick) {
			const pitch = clamp(modifier(-mouseJoystick[1] * 0.025), -9, 9);
			const roll = modifier(turnSpeed * mouseJoystick[0]) * 0.2375;
			const yaw =
				rotation[1] + deltaTime * modifier(turnSpeed * mouseJoystick[0]);
			vec3.set(rotation, pitch, yaw, roll);
		}

		mat2.fromRotation(rollMat, -rotation[2] * degreesToRadians * 1.5);
	};

	const updatePosition = (deltaTime, smoothMotion) => {
		modifier = smoothMotion ? smoothModifier : coarseModifier;
		const pitchRad = degreesToRadians * rotation[0];
		const yawRad = degreesToRadians * rotation[1];

		const displacement = vec3.fromValues(
			Math.sin(yawRad) * Math.cos(pitchRad),
			Math.cos(yawRad) * Math.cos(pitchRad) * -1,
			Math.sin(pitchRad)
		);
		vec3.scale(displacement, displacement, deltaTime * forwardSpeed);
		vec3.add(position, position, displacement);
	};

	const limitAltitude = (deltaTime) => {
		const altitude = position[2];
		const quad = terrain.getQuadAt(...position);
		const clampedAltitude = Math.max(
			quad.altitude + data.minHeightOffGround,
			Math.min(data.maxAltitude, position[2])
		);
		position[2] = lerp(
			position[2],
			clampedAltitude,
			clamp(0.4 + deltaTime * 4, 0, 1)
		);
	};

	const update = (deltaTime) => {
		updateRotation(deltaTime);
		updatePosition(deltaTime);
		limitAltitude(deltaTime);
		updateForwardSpeed(deltaTime);
		updateTransform();
	};

	const location = data.locations.spawn;
	// const location = data.locations.looking_at_monolith;
	// const location = data.locations.credits;
	// const location = data.locations.poolside;
	// const location = data.locations.spikes;

	vec3.set(position, ...location.position);
	vec3.set(rotation, ...location.rotation, 0);
	resize();

	return {
		update,
		transform,
		position,
		rotation,
		rollMat,
	};
})();
