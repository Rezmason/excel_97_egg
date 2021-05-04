import Controls from "./controls.js";
import CreditMaterial from "./creditmaterial.js";
import { heightmapSize, terrainSize, isInZone, getHeight, createTerrainGeometry } from "./terrain.js";

const renderScale = 0.25;
let windowWidth, windowHeight;

const maxDrawDistance = 1000;
let data, poolAVertexIndices, poolBVertexIndices, crawlAVertexIndices, crawlBVertexIndices, crawlCVertexIndices;
let debugDiv;
let camera, airplane, controls, scene, renderer;
let horizon;
let poolGeometry;
let crawlGeometry;

let accumulatedDelta = 0;

const clock = new THREE.Clock();

const init = async () => {
	data = await fetch("assets/data.json").then(response => response.json());

	const loader = new THREE.TextureLoader();
	// await all the textures

	const horizonTexture = loader.load("assets/textures/horizon_screenshot.png");
	horizonTexture.repeat.set(1, 1);
	horizonTexture.minFilter = THREE.NearestFilter;
	horizonTexture.magFilter = THREE.NearestFilter;

	const moonscapeTexture = loader.load("assets/textures/moonscape_brighter.png");
	moonscapeTexture.wrapS = moonscapeTexture.wrapT = THREE.RepeatWrapping;
	moonscapeTexture.repeat.set(256, 256);
	moonscapeTexture.minFilter = THREE.NearestFilter;
	moonscapeTexture.magFilter = THREE.NearestFilter;

	const platformTexture = loader.load("assets/textures/platform_screenshot.png");
	platformTexture.wrapS = platformTexture.wrapT = THREE.RepeatWrapping;
	platformTexture.repeat.set(256, 256);
	platformTexture.minFilter = THREE.NearestFilter;
	platformTexture.magFilter = THREE.NearestFilter;

	// construct the scene/camera/renderer
	// construct the controls
	// construct the meshes
	// position the airplane
	// handle resize
	// animate

	scene = new THREE.Scene();
	scene.background = new THREE.Color(0x0);
	// scene.fog = new THREE.FogExp2(0x0, 0.001);
	scene.fog = new THREE.Fog(0x0, 1, maxDrawDistance);

	windowWidth = window.innerWidth * renderScale;
	windowHeight = window.innerHeight * renderScale;

	airplane = new THREE.Group();
	scene.add(airplane);

	camera = new THREE.PerspectiveCamera(26, windowWidth / windowHeight, 0.1, maxDrawDistance);
	airplane.add(camera);

	const horizonGeometry = new THREE.CylinderGeometry(maxDrawDistance - 5, maxDrawDistance - 5, 64, 100, 1, true);

	horizon = new THREE.Mesh(horizonGeometry, new THREE.MeshBasicMaterial({ map: horizonTexture, side: THREE.BackSide }));
	horizon.material.fog = false;
	horizon.position.copy(airplane.position);
	scene.add(horizon);

	// Spawn
	airplane.position.set(0, 45, 0);
	airplane.rotation.set(0, Math.PI * 1.55, 0);
	// airplane.rotation.set(0, Math.PI * 1.725, 0);

	// Over monolith
	// airplane.position.set(-470, 300, 375);
	// airplane.rotation.set(Math.PI * 0.5, 0, 0);

	// Pool
	// airplane.position.set(-300, 85, -595);
	// airplane.rotation.set(Math.PI * -0.05, Math.PI * 1.25, 0);

	// Spikes
	// airplane.position.set(-336, 85, 724);
	// airplane.rotation.set(Math.PI * 0.05, Math.PI * 1.75, 0);

	// Over all
	// airplane.position.set(0, 20000, 0);
	// airplane.rotation.set(Math.PI * 0.5, 0, 0);

	const moonscapeGeometry = createTerrainGeometry(data, { lightingMagnifier: 0.06 });
	const moonscape = new THREE.Mesh(moonscapeGeometry, new THREE.MeshBasicMaterial({ map: moonscapeTexture, side: THREE.DoubleSide, vertexColors: true }));
	scene.add(moonscape);

	poolGeometry = createTerrainGeometry(data, { zoneName: "pool", lightingMagnifier: 0.06 });
	poolGeometry.attributes.position.usage = THREE.DynamicDrawUsage;
	poolGeometry.attributes.color.usage = THREE.DynamicDrawUsage;
	poolAVertexIndices = [];
	poolBVertexIndices = [];
	const poolZone = data.zones.pool;
	for (let y = 0; y <= terrainSize; y++) {
		for (let x = 0; x <= terrainSize; x++) {
			if (isInZone(x, y, 0, poolZone)) {
				const index = y * (terrainSize + 1) + x;
				if (x % 2 == 0 || y % 2 == 0) {
					poolAVertexIndices.push(index);
				} else {
					poolBVertexIndices.push(index);
				}
			}
		}
	}
	const pool = new THREE.Mesh(poolGeometry, new THREE.MeshBasicMaterial({ map: moonscapeTexture, side: THREE.DoubleSide, vertexColors: true }));
	scene.add(pool);

	const platformGeometry = createTerrainGeometry(data, { zoneName: "platform", lightingMagnifier: 0.05, useBakedLighting: true });
	const platform = new THREE.Mesh(platformGeometry, new THREE.MeshBasicMaterial({ map: platformTexture, side: THREE.DoubleSide, vertexColors: true }));
	scene.add(platform);

	const creditsTexture = loader.load("assets/textures/credits_rm.png");
	creditsTexture.minFilter = THREE.NearestFilter;
	creditsTexture.magFilter = THREE.NearestFilter;

	crawlGeometry = createTerrainGeometry(data, { zoneName: "crawl", lightingMagnifier: 0, exclusiveToZone: false });
	crawlGeometry.attributes.uv.usage = THREE.DynamicDrawUsage;
	const crawlUVs = crawlGeometry.attributes.uv.array;
	const crawlColors = crawlGeometry.attributes.color.array;
	crawlAVertexIndices = [];
	crawlBVertexIndices = [];
	crawlCVertexIndices = [];
	const crawlZone = data.zones.crawl;
	for (let y = 0; y <= terrainSize; y++) {
		for (let x = 0; x <= terrainSize; x++) {
			if (isInZone(x, y, 1, crawlZone)) {
				const index = y * (terrainSize + 1) + x;
				const u = 1 - ((x % heightmapSize) - data.zones.crawl.x) / 2;
				crawlUVs[index * 2 + 0] = u;
				const v = (y % heightmapSize) - data.zones.crawl.y;
				crawlColors[index * 3 + 0] = v;
				crawlColors[index * 3 + 1] = v;
				crawlColors[index * 3 + 2] = v;
				switch (v) {
					case 0:
						crawlAVertexIndices.push(index);
						break;
					case 1:
						crawlBVertexIndices.push(index);
						break;
					case 2:
						crawlCVertexIndices.push(index);
						break;
				}
			}
		}
	}
	crawlGeometry.attributes.color.needsUpdate = true;

	const creditMaterial = new CreditMaterial(creditsTexture);
	const crawl = new THREE.Mesh(crawlGeometry, creditMaterial);
	scene.add(crawl);

	renderer = new THREE.WebGLRenderer();
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(windowWidth, windowHeight);
	renderer.domElement.style.width = "100%";
	renderer.domElement.style.height = "100%";
	document.body.appendChild(renderer.domElement);

	controls = new Controls(airplane, camera, renderer.domElement);

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

	controls.update(0);
	animate();
};

const updatePoolGeometry = time => {
	const positions = poolGeometry.attributes.position.array;
	const colors = poolGeometry.attributes.color.array;

	const waveA = Math.sin(time * 10) * 2;
	const posA = waveA - 25;
	const lightingA = 1 - waveA * 0.15;

	const waveB = -waveA;
	const posB = waveB - 25;
	const lightingB = 1 - waveB * 0.15;

	for (const index of poolAVertexIndices) {
		positions[index * 3 + 1] = posA;
		colors[index * 3 + 0] = lightingA;
		colors[index * 3 + 1] = lightingA;
		colors[index * 3 + 2] = lightingA;
	}
	for (const index of poolBVertexIndices) {
		positions[index * 3 + 1] = posB;
		colors[index * 3 + 0] = lightingB;
		colors[index * 3 + 1] = lightingB;
		colors[index * 3 + 2] = lightingB;
	}
	poolGeometry.attributes.position.needsUpdate = true;
	poolGeometry.attributes.color.needsUpdate = true;
};

const updateCrawlGeometry = time => {
	const uvs = crawlGeometry.attributes.uv.array;
	const offset = 0.01;
	time = 1 - ((offset * (time * 0.4 + 2)) % 1);
	const crawlA = time;
	const crawlB = time + offset;
	const crawlC = time + offset * 2;
	for (const index of crawlAVertexIndices) {
		uvs[index * 2 + 1] = crawlA;
	}
	for (const index of crawlBVertexIndices) {
		uvs[index * 2 + 1] = crawlB;
	}
	for (const index of crawlCVertexIndices) {
		uvs[index * 2 + 1] = crawlC;
	}
	crawlGeometry.attributes.uv.needsUpdate = true;
};

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

	horizon.position.set(airplane.position.x, airplane.position.y + 25, airplane.position.z);
};

const animate = () => {
	requestAnimationFrame(animate);

	accumulatedDelta += clock.getDelta();
	if (accumulatedDelta < 1 / data.targetFPS) {
		return;
	}
	const delta = accumulatedDelta;
	accumulatedDelta %= 1 / data.targetFPS;

	updatePoolGeometry(clock.elapsedTime);
	updateCrawlGeometry(clock.elapsedTime);
	updateAirplane(delta);

	renderer.render(scene, camera);
};

init();
