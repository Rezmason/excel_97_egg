import { loadTerrainBitmap } from "./utils.js";

const modulo = (a, n) => ((a % n) + n) % n;

const loadMapData = async (data) => {
	const [elevation, brightness, region] = await Promise.all(
		[data.elevation, data.brightness, data.region].map(loadTerrainBitmap)
	);

	const numColumns = elevation[0].length;
	const numRows = elevation.length;

	return {
		maps: {
			elevation,
			brightness,
			region,
		},
		numRows,
		numColumns,
	};
};

const isOnRegionEdge = ({ maps, numRows, numColumns }, regionIndex, x, y) =>
	regionIndex !== maps.region[y][x] ||
	regionIndex !== maps.region[y][modulo(x - 1, numColumns)] ||
	regionIndex !== maps.region[modulo(y - 1, numRows)][x];

const generateQuads = (data, mapData) => {
	const { brightnessAdd, brightnessMult, size } = data;
	const { maps, numRows, numColumns } = mapData;
	const scale = [size / numColumns, size / numRows];

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

	const getVertexPositions = (vertices, vertIndex) =>
		vertices
			.map((_, index) => {
				const mappedIndex =
					vertIndex == null ? index : vertIndices[index][vertIndex];
				const [x, y] = vertices[mappedIndex];
				const offset = quadCornerOffsets[mappedIndex];
				return [
					(offset[0] - 0.5) * scale[0],
					(offset[1] - 0.5) * scale[1],
					-maps.elevation[y][x],
				];
			})
			.flat();

	return maps.elevation.map((row, y) =>
		row.map((_, x) => {
			const id = y * numRows + x;
			const centroid = [
				modulo(x + 0.5, numColumns) * scale[0],
				modulo(y + 0.5, numRows) * scale[1],
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
			const regionIndex = maps.region[y][x];
			const region = data.regions[regionIndex];
			const textureScale = region.scale ?? [1, 1];
			const textureOffset = region.offset ?? [0, 0];

			const quadElevations = vertices.map(([x, y]) => maps.elevation[y][x]);
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
							maps.brightness[y][x] * data.brightnessMult + data.brightnessAdd
					),
					waveAmplitude: vertices
						.map(([x, y]) =>
							region.waveAmplitude != null &&
							!isOnRegionEdge(mapData, regionIndex, x, y)
								? region.waveAmplitude
								: 0
						)
						.flat(),
					wavePhase: vertices.map(([x, y]) => ((x * y) % 2) * 0.5).flat(),
				},
			};
		})
	);
};

export default async (data) => {
	const size = data.size;
	const mapData = await loadMapData(data.maps);

	const quads = generateQuads(data, mapData);
	const allQuads = quads.flat();
	const vertexAttributeNames = Object.keys(allQuads[0].vertexData);
	const attributes = Object.fromEntries(
		vertexAttributeNames.map((name) => [
			"a" + name[0].toUpperCase() + name.substr(1),
			allQuads.map((quad) => quad.vertexData[name]).flat(),
		])
	);

	const { numRows, numColumns } = mapData;
	const numVerticesPerQuad = 6;
	const numVertices = numVerticesPerQuad * numColumns * numRows;

	const getQuadAt = (x, y) => {
		const column = modulo(
			Math.round(-x * (numColumns / data.size) - 0.5),
			numColumns
		);
		const row = modulo(Math.round(-y * (numRows / data.size) - 0.5), numRows);
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
