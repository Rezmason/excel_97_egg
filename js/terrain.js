const verticesPerQuad = 6;

const modulo = (a, n) => ((a % n) + n) % n;

export default (data) => {
	const elevations = data.heights;

	const [width, height, size] = [
		elevations[0].length,
		elevations.length,
		data.width,
	];
	const scale = size / width;
	const numQuads = width * height;

	const positions = elevations.map((row, y) =>
		row.map((elevation, x) => [x * scale, y * scale, -elevation])
	);
	const brightnessMagnifier = 0.06;
	const brightnesses = elevations.map((row, y) =>
		row.map((elevation, x) => {
			const north = elevations[modulo(y - 1, height)][x];
			const south = elevations[modulo(y + 1, height)][x];
			const west = elevations[y][modulo(x - 1, width)];
			const east = elevations[y][modulo(x + 1, width)];
			let brightness = (north + south + east + west) / 2 - elevation * 2;
			brightness = (brightness - 1) * brightnessMagnifier + 1;
			brightness = Math.max(0, Math.min(1, brightness));
			return brightness;
		})
	);

	const quads = elevations
		.map((row, y) =>
			row.map((_, x) => {
				const nx = (x + 1) % width;
				const ny = (y + 1) % height;
				const vertices = [
					[x, y],
					[nx, y],
					[x, ny],
					[nx, y],
					[x, ny],
					[nx, ny],
				];
				if (nx < x || ny < y) {
					return {
						position: Array(6 * 3).fill(0),
						brightness: Array(6).fill(0),
					};
				}
				return {
					position: vertices.map(([x, y]) => positions[y][x]).flat(),
					brightness: vertices.map(([x, y]) => brightnesses[y][x]).flat(),
				};
			})
		)
		.flat();

	const attributes = {
		aPosition: quads.map((quad) => quad.position).flat(),
		aBrightness: quads.map((quad) => quad.brightness).flat(),
	};
	const numVertices = verticesPerQuad * numQuads;

	return { attributes, numVertices, scale };
};
