import { coarse } from "./utils.js";

export default class Controls {
	constructor(object, camera, domElement) {
		this.object = object;
		this.camera = camera;

		this.enabled = true;
		this.movementAcceleration = 500;
		this.maxMovementSpeed = 2000;
		this.turnSpeed = 0.0025;
		this.maxCameraRoll = 0.2375;

		this.verticalMin = Math.PI * (0.5 - 0.05);
		this.verticalMax = Math.PI * (0.5 + 0.05);

		// this.verticalMin = Math.PI * 0;
		// this.verticalMax = Math.PI * 2;

		this.mouseButtonDown = null;
		this.mouseX = 0;
		this.mouseY = 0;
		this.movementSpeed = 0;
		this.viewWidth = 0;
		this.viewHeight = 0;

		this.targetPosition = new THREE.Vector3();
		this.touchStartPhi = 0;
		this.touchStartTheta = 0;
		this.touchStartX = 0;
		this.touchStartY = 0;

		this.theta = 0;
		this.phi = 0;
		this.roll = 0;

		domElement.addEventListener("contextmenu", event => event.preventDefault());
		domElement.addEventListener("dblclick", event => event.preventDefault());
		domElement.addEventListener("mousemove", event => {
			event.preventDefault();
			this.mouseX = event.pageX - this.viewWidth / 2;
			this.mouseY = event.pageY - this.viewHeight / 2;

			this.phi = Math.PI * 0.5 + this.mouseY * 0.0005;
			this.phi = THREE.MathUtils.clamp(this.phi, this.verticalMin, this.verticalMax);
		});
		domElement.addEventListener("mousedown", event => {
			event.preventDefault();
			this.mouseButtonDown = event.button === 0 ? "primary" : "secondary";
		});
		domElement.addEventListener("mouseup", event => {
			event.preventDefault();
			this.mouseButtonDown = null;
		});

		domElement.addEventListener("touchstart", event => {
			event.preventDefault();
			const { pageX, pageY } = event.touches.item(0);
			this.touchStartX = pageX;
			this.touchStartY = pageY;
			this.touchStartPhi = this.phi;
			this.touchStartTheta = this.theta;
			const isAboveMiddle = this.touchStartY - this.viewHeight / 2 < 0;
			this.mouseButtonDown = isAboveMiddle ? "primary" : "secondary";
		});
		domElement.addEventListener("touchmove", event => {
			event.preventDefault();
			const { pageX, pageY } = event.touches.item(0);
			if (Math.sqrt((pageX - this.touchStartX) ** 2 + (pageY - this.touchStartY) ** 2) > 10) {
				this.mouseButtonDown = null;
			}
			this.theta = this.touchStartTheta + (pageX - this.touchStartX) * 0.001;
			this.phi = this.touchStartPhi + (pageY - this.touchStartY) * 0.0005;
			this.phi = THREE.MathUtils.clamp(this.phi, this.verticalMin, this.verticalMax);
		});
		domElement.addEventListener("touchend", event => {
			event.preventDefault();
			if (event.touches.length === 0) {
				this.mouseButtonDown = null;
			}
		});

		this.handleResize();

		const lookDirection = new THREE.Vector3(0, 0, -1);
		lookDirection.applyQuaternion(this.object.quaternion);
		const spherical = new THREE.Spherical();
		spherical.setFromVector3(lookDirection);
		this.phi = spherical.phi;
		this.theta = spherical.theta;
	}

	handleResize() {
		this.viewWidth = window.innerWidth;
		this.viewHeight = window.innerHeight;
	}

	update(delta) {
		if (!this.enabled) return;

		if (this.mouseButtonDown != null) {
			this.movementSpeed += delta * this.movementAcceleration * (this.mouseButtonDown === "primary" ? -1 : 1);
			this.movementSpeed = THREE.MathUtils.clamp(this.movementSpeed, -this.maxMovementSpeed, this.maxMovementSpeed);
			this.movementSpeed = coarse(this.movementSpeed);
		}

		this.object.translateZ(delta * this.movementSpeed);

		this.roll = coarse(this.turnSpeed * -this.mouseX);
		this.theta += delta * this.turnSpeed * -this.mouseX;

		this.targetPosition.setFromSphericalCoords(1, coarse(this.phi), coarse(this.theta)).add(this.object.position);
		this.object.lookAt(this.targetPosition);

		this.camera.rotation.z = this.roll * this.maxCameraRoll;
	}
}
