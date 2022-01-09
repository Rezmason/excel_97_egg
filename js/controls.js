const { mat2, mat4, vec2, vec3, quat } = glMatrix;

const degreesToRadians = Math.PI / 180;

const forwardAcceleration = 400;
const maxForwardSpeed = 1000;
const turnSpeed = 0.125;

const mouseJoystick = vec2.create();
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
		vec2.set(
			mouseJoystick,
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

	domElement.addEventListener("touchstart", (event) => {
		event.preventDefault();
		const { pageX, pageY } = event.touches.item(0);
		touchStartX = pageX;
		touchStartY = pageY;
		vec3.set(touchStartRotation, ...rotation);
		const isAboveMiddle = touchStartY - viewportSize[1] / 2 < 0;
		mouseButtonDown = isAboveMiddle ? "primary" : "secondary";
	});
	domElement.addEventListener("touchmove", (event) => {
		event.preventDefault();
		const { pageX, pageY } = event.touches.item(0);
		if (
			Math.sqrt((pageX - touchStartX) ** 2 + (pageY - touchStartY) ** 2) > 10
		) {
			mouseButtonDown = null;
		}
		const pitch = clamp(
			coarse(touchStartRotation[0] + (pageY - touchStartY) * 1) - 9,
			9
		);
		const roll = 0;
		const yaw = touchStartRotation[1] + coarse(pageX - touchStartX) * 1;
		vec3.set(rotation, pitch, yaw, roll);
	});
	domElement.addEventListener("touchend", (event) => {
		event.preventDefault();
		if (event.touches.length === 0) {
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
	const pitch = clamp(coarse(-mouseJoystick[1] * 0.025), -9, 9);
	const roll = coarse(turnSpeed * mouseJoystick[0]) * 0.2375;
	const yaw = rotation[1] + deltaTime * coarse(turnSpeed * mouseJoystick[0]);
	vec3.set(rotation, pitch, yaw, roll);

	controls.pitch = pitch;
	mat2.fromRotation(rollMat, -roll * degreesToRadians * 1.5);
};

const updatePosition = (clampAltitude, deltaTime, smoothMotion) => {
	smooth = smoothMotion;
	const pitchRad = degreesToRadians * rotation[0];
	const yawRad = degreesToRadians * rotation[1];
	const magnitude = deltaTime * forwardSpeed;

	position[0] += magnitude * Math.sin(yawRad) * Math.cos(pitchRad);
	position[1] += magnitude * Math.cos(yawRad) * Math.cos(pitchRad) * -1;
	position[2] += magnitude * Math.sin(pitchRad);

	position[2] = clampAltitude(...position);
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
