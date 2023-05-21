import makeTerrain from "./terrain.js";

export default fetch("assets/data.json").then(async (response) => {
	const data = await response.json();
	const terrain = await makeTerrain(data);
	return {
		data,
		terrain,
	};
});
