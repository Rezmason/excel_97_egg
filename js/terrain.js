const modulo = (a, n) => ((a % n) + n) % n;

export default (data) => {
	const elevations = data.terrain.z;
	const [numColumns, numRows, size] = [
		elevations[0].length,
		elevations.length,
		data.terrain.size,
	];

	const defaultRegion = data.terrain.regions[data.terrain.regions.length - 1];

	const getRegion = (x, y, minOffset, maxOffset) => {
		const region = data.terrain.regions.find(
			(region) =>
				x >= region.x + minOffset &&
				x < region.x + region.width - maxOffset &&
				y >= region.y + minOffset &&
				y < region.y + region.height - maxOffset
		);

		if (region == null) {
			return defaultRegion;
		}

		return region;
	};

	const quadCornerOffsets = [
		[-0.5, -0.5],
		[-0.5, 0.5],
		[0.5, -0.5],
		[0.5, -0.5],
		[-0.5, 0.5],
		[0.5, 0.5],
	];

	const quads = elevations.map((row, y) =>
		row.map((_, x) => {
			const id = y * numRows + x;
			const centroid = [
				(modulo(x + 0.5, numColumns) * size) / numColumns,
				(modulo(y + 0.5, numRows) * size) / numRows,
			];

			const nx = modulo(x + 1, numColumns);
			const ny = modulo(y + 1, numRows);
			const [tl, tr, bl, br] = [
				[x, y],
				[nx, y],
				[x, ny],
				[nx, ny],
			];
			const vertices = [tl, bl, tr, tr, bl, br];
			const region = getRegion(
				modulo(x + 0.5, numColumns),
				modulo(y + 0.5, numRows),
				0,
				1
			);
			return {
				id,
				altitude: Math.max(...vertices.map(([x, y]) => elevations[y][x])),
				vertexData: {
					id: vertices.map((_) => id).flat(),
					centroid: vertices.map((_) => centroid).flat(),
					position: vertices
						.map(([x, y], index) => [
							(quadCornerOffsets[index][0] * size) / numColumns,
							(quadCornerOffsets[index][1] * size) / numRows,
							-elevations[y][x],
						])
						.flat(),
					whichTexture: vertices.map((_) => region.texture).flat(),
					uv:
						region.name === "credits"
							? quadCornerOffsets
									.map(([u, v]) => [
										(u + 0.5 + x - region.x) / (region.width - 1) - 0.5,
										(v + 0.5 + y - region.y) / (region.height - 1) - 0.5,
									])
									.flat()
							: quadCornerOffsets.flat(),
					brightness: vertices
						.map(([x, y]) => {
							let brightness;
							if (region.brightness != null) {
								brightness = region.brightness[y - region.y][x - region.x];
							} else {
								const elevation = elevations[y][x];
								const north = elevations[modulo(y - 1, numRows)][x];
								const south = elevations[modulo(y + 1, numRows)][x];
								const west = elevations[y][modulo(x - 1, numColumns)];
								const east = elevations[y][modulo(x + 1, numColumns)];
								brightness = (north + south + east + west) / 2 - elevation * 2;
								brightness = (brightness - 1) * region.brightnessMagnifier + 1;
							}
							return Math.max(0, Math.min(1, brightness));
						})
						.flat(),
					waveAmplitude: vertices
						.map(([x, y]) =>
							region.name === "pool" &&
							getRegion(x, y, 1, 1).name === region.name
								? data.terrain.waveAmplitude
								: 0
						)
						.flat(),
					wavePhase: vertices.map(([x, y]) => ((x * y) % 2) * 0.5).flat(),
				},
			};
		})
	);
	const allQuads = quads.flat();
	const attributes = {
		aQuadID: allQuads.map((quad) => quad.vertexData.id).flat(),
		aCentroid: allQuads.map((quad) => quad.vertexData.centroid).flat(),
		aPosition: allQuads.map((quad) => quad.vertexData.position).flat(),
		aWhichTexture: allQuads.map((quad) => quad.vertexData.whichTexture).flat(),
		aUV: allQuads.map((quad) => quad.vertexData.uv).flat(),
		aBrightness: allQuads.map((quad) => quad.vertexData.brightness).flat(),
		aWaveAmplitude: allQuads
			.map((quad) => quad.vertexData.waveAmplitude)
			.flat(),
		aWavePhase: allQuads.map((quad) => quad.vertexData.wavePhase).flat(),
	};
	const numVerticesPerQuad = 6;
	const numVertices = numVerticesPerQuad * numColumns * numRows;

	const getQuadAt = (x, y, altitude) => {
		const column = modulo(Math.round((-x * numColumns) / size), numColumns);
		const row = modulo(Math.round((-y * numRows) / size), numRows);
		return quads[row][column];
	};

	const terrain = {
		attributes,
		numVertices,
		size,
		getQuadAt,
	};

	return terrain;
};
