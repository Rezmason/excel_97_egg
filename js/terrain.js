import { loadTerrainBitmap } from "./utils.js";

const modulo = (a, n) => ((a % n) + n) % n;

const sixup = (a) => Array(6).fill(a);

const quadCornerOffsets = [
	[0, 0],
	[0, 1],
	[1, 0],
	[1, 1],
	[1, 0],
	[0, 1],
];

const vertIndices = [
	[0, 1, 2],
	[0, 1, 2],
	[0, 1, 2],
	[3, 4, 5],
	[3, 4, 5],
	[3, 4, 5],
];

const barycentrics = [
	[1, 0, 0],
	[0, 1, 0],
	[0, 0, 1],
	[1, 0, 0],
	[0, 1, 0],
	[0, 0, 1],
];

export default async (data) => {
	const [elevationMap, brightnessMap, regionMap] = await Promise.all(
		[data.maps.elevation, data.maps.brightness, data.maps.region].map(
			loadTerrainBitmap
		)
	);

	const numColumns = elevationMap[0].length;
	const numRows = elevationMap.length;
	const size = data.size;

	const getVertexPositions = (vertices, vertIndex) =>
		vertices
			.map((_, index) => {
				const mappedIndex =
					vertIndex == null ? index : vertIndices[index][vertIndex];
				const [x, y] = vertices[mappedIndex];
				const offset = quadCornerOffsets[mappedIndex];
				return [
					((offset[0] - 0.5) * size) / numColumns,
					((offset[1] - 0.5) * size) / numRows,
					-elevationMap[y][x],
				];
			})
			.flat();

	const isOnRegionEdge = (x, y, regionIndex) =>
		regionIndex !== regionMap[y][x] ||
		regionIndex !== regionMap[y][modulo(x - 1, numColumns)] ||
		regionIndex !== regionMap[modulo(y - 1, numRows)][x];

	const quads = elevationMap.map((row, y) =>
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
			const vertices = [tl, bl, tr, br, tr, bl];
			const regionIndex = regionMap[y][x];
			const region = data.regions[regionIndex];
			const textureScale = region.scale ?? [1, 1];
			const textureOffset = region.offset ?? [0, 0];

			const quadElevations = vertices.map(([x, y]) => elevationMap[y][x]);
			const altitude = Math.max(...quadElevations);
			const pointy = Math.abs(
				Math.abs(quadElevations[0] - quadElevations[2]) -
					Math.abs(quadElevations[1] - quadElevations[3])
			);

			return {
				id,
				altitude,
				vertexData: {
					quadID: sixup(id),
					centroid: sixup(centroid),
					pointyQuad: sixup(pointy),
					position: getVertexPositions(vertices),
					position0: getVertexPositions(vertices, 0),
					position1: getVertexPositions(vertices, 1),
					position2: getVertexPositions(vertices, 2),
					barycentrics,
					whichTexture: sixup(region.texture),
					texCoord: quadCornerOffsets
						.map(([u, v]) => [
							(u + textureOffset[0]) * textureScale[0],
							(v + textureOffset[1]) * textureScale[1],
						])
						.flat(),
					brightness: vertices.map(
						([x, y]) =>
							brightnessMap[y][x] * data.brightnessMult + data.brightnessAdd
					),
					waveAmplitude: vertices
						.map(([x, y]) =>
							region.waveAmplitude != null && !isOnRegionEdge(x, y, regionIndex)
								? region.waveAmplitude
								: 0
						)
						.flat(),
					wavePhase: vertices.map(([x, y]) => ((x * y) % 2) * 0.5).flat(),
				},
			};
		})
	);
	const allQuads = quads.flat();
	const vertexAttributeNames = Object.keys(allQuads[0].vertexData);
	const attributes = Object.fromEntries(
		vertexAttributeNames.map((name) => [
			"a" + name[0].toUpperCase() + name.substr(1),
			allQuads.map((quad) => quad.vertexData[name]).flat(),
		])
	);
	const numVerticesPerQuad = 6;
	const numVertices = numVerticesPerQuad * numColumns * numRows;

	const getQuadAt = (x, y) => {
		const column = modulo(
			Math.round(-x * (numColumns / size) - 0.5),
			numColumns
		);
		const row = modulo(Math.round(-y * (numRows / size) - 0.5), numRows);
		return quads[row][column];
	};

	return {
		attributes,
		numVertices,
		numColumns,
		numRows,
		size,
		getQuadAt,
	};
};
