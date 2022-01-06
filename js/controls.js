const { mat4, vec3, quat } = glMatrix;

const maxMovementSpeed = 1000;
const maxCameraRoll = 0.2375;

// const object = new THREE.Object3D();

const verticalMin = Math.PI * (0.5 - 0.05); // const verticalMin = Math.PI * 0;
const verticalMax = Math.PI * (0.5 + 0.05); // const verticalMax = Math.PI * 2;

let domElement = null;

let movementAcceleration = 500;
let turnSpeed = 0.0025;

let mouseButtonDown = null;
let mouseX = 0;
let mouseY = 0;
let movementSpeed = 0;
let viewWidth = 0;
let viewHeight = 0;

let touchStartPhi = 0;
let touchStartTheta = 0;
let touchStartX = 0;
let touchStartY = 0;

let theta = 0;
let phi = 0;
let roll = 0;

let topDown = false;

const transform = mat4.create();
const position = vec3.create();
const rotation = vec3.create();
const rotQuat = quat.create();

const coarse = (value, granularity = 1000) =>
	Math.round(value * granularity) / granularity;

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
		mouseX = event.pageX - viewWidth / 2;
		mouseY = event.pageY - viewHeight / 2;

		phi = Math.PI * 0.5 + mouseY * 0.0005;
		phi = clamp(phi, verticalMin, verticalMax);
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
		touchStartPhi = phi;
		touchStartTheta = theta;
		const isAboveMiddle = touchStartY - viewHeight / 2 < 0;
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
		theta = touchStartTheta + (pageX - touchStartX) * 0.001;
		phi = touchStartPhi + (pageY - touchStartY) * 0.0005;
		phi = clamp(phi, verticalMin, verticalMax);
	});
	domElement.addEventListener("touchend", (event) => {
		event.preventDefault();
		if (event.touches.length === 0) {
			mouseButtonDown = null;
		}
	});
};

const resize = () => {
	viewWidth = window.innerWidth;
	viewHeight = window.innerHeight;
};

const refreshTransform = () => {
	if (topDown) {
		mat4.identity(transform);
		mat4.rotateX(transform, transform, Math.PI);
		mat4.rotateZ(transform, transform, Math.PI);
		mat4.translate(transform, transform, vec3.fromValues(0, 0, 5000));
		mat4.translate(transform, transform, vec3.fromValues(...position));
		mat4.rotateX(transform, transform, Math.PI * 0.2);
	} else {
		mat4.fromQuat(transform, rotQuat);
		mat4.rotateX(transform, transform, Math.PI / 2);
		mat4.translate(transform, transform, position);
	}
};

const goto = (location) => {
	vec3.set(position, ...location.position);
	vec3.set(rotation, ...location.rotation);
	quat.fromEuler(rotQuat, ...rotation, "xzy");

	// TODO: transfer rotation to spherical coordinates
	/*
		const lookDirection = vec3.fromValues(0, 0, -1);
		lookDirection.applyQuaternion(object.quaternion);
		const spherical = new THREE.Spherical();
		spherical.setFromVector3(lookDirection);
		phi = spherical.phi;
		theta = spherical.theta;
	*/

	refreshTransform();
};

const update = (deltaTime) => {
	if (mouseButtonDown != null) {
		const lastMovementSpeed = movementSpeed;
		movementSpeed +=
			deltaTime *
			movementAcceleration *
			(mouseButtonDown === "primary" ? -1 : 1);
		movementSpeed = clamp(movementSpeed, -maxMovementSpeed, maxMovementSpeed);
		movementSpeed = coarse(movementSpeed, 10);
		if (lastMovementSpeed != 0 && lastMovementSpeed < 0 != movementSpeed < 0) {
			movementSpeed = 0;
		}
		if (Math.abs(movementSpeed) < 5) {
			movementSpeed = 0;
		}
	}

	// TODO: append forward motion to position
	/*
		object.translateZ(deltaTime * movementSpeed);
	*/

	// TODO: limit altitude between ground level plus offset and max

	roll = coarse(turnSpeed * -mouseX);
	theta += deltaTime * turnSpeed * -mouseX;

	// TODO: assign rotation from spherical coordinates to quaternion
	/*
		let targetPosition = new THREE.Vector3();
		targetPosition.setFromSphericalCoords(1, coarse(phi), coarse(theta)).add(object.position);
		object.lookAt(targetPosition);
	*/

	// TODO: camera roll
	/*
		camera.rotation.z = roll * maxCameraRoll;
	*/

	refreshTransform();
};

refreshTransform();

export default {
	attach,
	goto,
	resize,
	update,
	topDown,
	transform,
	position,
	rotation,
};
