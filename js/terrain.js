const heightmapSize = 64;
const heightmapRepeat = 4;
const terrainSize = heightmapSize * heightmapRepeat;

const getHeight = (heights, x, y) => heights[y % heightmapSize][x % heightmapSize];

const isInZone = (x, y, offset, zone) => {
	x = x % heightmapSize;
	y = y % heightmapSize;
	return x > zone.x - offset && x < zone.x + zone.width - 1 + offset && y > zone.y - offset && y < zone.y + zone.height - 1 + offset;
};

const isInZones = (x, y, offset, zones) => {
	return zones.some(zone => isInZone(x, y, offset, zone));
};

const computeVertexLighting = (heights, x, y, lightingMagnifier) => {
	const height = getHeight(heights, x, y);
	const north = getHeight(heights, x, y + heightmapSize - 1);
	const south = getHeight(heights, x, y + heightmapSize + 1);
	const west = getHeight(heights, x + heightmapSize - 1, y);
	const east = getHeight(heights, x + heightmapSize + 1, y);
	let lighting = (north + south + east + west) / 2 - height * 2;
	lighting = (lighting - 1) * lightingMagnifier + 1;
	lighting = THREE.MathUtils.clamp(lighting, 0, 1);
	return lighting;
};

const createTerrainGeometry = (data, params) => {
	const { heights, zones } = data;
	const zoneName = params.zoneName;
	const exclusiveToZone = params.exclusiveToZone ?? true;
	const lightingMagnifier = params.lightingMagnifier ?? 1;
	const geometry = new THREE.PlaneGeometry(data.width * heightmapRepeat, data.width * heightmapRepeat, terrainSize, terrainSize);
	geometry.rotateX(-Math.PI / 2);

	const zone = zones[zoneName];
	const unwantedZones = exclusiveToZone
		? Object.entries(zones)
				.filter(entry => entry[0] !== zoneName)
				.map(entry => entry[1])
		: [];

	const positions = geometry.attributes.position;
	const unwantedVertexIndices = new Set();
	geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(positions.count * 3), 3));
	const colors = geometry.attributes.color;
	for (let y = 0; y <= terrainSize; y++) {
		for (let x = 0; x <= terrainSize; x++) {
			const index = y * (terrainSize + 1) + x;
			positions.setY(index, getHeight(heights, x, y));
			let lighting;

			if (zone != null && isInZone(x, y, 1, zones[zoneName]) && params.useBakedLighting) {
				lighting = zone.lighting[(y % heightmapSize) - zone.y][(x % heightmapSize) - zone.x];
			} else {
				lighting = computeVertexLighting(heights, x, y, lightingMagnifier);
			}
			colors.setXYZ(index, lighting, lighting, lighting);

			if (zoneName != null && !isInZone(x, y, 1, zones[zoneName])) {
				unwantedVertexIndices.add(index);
			} else if (isInZones(x, y, 0, unwantedZones)) {
				unwantedVertexIndices.add(index);
			}
		}
	}

	// Collapse any faces that shouldn't draw. Lazy but it works.
	const indices = geometry.index.array;
	const numQuads = indices.length / 6;
	for (let i = 0; i < numQuads; i++) {
		if (indices.slice(i * 6, (i + 1) * 6).some(i => unwantedVertexIndices.has(i))) {
			indices[i * 6 + 2] = indices[i * 6 + 1] = indices[i * 6 + 0];
			indices[i * 6 + 5] = indices[i * 6 + 4] = indices[i * 6 + 3];
		}
	}

	return geometry;
};

export { heightmapSize, terrainSize, getHeight, isInZone, isInZones, createTerrainGeometry };
