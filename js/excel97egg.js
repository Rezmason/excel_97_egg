import Controls from "./controls.js";
import CreditMaterial from "./creditmaterial.js";

const renderScale = 0.25;
let windowWidth, windowHeight;

const maxDrawDistance = 1000;
let data, poolAVertexIndices, poolBVertexIndices, crawlAVertexIndices, crawlBVertexIndices, crawlCVertexIndices;
let debugDiv;
let camera, airplane, controls, scene, renderer;
let horizon;
let poolGeometry;
let crawlGeometry;

const targetFrameDuration = 1 / 15;
let frameDuration = 0;

const worldWidth = 256;
const clock = new THREE.Clock();

const isInZone = (x, y, offset, zone) => {
	x = x % 64;
	y = y % 64;
	return x > zone.x - offset && x < zone.x + zone.width - 1 + offset && y > zone.y - offset && y < zone.y + zone.height - 1 + offset;
};

const isInZones = (x, y, offset, zones) => {
	return zones.some(zone => isInZone(x, y, offset, zone));
};

const createTerrainGeometry = ({ heights, zones }, zoneName, exclusive, lightingMagnifier, useBakedLighting) => {
	const geometry = new THREE.PlaneGeometry(8000, 8000, worldWidth, worldWidth);
	geometry.rotateX(-Math.PI / 2);

	const zone = zones[zoneName];
	const badZones = exclusive
		? Object.entries(zones)
				.filter(entry => entry[0] !== zoneName)
				.map(entry => entry[1])
		: [];

	const positions = geometry.attributes.position.array;
	const indices = geometry.index.array;
	const unwantedVertexIndices = new Set();
	geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(positions.length), 3));
	const colors = geometry.attributes.color.array;
	for (let y = 0; y <= worldWidth; y++) {
		for (let x = 0; x <= worldWidth; x++) {
			const index = y * (worldWidth + 1) + x;
			positions[index * 3 + 1] = heights[y % 64][x % 64];
			let lighting;

			if (zone != null && isInZone(x, y, 1, zones[zoneName]) && useBakedLighting) {
				lighting = zone.lighting[(y % 64) - zone.y][(x % 64) - zone.x];
			} else {
				const height = heights[y % 64][x % 64];

				const northSlope = heights[(y + 64 - 1) % 64][x % 64] - height;
				const southSlope = heights[(y + 64 + 1) % 64][x % 64] - height;
				const verticalSlopeDifference = southSlope + northSlope;

				const westSlope = heights[y % 64][(x + 64 - 1) % 64] - height;
				const eastSlope = heights[y % 64][(x + 64 + 1) % 64] - height;
				const horizontalSlopeDifference = eastSlope + westSlope;

				lighting = (horizontalSlopeDifference + verticalSlopeDifference) / 2;
				lighting = (lighting - 1) * lightingMagnifier + 1;
				lighting = THREE.MathUtils.clamp(lighting, 0, 1);
			}

			colors[index * 3 + 0] = lighting;
			colors[index * 3 + 1] = lighting;
			colors[index * 3 + 2] = lighting;

			if (zoneName != null && !isInZone(x, y, 1, zones[zoneName])) {
				unwantedVertexIndices.add(index);
			} else if (isInZones(x, y, 0, badZones)) {
				unwantedVertexIndices.add(index);
			}
		}
	}
	const numQuads = indices.length / 6;
	for (let i = 0; i < numQuads; i++) {
		if (indices.slice(i * 6, (i + 1) * 6).some(i => unwantedVertexIndices.has(i))) {
			indices[i * 6 + 2] = indices[i * 6 + 1] = indices[i * 6 + 0];
			indices[i * 6 + 5] = indices[i * 6 + 4] = indices[i * 6 + 3];
		}
	}
	return geometry;
};

const init = async () => {
	data = await fetch("assets/data.json").then(response => response.json());

	const loader = new THREE.TextureLoader();
	// await all the textures

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

	const horizonTexture = loader.load("assets/horizon_screenshot.png");
	horizonTexture.repeat.set(1, 1);
	horizonTexture.minFilter = THREE.NearestFilter;
	horizonTexture.magFilter = THREE.NearestFilter;

	const horizonGeometry = new THREE.CylinderGeometry(maxDrawDistance - 5, maxDrawDistance - 5, 64, 100, 1, true);

	horizon = new THREE.Mesh(horizonGeometry, new THREE.MeshBasicMaterial({ map: horizonTexture, side: THREE.BackSide }));
	horizon.material.fog = false;
	horizon.position.copy(airplane.position);
	scene.add(horizon);

	// Spawn
	airplane.position.set(0, 45, 0);
	airplane.rotation.set(0, Math.PI * 1.55, 0);
	airplane.rotation.set(0, Math.PI * 1.725, 0);

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

	const moonscapeTexture = loader.load("assets/moonscape_brighter.png");
	moonscapeTexture.wrapS = moonscapeTexture.wrapT = THREE.RepeatWrapping;
	moonscapeTexture.repeat.set(256, 256);
	moonscapeTexture.minFilter = THREE.NearestFilter;
	moonscapeTexture.magFilter = THREE.NearestFilter;
	const moonscapeGeometry = createTerrainGeometry(data, null, true, 0.06, false);
	const moonscape = new THREE.Mesh(moonscapeGeometry, new THREE.MeshBasicMaterial({ map: moonscapeTexture, side: THREE.DoubleSide, vertexColors: true }));
	scene.add(moonscape);

	poolGeometry = createTerrainGeometry(data, "pool", true, 0.06, false);
	poolGeometry.attributes.position.usage = THREE.DynamicDrawUsage;
	poolGeometry.attributes.color.usage = THREE.DynamicDrawUsage;
	poolAVertexIndices = [];
	poolBVertexIndices = [];
	const poolZone = data.zones.pool;
	for (let y = 0; y <= worldWidth; y++) {
		for (let x = 0; x <= worldWidth; x++) {
			if (isInZone(x, y, 0, poolZone)) {
				const index = y * (worldWidth + 1) + x;
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

	const regolithTexture = loader.load("assets/regolith_screenshot.png");
	regolithTexture.wrapS = regolithTexture.wrapT = THREE.RepeatWrapping;
	regolithTexture.repeat.set(256, 256);
	regolithTexture.minFilter = THREE.NearestFilter;
	regolithTexture.magFilter = THREE.NearestFilter;

	const platformGeometry = createTerrainGeometry(data, "platform", true, 0.05, true);
	const platform = new THREE.Mesh(platformGeometry, new THREE.MeshBasicMaterial({ map: regolithTexture, side: THREE.DoubleSide, vertexColors: true }));
	scene.add(platform);

	const creditsTexture = loader.load("assets/credits.png");
	creditsTexture.minFilter = THREE.NearestFilter;
	creditsTexture.magFilter = THREE.NearestFilter;

	crawlGeometry = createTerrainGeometry(data, "crawl", false, 0, false);
	crawlGeometry.attributes.uv.usage = THREE.DynamicDrawUsage;
	const crawlUVs = crawlGeometry.attributes.uv.array;
	const crawlColors = crawlGeometry.attributes.color.array;
	crawlAVertexIndices = [];
	crawlBVertexIndices = [];
	crawlCVertexIndices = [];
	const crawlZone = data.zones.crawl;
	for (let y = 0; y <= worldWidth; y++) {
		for (let x = 0; x <= worldWidth; x++) {
			if (isInZone(x, y, 1, crawlZone)) {
				const index = y * (worldWidth + 1) + x;
				const u = 1 - ((x % 64) - data.zones.crawl.x) / 2;
				crawlUVs[index * 2 + 0] = u;
				const v = (y % 64) - data.zones.crawl.y;
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

	controls = new Controls(airplane, renderer.domElement);

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
	const lightingA = 1 - waveA * 0.1;

	const waveB = -waveA;
	const posB = waveB - 25;
	const lightingB = 1 - waveB * 0.1;

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
	time = 1 - ((time * 0.005 + 0.02) % 1);
	const crawlA = time;
	const crawlB = time + 0.01;
	const crawlC = time + 0.01 * 2;
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

const animate = () => {
	requestAnimationFrame(animate);

	frameDuration += clock.getDelta();
	if (frameDuration < targetFrameDuration) {
		return;
	}

	updatePoolGeometry(clock.elapsedTime);
	updateCrawlGeometry(clock.elapsedTime);
	controls.update(frameDuration);
	frameDuration %= targetFrameDuration;

	if (airplane.position.x > 2000) {
		airplane.position.x -= 2000;
	} else if (airplane.position.x < -2000) {
		airplane.position.x += 2000;
	}

	if (airplane.position.z > 2000) {
		airplane.position.z -= 2000;
	} else if (airplane.position.z < -2000) {
		airplane.position.z += 2000;
	}

	const x = Math.round((airplane.position.x / 8000 + 1) * worldWidth) % 64;
	const y = Math.round((airplane.position.z / 8000 + 1) * worldWidth) % 64;
	airplane.position.y = THREE.MathUtils.clamp(airplane.position.y, data.heights[y][x] + 5, 100);

	camera.rotation.z = controls.roll * 0.2375;
	// camera.rotation.z = Math.PI;

	// console.log(Math.round(airplane.position.x), Math.round(airplane.position.z));

	horizon.position.set(airplane.position.x, airplane.position.y + 25, airplane.position.z);

	renderer.render(scene, camera);
};

init();
