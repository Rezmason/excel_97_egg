const { mat2, mat4, vec2, vec3, quat } = glMatrix;

const degreesToRadians = Math.PI / 180;

const forwardAcceleration = 400;
const maxForwardSpeed = 1000;
const turnSpeed = 0.125;

const mouseJoystick = vec2.create();
const goalMouseJoystick = vec2.create();
const viewportSize = vec2.create();
const transform = mat4.create();
const position = vec3.create();
const rotation = vec3.create();
const rollMat = mat2.create();
const touchStartRotation = vec3.create();
const rotQuat = quat.create();
let mouseButtonDown = null;
let forwardSpeed = 0;
let domElement = null;
let touchStartX = 0;
let touchStartY = 0;
let smooth = false;
let useMouseJoystick = false;

const coarse = (value, granularity = 1000) =>
	smooth ? value : Math.round(value * granularity) / granularity;

const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

const attach = (element) => {
	if (domElement != null) {
		console.warn("You can't attach the controls twice.");
		return;
	}

	domElement = element;

	domElement.addEventListener("contextmenu", (event) => event.preventDefault());
	domElement.addEventListener("dblclick", (event) => event.preventDefault());
	domElement.addEventListener("mousemove", (event) => {
		event.preventDefault();
		useMouseJoystick = true;
		vec2.set(
			goalMouseJoystick,
			event.pageX - viewportSize[0] / 2,
			event.pageY - viewportSize[1] / 2
		);
	});
	domElement.addEventListener("mousedown", (event) => {
		event.preventDefault();
		mouseButtonDown = event.button === 0 ? "primary" : "secondary";
	});
	domElement.addEventListener("mouseup", (event) => {
		event.preventDefault();
		mouseButtonDown = null;
	});

	domElement.addEventListener("mouseleave", (event) => {
		vec2.set(goalMouseJoystick, 0, 0);
	});

	domElement.addEventListener("touchstart", (event) => {
		event.preventDefault();
		let { pageX, pageY } = event.touches.item(0);
		const maxViewportDimension = Math.max(...viewportSize);
		pageX /= maxViewportDimension;
		pageY /= maxViewportDimension;
		useMouseJoystick = false;
		touchStartX = pageX;
		touchStartY = pageY;
		vec3.set(touchStartRotation, ...rotation);
	});
	domElement.addEventListener("touchmove", (event) => {
		event.preventDefault();
		let { pageX, pageY } = event.touches.item(0);
		const maxViewportDimension = Math.max(...viewportSize);
		pageX /= maxViewportDimension;
		pageY /= maxViewportDimension;
		const pitch = clamp(
			coarse(touchStartRotation[0] + (pageY - touchStartY) * -100),
			-9,
			18
		);
		const roll = 0;
		const flipYaw = controls.birdsEyeView ? -1 : 1;
		const yaw =
			touchStartRotation[1] + coarse(pageX - touchStartX) * -100 * flipYaw;
		vec3.set(rotation, pitch, yaw, roll);
		if (event.touches.length > 1) {
			const isAboveMiddle = event.touches.item(1).pageY / viewportSize[1] < 0.5;
			mouseButtonDown = isAboveMiddle ? "primary" : "secondary";
		}
	});
	domElement.addEventListener("touchend", (event) => {
		event.preventDefault();
		if (event.touches.length < 2) {
			mouseButtonDown = null;
		}
	});
};

const resize = () =>
	vec2.set(viewportSize, window.innerWidth, window.innerHeight);

const updateTransform = () => {
	if (controls.birdsEyeView) {
		mat4.identity(transform);
		mat4.rotateX(transform, transform, Math.PI);
		mat4.translate(transform, transform, vec3.fromValues(0, 0, 75));
		mat4.scale(transform, transform, vec3.fromValues(0.03, 0.03, 0.03));
		mat4.rotateX(transform, transform, -Math.PI * 0.375);
		mat4.rotateZ(transform, transform, degreesToRadians * -rotation[1]);
		mat4.translate(
			transform,
			transform,
			vec3.fromValues(position[0], position[1], -150)
		);
	} else {
		quat.fromEuler(rotQuat, ...rotation, "xzy");
		mat4.fromQuat(transform, rotQuat);
		mat4.rotateX(transform, transform, Math.PI / 2);
		mat4.translate(transform, transform, position);
	}
};

const goto = (location) => {
	vec3.set(position, ...location.position);
	vec3.set(rotation, ...location.rotation, 0);
	updateTransform();
};

const updateForwardSpeed = (deltaTime) => {
	if (mouseButtonDown == null) {
		return;
	}

	const lastForwardSpeed = forwardSpeed;
	forwardSpeed +=
		deltaTime * forwardAcceleration * (mouseButtonDown === "primary" ? -1 : 1);
	forwardSpeed = clamp(forwardSpeed, -maxForwardSpeed, maxForwardSpeed);
	forwardSpeed = coarse(forwardSpeed, 10);
	if (lastForwardSpeed != 0 && lastForwardSpeed < 0 != forwardSpeed < 0) {
		forwardSpeed = 0;
	}
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
		const pitch = clamp(coarse(-mouseJoystick[1] * 0.025), -9, 9);
		const roll = coarse(turnSpeed * mouseJoystick[0]) * 0.2375;
		const yaw = rotation[1] + deltaTime * coarse(turnSpeed * mouseJoystick[0]);
		vec3.set(rotation, pitch, yaw, roll);
	}

	controls.pitch = rotation[0];
	mat2.fromRotation(rollMat, -rotation[2] * degreesToRadians * 1.5);
};

const updatePosition = (clampAltitude, deltaTime, smoothMotion) => {
	smooth = smoothMotion;
	const pitchRad = degreesToRadians * rotation[0];
	const yawRad = degreesToRadians * rotation[1];
	const magnitude = deltaTime * forwardSpeed;

	position[0] += magnitude * Math.sin(yawRad) * Math.cos(pitchRad);
	position[1] += magnitude * Math.cos(yawRad) * Math.cos(pitchRad) * -1;
	position[2] += magnitude * Math.sin(pitchRad);

	const lerpRatio = clamp(0.4 + deltaTime * 4, 0, 1);
	position[2] =
		position[2] * (1 - lerpRatio) + clampAltitude(...position) * lerpRatio;
};

const update = (clampAltitude, deltaTime) => {
	updateRotation(deltaTime);
	updatePosition(clampAltitude, deltaTime);
	updateForwardSpeed(deltaTime);
	updateTransform();
};

const controls = {
	attach,
	goto,
	resize,
	update,
	transform,
	position,
	pitch: 0,
	rollMat,
	birdsEyeView: false,
};

updateTransform();

export default controls;
