import { terrainSize, isInZone } from "./terrain.js";

const setupPool = (geometry, zone) => {
	geometry.attributes.position.usage = THREE.DynamicDrawUsage;
	geometry.attributes.color.usage = THREE.DynamicDrawUsage;
	const points = { a: [], b: [] };
	for (let y = 0; y <= terrainSize; y++) {
		for (let x = 0; x <= terrainSize; x++) {
			if (isInZone(x, y, 0, zone)) {
				const index = y * (terrainSize + 1) + x;
				if (x % 2 == 0 || y % 2 == 0) {
					points.a.push(index);
				} else {
					points.b.push(index);
				}
			}
		}
	}
	return points;
};

const updatePool = (geometry, points, time) => {
	const positions = geometry.attributes.position.array;
	const colors = geometry.attributes.color.array;

	const waveA = Math.sin(time * 10) * 2;
	const posA = waveA - 25;
	const lightingA = 1 - waveA * 0.15;

	const waveB = -waveA;
	const posB = waveB - 25;
	const lightingB = 1 - waveB * 0.15;

	for (const index of points.a) {
		positions[index * 3 + 1] = posA;
		colors[index * 3 + 0] = lightingA;
		colors[index * 3 + 1] = lightingA;
		colors[index * 3 + 2] = lightingA;
	}
	for (const index of points.b) {
		positions[index * 3 + 1] = posB;
		colors[index * 3 + 0] = lightingB;
		colors[index * 3 + 1] = lightingB;
		colors[index * 3 + 2] = lightingB;
	}
	geometry.attributes.position.needsUpdate = true;
	geometry.attributes.color.needsUpdate = true;
};

export { setupPool, updatePool };
