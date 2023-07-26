import Model from "./model.js";
import GUI from "./gui.js";
const { mat4, vec2, vec3, quat } = glMatrix;

const coarseModifier = (value, granularity = 1000) =>
	Math.round(value * granularity) / granularity;

const smoothModifier = (value) => value;

const degreesToRadians = Math.PI / 180;

const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

const lerp = (a, b, t) => a + t * (b - a);

const minReportedPositionTime = 1000;

const wheelDeltaMagnifiers = {
	[0]: 1,
	[1]: 40,
	[2]: 40,
};

export default (async () => {
	const viewscreen = document.querySelector("viewscreen");

	const mouseJoystick = vec2.create();
	const goalMouseJoystick = vec2.create();
	const viewportSize = vec2.create();
	const transform = mat4.create();
	const horizonTransform = mat4.create();
	const position = vec3.create();
	const rotation = vec3.create();
	const touchStartRotation = vec3.create();
	const rotQuat = quat.create();
	const touchStart = vec2.create();
	const touchLast = vec2.create();
	const lastReportedPosition = vec2.create();
	let lastReportedPositionTime = 0;
	const timeOffset = vec2.create();
	let forwardAcceleration = 0;
	let forwardSpeed = 0;
	let modifier = coarseModifier;
	let braking = false;
	let useMouseJoystick = false;
	let touchRollAccum = 0;
	let mouseWheelAccum = 0;

	let rotationTouchID = null;
	let movementTouchID = null;

	const { data, terrain } = await Model;
	const { settings, reportPosition } = await GUI;

	document.addEventListener("keydown", async (event) => {
		if (event.repeat) {
			return;
		}

		if (event.code === "Space") {
			braking = true;
			goalMouseJoystick[0] = 0;
		}

		if (event.code === "ArrowUp" || event.code === "Numpad8") {
			position[2]++;
		}

		if (event.code === "ArrowDown" || event.code === "Numpad2") {
			position[2]--;
		}
	});

	document.addEventListener("keyup", async (event) => {
		if (event.code === "Space") {
			braking = false;
		}
	});

	if (!settings.cursed) {
		viewscreen.addEventListener("contextmenu", (event) =>
			event.preventDefault()
		);
	}

	viewscreen.addEventListener("dblclick", (event) => event.preventDefault());
	viewscreen.addEventListener("mousemove", (event) => {
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

	viewscreen.addEventListener("mousedown", (event) => {
		const shiftKey = event.shiftKey;
		const leftButton = event.button === 0;

		if (!leftButton && (shiftKey || settings.cursed)) {
			return;
		}

		event.preventDefault();
		forwardAcceleration = shiftKey || !leftButton ? 1 : -1;
	});

	viewscreen.addEventListener("mouseup", (event) => {
		event.preventDefault();
		forwardAcceleration = 0;
	});

	viewscreen.addEventListener("wheel", (event) => {
		event.preventDefault();
		mouseWheelAccum +=
			event.deltaY *
			wheelDeltaMagnifiers[event.deltaMode] *
			data.controls.mouse.scrollSpeed;
	});

	viewscreen.addEventListener("mouseleave", (event) => {
		if (!braking) {
			vec2.set(goalMouseJoystick, 0, 0);
		}
	});

	const handleTouchStart = (event) => {
		event.preventDefault();
		useMouseJoystick = false;

		for (const touch of event.changedTouches) {
			if (rotationTouchID == null) {
				vec2.set(touchStart, touch.pageX, touch.pageY);
				vec2.copy(touchLast, touchStart);
				vec3.set(touchStartRotation, ...rotation);

				rotationTouchID = touch.identifier;
				processRotationTouch(touch);
			} else if (movementTouchID == null) {
				movementTouchID = touch.identifier;
				processMovementTouch(touch);
			}
		}
	};

	const handleTouchMove = (event) => {
		event.preventDefault();
		for (const touch of event.changedTouches) {
			if (touch.identifier === rotationTouchID) {
				processRotationTouch(touch);
				vec2.set(touchLast, touch.pageX, touch.pageY);
			} else if (touch.identifier === movementTouchID) {
				processMovementTouch(touch);
			}
		}
	};

	const handleTouchEnd = (event) => {
		event.preventDefault();
		for (const touch of event.changedTouches) {
			if (touch.identifier === rotationTouchID) {
				rotationTouchID = null;
			} else if (touch.identifier === movementTouchID) {
				movementTouchID = null;
				forwardAcceleration = 0;
				braking = false;
			}
		}
	};

	const processMovementTouch = (touch) => {
		const verticalFraction = touch.pageY / viewportSize[1] - 0.5;
		braking = false;
		if (verticalFraction < -1 / 6) {
			forwardAcceleration = -1;
		} else if (verticalFraction > 1 / 6) {
			forwardAcceleration = 1;
		} else {
			forwardAcceleration = 0;
			braking = true;
		}
	};

	const processRotationTouch = (touch) => {
		const { sensitivity, minPitch, maxPitch } = data.controls.touch;
		const maxViewportDimension = Math.max(...viewportSize);
		const pitch = clamp(
			touchStartRotation[0] +
				modifier(
					((touch.pageY - touchStart[1]) / maxViewportDimension) *
						sensitivity[0]
				),
			minPitch,
			maxPitch
		);
		touchRollAccum += (touch.pageX - touchLast[0]) / maxViewportDimension;
		const flipYaw = settings.birdsEyeView ? -1 : 1;
		const yaw =
			touchStartRotation[1] +
			modifier((touch.pageX - touchStart[0]) / maxViewportDimension) *
				sensitivity[1] *
				flipYaw;
		vec3.set(rotation, pitch, yaw, rotation[2]);
	};

	document.addEventListener("touchmove", (event) => event.preventDefault(), {
		passive: false,
	});

	viewscreen.addEventListener("touchstart", handleTouchStart);
	viewscreen.addEventListener("touchmove", handleTouchMove);
	viewscreen.addEventListener("touchend", handleTouchEnd);
	viewscreen.addEventListener("touchcancel", handleTouchEnd);

	const resize = () =>
		vec2.set(viewportSize, window.innerWidth, window.innerHeight);

	window.addEventListener("resize", (event) => resize());

	const updateTransform = () => {
		if (settings.birdsEyeView) {
			const { scale, tilt, drop } = data.controls.birdsEye;
			mat4.identity(transform);
			mat4.rotateX(transform, transform, Math.PI);
			mat4.translate(
				transform,
				transform,
				vec3.fromValues(0, 0, terrain.size / data.rendering.fov)
			);
			mat4.scale(transform, transform, vec3.fromValues(scale, scale, scale));
			mat4.rotateX(transform, transform, degreesToRadians * tilt);
			mat4.rotateZ(transform, transform, degreesToRadians * -rotation[1]);
			mat4.translate(
				transform,
				transform,
				vec3.fromValues(position[0], position[1], drop)
			);
		} else {
			quat.fromEuler(rotQuat, ...rotation, "xzy");
			mat4.fromQuat(transform, rotQuat);
			mat4.rotateX(transform, transform, Math.PI / 2);
			mat4.translate(transform, transform, position);
		}

		quat.fromEuler(rotQuat, rotation[0], 270, rotation[2], "xzy");
		mat4.fromQuat(horizonTransform, rotQuat);
		mat4.rotateX(horizonTransform, horizonTransform, Math.PI / 2);
	};

	const updateForwardSpeed = (deltaTime) => {
		const { maxForwardSpeed, forwardSensitivity } = data.controls;
		const lastForwardSpeed = forwardSpeed;

		if (braking) {
			forwardSpeed = lerp(forwardSpeed, 0, clamp(deltaTime * 5, 0, 1));
		} else {
			forwardSpeed += deltaTime * forwardAcceleration * forwardSensitivity;
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

	const updateCreditOffset = (deltaTime) => {
		timeOffset[1] = lerp(
			timeOffset[1],
			mouseWheelAccum,
			clamp(deltaTime * 5, 0, 1)
		);
	};

	const updateRotation = (deltaTime) => {
		vec2.lerp(
			mouseJoystick,
			mouseJoystick,
			goalMouseJoystick,
			clamp(0.5 + deltaTime, 0, 1)
		);

		if (useMouseJoystick) {
			const { sensitivity, minPitch, maxPitch } = data.controls.mouse;
			const pitch = clamp(
				modifier(sensitivity[1] * mouseJoystick[1]),
				minPitch,
				maxPitch
			);
			const roll =
				modifier(sensitivity[0] * mouseJoystick[0]) *
				data.controls.mouse.rollMultiplier;
			const yaw =
				rotation[1] + deltaTime * modifier(sensitivity[0] * mouseJoystick[0]);
			vec3.set(rotation, pitch, yaw, roll);
		} else {
			touchRollAccum = lerp(touchRollAccum, 0, clamp(deltaTime * 5, 0, 1));
			rotation[2] = lerp(
				rotation[2],
				touchRollAccum * data.controls.touch.sensitivity[0],
				clamp(0.5 + deltaTime, 0, 1)
			);
		}
	};

	const sanitizePosition = () => {
		if (!settings.sanitizePosition) {
			return;
		}
		const size = terrain.size;
		position[0] = ((position[0] % size) + size) % size;
		position[1] = ((position[1] % size) + size) % size;
	};

	const reportPositionToGUI = () => {
		const reportedPosition = [
			Math.floor((position[0] * terrain.numColumns) / terrain.size),
			Math.floor((position[1] * terrain.numRows) / terrain.size),
		];
		const now = Date.now();
		if (
			!vec2.equals(lastReportedPosition, reportedPosition) &&
			now - lastReportedPositionTime > minReportedPositionTime
		) {
			lastReportedPositionTime = now;
			vec2.copy(lastReportedPosition, reportedPosition);
			reportPosition(...reportedPosition);
		}
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
		sanitizePosition();
		reportPositionToGUI();
	};

	const limitAltitude = (deltaTime) => {
		const altitude = position[2];
		const quad = terrain.getQuadAt(...position);
		const clampedAltitude = Math.max(
			quad.altitude + data.controls.minHeightOffGround,
			Math.min(data.controls.maxAltitude, position[2])
		);
		position[2] = lerp(
			position[2],
			clampedAltitude,
			clamp(0.4 + deltaTime * 4, 0, 1)
		);
	};

	const update = (deltaTime) => {
		updateCreditOffset(deltaTime);
		if (settings.interactive) {
			updateRotation(deltaTime);
			updatePosition(deltaTime);
			limitAltitude(deltaTime);
			updateForwardSpeed(deltaTime);
		}
		updateTransform();
	};

	const { locations } = data.controls;
	let location;
	if (settings.location in locations) {
		location = locations[settings.location];
	} else {
		let coordString = settings.location;
		if (coordString == null) {
			coordString = "";
		}
		const coord = coordString.split(",").map((f) => parseInt(f));
		coord[0] = ((coord[0] + 0.5) * terrain.size) / terrain.numColumns;
		coord[1] = ((coord[1] + 0.5) * terrain.size) / terrain.numRows;

		if (coord.length < 2 || coord.includes(NaN)) {
			location = locations.spawn;
		} else {
			location = {
				position: [...coord, data.controls.maxAltitude / 2],
				rotation: [0, 225],
			};
		}
	}

	vec3.set(position, ...location.position);
	vec3.set(rotation, ...location.rotation, 0);
	sanitizePosition();
	reportPositionToGUI();
	resize();

	return {
		update,
		controlData: {
			transform,
			horizonTransform,
			position,
			rotation,
			timeOffset,
		},
	};
})();
