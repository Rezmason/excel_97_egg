const loadShaderSet = async (prefix) => {
	const [horizonVert, horizonFrag, terrainVert, terrainFrag] =
		await Promise.all(
			[
				`glsl/${prefix}/horizon.vert`,
				`glsl/${prefix}/horizon.frag`,
				`glsl/${prefix}/terrain.vert`,
				`glsl/${prefix}/terrain.frag`,
			].map((url) => fetch(url).then((response) => response.text()))
		);
	return {
		horizonVert,
		horizonFrag,
		terrainVert,
		terrainFrag,
	};
};

const loadImage = async (url, isSDF, anisotropicLevels) => {
	const image = new Image();
	image.crossOrigin = "anonymous";
	image.src = url;
	await image.decode();

	const isNPOT =
		Math.log2(image.width) % 1 > 0 || Math.log2(image.height) % 1 > 0;

	const mipmap = !isNPOT && !isSDF;

	return {
		image: {
			data: image,
			mipmap,
			anisotropic: anisotropicLevels,
			min: mipmap ? "mipmap" : "linear",
			mag: "linear",
		},
	};
};

const littleEndian = (() => {
	const buffer = new ArrayBuffer(2);
	new DataView(buffer).setInt16(0, 256, true);
	return new Int16Array(buffer)[0] === 256;
})();

const loadIndexedBitmap = async (url) => {
	const file = await fetch(url).then((response) => response.arrayBuffer());
	const header = new DataView(file);

	// assert "BM" DIB
	if (header.getUint16(0) !== 0x424d) {
		throw new Error(`file at ${url} is not properly formatted.`);
	}

	// Assert 8 bits per pixel
	const bitsPerPixel = header.getUint16(28, littleEndian);
	if (bitsPerPixel !== 8) {
		throw new Error(`Bitmap ${url} has the wrong bpp.`);
	}

	const colorTableSize =
		header.getUint32(46, littleEndian) || 1 << bitsPerPixel;

	const colorTableBytes = new Uint8Array(file, 54, colorTableSize * 4);
	const colorTable = Array(colorTableSize)
		.fill()
		.map((_, index) => [
			colorTableBytes[index * 4 + 2],
			colorTableBytes[index * 4 + 1],
			colorTableBytes[index * 4 + 0],
		]);
	const colorTableWidth = 1 << Math.ceil(bitsPerPixel / 2);

	const width = header.getUint32(18, littleEndian);
	const height = header.getUint32(22, littleEndian);
	const pixelStart = header.getUint32(10, littleEndian);
	let pixels = Array(height)
		.fill()
		.map((_, index) =>
			Array.from(new Uint8Array(file, pixelStart + width * index, width))
		)
		.reverse()
		.flat();

	return {
		image: {
			format: "luminance",
			type: "uint8",
			width,
			height,
			data: pixels,
		},
		colorTable: {
			format: "rgb",
			type: "uint8",
			wrapS: "clamp",
			wrapT: "clamp",
			width: colorTableWidth,
			height: colorTableWidth,
			data: colorTable,
		},
	};
};

const loadColorTable = async (regl, url, linear) =>
	regl.texture({
		...(await loadIndexedBitmap(url)).colorTable,
		min: linear ? "linear" : "nearest",
		mag: linear ? "linear" : "nearest",
	});

const loadTexturePack = async (regl, pack) => {
	const textures = await Promise.all(
		Object.values(pack.textures).map(async (entry) => {
			const isIndexedColor = entry.type === "indexed_color";
			if (isIndexedColor) {
				return regl.texture((await loadIndexedBitmap(entry.url)).image);
			} else {
				const isSDF = entry.type === "sdf";
				return regl.texture(
					(await loadImage(entry.url, isSDF, pack.anisotropicLevels)).image
				);
			}
		})
	);
	return Object.fromEntries(
		Object.keys(pack.textures).map((key, index) => [key, textures[index]])
	);
};

export { loadShaderSet, loadColorTable, loadTexturePack };
