const modulo = (a, n) => ((a % n) + n) % n;

export default (data) => {
	const { elevations } = data;
	const [numColumns, numRows, size] = [
		elevations[0].length,
		elevations.length,
		data.size,
	];

	const defaultZone = data.zones[data.zones.length - 1];

	const getZone = (x, y, offset) => {
		return (
			data.zones.find(
				(zone) =>
					x >= zone.x &&
					x < zone.x + zone.numColumns - offset &&
					y >= zone.y &&
					y < zone.y + zone.numRows - offset
			) ?? defaultZone
		);
	};

	const quadCornerOffsets = [
		[-0.5, -0.5],
		[0.5, -0.5],
		[-0.5, 0.5],
		[0.5, -0.5],
		[-0.5, 0.5],
		[0.5, 0.5],
	];

	const quads = elevations
		.map((row, y) =>
			row.map((_, x) => {
				const nx = modulo(x + 1, numColumns);
				const ny = modulo(y + 1, numRows);
				const [tl, tr, bl, br] = [
					[x, y],
					[nx, y],
					[x, ny],
					[nx, ny],
				];
				const vertices = [tl, tr, bl, tr, bl, br];
				const zone = getZone(
					modulo(x + 0.5, numColumns),
					modulo(y + 0.5, numRows),
					1
				);
				const centroid = [
					(modulo(x + 0.5, numColumns) * size) / numColumns,
					(modulo(y + 0.5, numRows) * size) / numRows,
				];
				return {
					position: vertices
						.map(([x, y], index) => [
							(quadCornerOffsets[index][0] * size) / numColumns,
							(quadCornerOffsets[index][1] * size) / numRows,
							-elevations[y][x],
						])
						.flat(),
					uv:
						zone.texture === 2
							? quadCornerOffsets
									.map(([u, v]) => [
										(u + 0.5 + x - zone.x) / (zone.numColumns - 1) - 0.5,
										(v + 0.5 + y - zone.y) / (zone.numRows - 1) - 0.5,
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
					centroid: vertices.map((_) => centroid).flat(),
					whichTexture: vertices.map((_) => zone.texture).flat(),
				};
			})
		)
		.flat();

	const attributes = {
		aPosition: quads.map((quad) => quad.position).flat(),
		aUV: quads.map((quad) => quad.uv).flat(),
		aBrightness: quads.map((quad) => quad.brightness).flat(),
		aCentroid: quads.map((quad) => quad.centroid).flat(),
		aWhichTexture: quads.map((quad) => quad.whichTexture).flat(),
	};
	const numVerticesPerQuad = 6;
	const numVertices = numVerticesPerQuad * numColumns * numRows;

	return { attributes, numVertices, size };
};
