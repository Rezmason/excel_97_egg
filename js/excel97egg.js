import Controls from "./controls.js";
import { heightmapSize, terrainSize, isInZone, getHeight, createTerrainGeometry } from "./terrain.js";
import { loadTexture } from "./utils.js";
import { setupPool, updatePool } from "./pool.js";
import { CreditsMaterial, setupCredits, updateCredits } from "./credits.js";

(async () => {
	const renderScale = 0.25;
	const maxDrawDistance = 1000;

	const data = await fetch("assets/data.json").then(response => response.json());

	const textures = {
		horizon: loadTexture("assets/textures/horizon_screenshot.png", false),
		moonscape: loadTexture("assets/textures/moonscape_brighter.png", true, terrainSize),
		platform: loadTexture("assets/textures/platform_screenshot.png", true, terrainSize),
		credits: loadTexture("assets/textures/credits_rm.png", true)
	};

	const clock = new THREE.Clock();
	let accumulatedDelta = 0;

	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0x0);
	scene.fog = new THREE.Fog(0x0, 1, maxDrawDistance);

	const airplane = new THREE.Group();
	scene.add(airplane);

	let windowWidth = window.innerWidth * renderScale;
	let windowHeight = window.innerHeight * renderScale;

	const camera = new THREE.PerspectiveCamera(26, windowWidth / windowHeight, 0.1, maxDrawDistance);
	airplane.add(camera);

	const location = data.locations.spawn;
	airplane.position.set(...location.position);
	airplane.rotation.set(...location.rotation.map(x => Math.PI * x));

	const renderer = new THREE.WebGLRenderer();
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(windowWidth, windowHeight);
	renderer.domElement.style.width = "100%";
	renderer.domElement.style.height = "100%";
	document.body.appendChild(renderer.domElement);

	const controls = new Controls(airplane, camera, renderer.domElement);

	window.addEventListener("resize", () => {
		windowWidth = window.innerWidth * renderScale;
		windowHeight = window.innerHeight * renderScale;

		camera.aspect = windowWidth / windowHeight;
		camera.updateProjectionMatrix();

		renderer.setSize(windowWidth, windowHeight);
		renderer.domElement.style.width = "100%";
		renderer.domElement.style.height = "100%";

		controls.handleResize();
	});

	const horizonGeometry = new THREE.CylinderGeometry(maxDrawDistance - 5, maxDrawDistance - 5, 64, 100, 1, true);
	const horizonPositions = horizonGeometry.attributes.position;
	for (let i = 0; i < horizonPositions.count; i++) {
		horizonPositions.setY(i, horizonPositions.getY(i) + 25);
	}
	const horizonMesh = new THREE.Mesh(horizonGeometry, new THREE.MeshBasicMaterial({ map: textures.horizon, side: THREE.BackSide, fog: false }));
	horizonMesh.position.copy(airplane.position);
	scene.add(horizonMesh);

	scene.add(
		new THREE.Mesh(
			createTerrainGeometry(data, { lightingMagnifier: 0.06 }),
			new THREE.MeshBasicMaterial({ map: textures.moonscape, side: THREE.DoubleSide, vertexColors: true })
		)
	);

	scene.add(
		new THREE.Mesh(
			createTerrainGeometry(data, { zoneName: "platform", lightingMagnifier: 0.05, useBakedLighting: true }),
			new THREE.MeshBasicMaterial({ map: textures.platform, side: THREE.DoubleSide, vertexColors: true })
		)
	);

	const poolGeometry = createTerrainGeometry(data, { zoneName: "pool", lightingMagnifier: 0.06 });
	const poolPoints = setupPool(poolGeometry, data.zones.pool);
	scene.add(new THREE.Mesh(poolGeometry, new THREE.MeshBasicMaterial({ map: textures.moonscape, side: THREE.DoubleSide, vertexColors: true })));

	const creditsGeometry = createTerrainGeometry(data, { zoneName: "credits", lightingMagnifier: 0, exclusiveToZone: false });
	const creditsPoints = setupCredits(creditsGeometry, data.zones.credits);
	scene.add(new THREE.Mesh(creditsGeometry, new CreditsMaterial(textures.credits)));

	const updateAirplane = delta => {
		controls.update(delta);

		if (airplane.position.x > data.width) {
			airplane.position.x -= data.width;
		} else if (airplane.position.x < -data.width) {
			airplane.position.x += data.width;
		}

		if (airplane.position.z > data.width) {
			airplane.position.z -= data.width;
		} else if (airplane.position.z < -data.width) {
			airplane.position.z += data.width;
		}

		const x = Math.round((airplane.position.x / data.width) * heightmapSize) + heightmapSize;
		const y = Math.round((airplane.position.z / data.width) * heightmapSize) + heightmapSize;
		airplane.position.y = THREE.MathUtils.clamp(airplane.position.y, getHeight(data.heights, x, y) + data.minHeightOffGround, data.maxAltitude);

		// camera.rotation.z = Math.PI;
		// console.log(Math.round(airplane.position.x), Math.round(airplane.position.z));

		horizonMesh.position.copy(airplane.position);
	};

	const animate = () => {
		requestAnimationFrame(animate);

		accumulatedDelta += clock.getDelta();
		if (accumulatedDelta < 1 / data.targetFPS) {
			return;
		}
		const delta = accumulatedDelta;
		accumulatedDelta %= 1 / data.targetFPS;

		updatePool(poolGeometry, poolPoints, clock.elapsedTime);
		updateCredits(creditsGeometry, creditsPoints, clock.elapsedTime);
		updateAirplane(delta);

		renderer.render(scene, camera);
	};

	animate();
})();
