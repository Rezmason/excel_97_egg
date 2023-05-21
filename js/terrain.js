import { loadTerrainBitmap } from "./utils.js";

const modulo = (a, n) => ((a % n) + n) % n;

export default async (data) => {
	const [elevationMap, brightnessMap, regionMap] = await Promise.all([
		loadTerrainBitmap(data.terrain.maps.elevation, 128),
		loadTerrainBitmap(data.terrain.maps.brightness, 128),
		loadTerrainBitmap(data.terrain.maps.region),
	]);

	const [numColumns, numRows, size] = [
		elevationMap[0].length,
		elevationMap.length,
		data.terrain.size,
	];

	const quadCornerOffsets = [
		[-0.5, -0.5],
		[-0.5, 0.5],
		[0.5, -0.5],
		[0.5, 0.5],
		[0.5, -0.5],
		[-0.5, 0.5],
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

	const getVertexPositions = (vertices, vertIndex) =>
		vertices
			.map((_, index) => {
				const mappedIndex =
					vertIndex == null ? index : vertIndices[index][vertIndex];
				const [x, y] = vertices[mappedIndex];
				return [
					(quadCornerOffsets[mappedIndex][0] * size) / numColumns,
					(quadCornerOffsets[mappedIndex][1] * size) / numRows,
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
			const region = data.terrain.regions[regionIndex];

			const quadElevations = vertices.map(([x, y]) => elevationMap[y][x]);
			const pointy = Math.abs(
				Math.abs(quadElevations[0] - quadElevations[2]) -
					Math.abs(quadElevations[1] - quadElevations[3])
			);

			const uvScale = region.scale ?? [1, 1];
			const uvOffset = region.offset ?? [0, 0];

			return {
				id,
				altitude: Math.max(...quadElevations),
				vertexData: {
					id: vertices.map((_) => id).flat(),
					centroid: vertices.map((_) => centroid).flat(),
					pointy: vertices.map((_) => pointy).flat(),
					position: getVertexPositions(vertices),
					position0: getVertexPositions(vertices, 0),
					position1: getVertexPositions(vertices, 1),
					position2: getVertexPositions(vertices, 2),
					barycentrics,
					whichTexture: vertices.map((_) => region.texture).flat(),
					uv: quadCornerOffsets
						.map(([u, v]) => [
							(u + 0.5 + uvOffset[0]) * uvScale[0] - 0.5,
							(v + 0.5 + uvOffset[1]) * uvScale[1] - 0.5,
						])
						.flat(),
					brightnessMap: vertices.map(([x, y]) => 1),
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
	const attributes = {
		aQuadID: allQuads.map((quad) => quad.vertexData.id).flat(),
		aCentroid: allQuads.map((quad) => quad.vertexData.centroid).flat(),
		aPointyQuad: allQuads.map((quad) => quad.vertexData.pointy).flat(),
		aBarycentrics: allQuads.map((quad) => quad.vertexData.barycentrics).flat(),
		aPosition: allQuads.map((quad) => quad.vertexData.position).flat(),

		aPosition0: allQuads.map((quad) => quad.vertexData.position0).flat(),
		aPosition1: allQuads.map((quad) => quad.vertexData.position1).flat(),
		aPosition2: allQuads.map((quad) => quad.vertexData.position2).flat(),

		aWhichTexture: allQuads.map((quad) => quad.vertexData.whichTexture).flat(),
		aUV: allQuads.map((quad) => quad.vertexData.uv).flat(),
		aBrightness: allQuads.map((quad) => quad.vertexData.brightnessMap).flat(),
		aWaveAmplitude: allQuads
			.map((quad) => quad.vertexData.waveAmplitude)
			.flat(),
		aWavePhase: allQuads.map((quad) => quad.vertexData.wavePhase).flat(),
	};
	const numVerticesPerQuad = 6;
	const numVertices = numVerticesPerQuad * numColumns * numRows;

	const getQuadAt = (x, y) => {
		const column = modulo(Math.round((-x * numColumns) / size), numColumns);
		const row = modulo(Math.round((-y * numRows) / size), numRows);
		return quads[row][column];
	};

	const terrain = {
		attributes,
		numVertices,
		numColumns,
		numRows,
		size,
		getQuadAt,
	};

	return terrain;
};
