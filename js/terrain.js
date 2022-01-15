const modulo = (a, n) => ((a % n) + n) % n;

export default (data) => {
	const { elevations } = data;
	const [numColumns, numRows, size] = [
		elevations[0].length,
		elevations.length,
		data.size,
	];

	const defaultZone = data.zones[data.zones.length - 1];

	const getZone = (x, y, minOffset, maxOffset) => {
		return (
			data.zones.find(
				(zone) =>
					x >= zone.x + minOffset &&
					x < zone.x + zone.width - maxOffset &&
					y >= zone.y + minOffset &&
					y < zone.y + zone.height - maxOffset
			) ?? defaultZone
		);
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
			const zone = getZone(
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
					whichTexture: vertices.map((_) => zone.texture).flat(),
					uv:
						zone.name === "credits"
							? quadCornerOffsets
									.map(([u, v]) => [
										(u + 0.5 + x - zone.x) / (zone.width - 1) - 0.5,
										(v + 0.5 + y - zone.y) / (zone.height - 1) - 0.5,
									])
									.flat()
							: quadCornerOffsets.flat(),
					brightness: vertices
						.map(([x, y]) => {
							let brightness;
							if (zone.brightness != null) {
								brightness = zone.brightness[y - zone.y][x - zone.x];
							} else {
								const elevation = elevations[y][x];
								const north = elevations[modulo(y - 1, numRows)][x];
								const south = elevations[modulo(y + 1, numRows)][x];
								const west = elevations[y][modulo(x - 1, numColumns)];
								const east = elevations[y][modulo(x + 1, numColumns)];
								brightness = (north + south + east + west) / 2 - elevation * 2;
								brightness = (brightness - 1) * zone.brightnessMagnifier + 1;
							}
							return Math.max(0, Math.min(1, brightness));
						})
						.flat(),
					waveAmplitude: vertices
						.map(([x, y]) =>
							zone.name === "pool" && getZone(x, y, 1, 1).name === zone.name
								? data.waveAmplitude
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
