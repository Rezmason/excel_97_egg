const coarse = (value, granularity = 1000) => Math.round(value * granularity) / granularity;

const loader = new THREE.TextureLoader();

const loadTexture = (path, pixely = true, repeat = null) => {
	const texture = loader.load(path);
	if (pixely) {
		texture.minFilter = THREE.NearestFilter;
		texture.magFilter = THREE.NearestFilter;
	}
	if (repeat != null) {
		texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
		texture.repeat.set(repeat, repeat);
	}
	return texture;
};

export { coarse, loadTexture };
