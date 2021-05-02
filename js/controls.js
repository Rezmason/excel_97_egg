const _lookDirection = new THREE.Vector3();
const _spherical = new THREE.Spherical();
const _targetPosition = new THREE.Vector3();

const coarse = (value, granularity = 1000) => Math.round(value * granularity) / granularity;

export default class Controls {
	constructor(object) {
		this.object = object;

		this.enabled = true;
		this.movementAcceleration = 500;
		this.maxMovementSpeed = 2000;
		this.lookSpeed = 0.001;

		this.verticalMin = Math.PI * (0.5 - 0.05);
		this.verticalMax = Math.PI * (0.5 + 0.05);

		this.mouseButtonDown = null;
		this.mouseX = 0;
		this.mouseY = 0;
		this.movementSpeed = 0;
		this.viewWidth = 0;
		this.viewHeight = 0;

		this.theta = 0;
		this.phi = 0;
		this.roll = 0;

		document.addEventListener("contextmenu", event => event.preventDefault());
		document.addEventListener("mousemove", event => {
			this.mouseX = event.pageX - this.viewWidth / 2;
			this.mouseY = event.pageY - this.viewHeight / 2;
		});
		document.addEventListener("mousedown", event => {
			event.preventDefault();
			this.mouseButtonDown = event.button === 0 ? "primary" : "secondary";
		});
		document.addEventListener("mouseup", event => {
			event.preventDefault();
			this.mouseButtonDown = null;
		});

		this.handleResize();
		this.setOrientation();
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

		this.roll = coarse(this.lookSpeed * -this.mouseX);
		this.theta += delta * this.lookSpeed * -this.mouseX;
		this.phi += delta * this.lookSpeed * this.mouseY;
		this.phi = THREE.MathUtils.clamp(this.phi, this.verticalMin, this.verticalMax);

		_targetPosition.setFromSphericalCoords(1, coarse(this.phi), coarse(this.theta)).add(this.object.position);
		this.object.lookAt(_targetPosition);
	}

	setOrientation() {
		_lookDirection.set(0, 0, -1).applyQuaternion(this.object.quaternion);
		_spherical.setFromVector3(_lookDirection);
		this.phi = _spherical.phi;
		this.theta = _spherical.theta;
	}
}
