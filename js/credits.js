import { heightmapSize, terrainSize, isInZone } from "./terrain.js";

const vertexShader = `
	varying vec2 vUv;
	varying vec3 vColor;
	#ifdef USE_FOG
		varying float fogDepth;
	#endif
	void main() {
		vColor = color;
		vUv = uv;
		vec3 transformed = vec3( position );
		vec4 mvPosition = vec4( transformed, 1.0 );
		mvPosition = modelViewMatrix * mvPosition;
		gl_Position = projectionMatrix * mvPosition;
		#ifdef USE_FOG
			fogDepth = - mvPosition.z;
		#endif
	}
`;

const fragmentShader = `
	varying vec2 vUv;
	varying vec3 vColor;
	uniform sampler2D map;
	uniform vec3 creditColor1;
	uniform vec3 creditColor2;
	uniform vec3 creditColor3;
	uniform vec3 creditColor4;

	#ifdef USE_FOG
		uniform vec3 fogColor;
		varying float fogDepth;
		#ifdef FOG_EXP2
			uniform float fogDensity;
		#else
			uniform float fogNear;
			uniform float fogFar;
		#endif
	#endif

	void main() {
		vec4 texelColor = texture2D( map, vUv );
		gl_FragColor = vec4(1.0);
		if (texelColor.b == 1.0) {
			gl_FragColor.rgb = mix(creditColor2, creditColor1, abs(vColor.r - 1.0));
		} else if (texelColor.g == 1.0) {
			gl_FragColor.rgb = mix(creditColor4, creditColor3, abs(vColor.r - 1.0));
		} else {
			gl_FragColor.rgb *= 0.;
		}

		#ifdef USE_FOG
			#ifdef FOG_EXP2
				float fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogDepth * fogDepth );
			#else
				float fogFactor = smoothstep( fogNear, fogFar, fogDepth );
			#endif
			gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
		#endif
	}
`;

const fogUniforms = {
	fogDensity: { value: 0.00025 },
	fogNear: { value: 1 },
	fogFar: { value: 2000 },
	fogColor: { value: new THREE.Color(0xffffff) }
};

const uniforms = {
	...fogUniforms,
	creditColor1: { value: new THREE.Color(0x000000) },
	creditColor2: { value: new THREE.Color(0xdfdfdf) },
	creditColor3: { value: new THREE.Color(0x30182c /*0x100810*/) },
	creditColor4: { value: new THREE.Color(0xf0841e) }
};

const params = {
	side: THREE.DoubleSide,
	vertexColors: true,
	fog: true,
	vertexShader,
	fragmentShader
};

class CreditsMaterial extends THREE.ShaderMaterial {
	constructor(map) {
		super({
			...params,
			uniforms: {
				...uniforms,
				map: { value: map }
			}
		});
	}
}

const setupCredits = (geometry, zone) => {
	geometry.attributes.uv.usage = THREE.DynamicDrawUsage;
	const uvs = geometry.attributes.uv.array;
	const colors = geometry.attributes.color.array;
	const points = { a: [], b: [], c: [] };
	for (let y = 0; y <= terrainSize; y++) {
		for (let x = 0; x <= terrainSize; x++) {
			if (isInZone(x, y, 1, zone)) {
				const index = y * (terrainSize + 1) + x;
				const u = 1 - ((x % heightmapSize) - zone.x) / 2;
				uvs[index * 2 + 0] = u;
				const v = (y % heightmapSize) - zone.y;
				colors[index * 3 + 0] = v;
				colors[index * 3 + 1] = v;
				colors[index * 3 + 2] = v;
				switch (v) {
					case 0:
						points.a.push(index);
						break;
					case 1:
						points.b.push(index);
						break;
					case 2:
						points.c.push(index);
						break;
				}
			}
		}
	}
	geometry.attributes.color.needsUpdate = true;
	return points;
};

const updateCredits = (geometry, points, time) => {
	const uvs = geometry.attributes.uv.array;
	const offset = 0.015;
	time = 1 - ((offset * (time * 0.4 + 2)) % 1);
	const rowA = time;
	const rowB = time + offset;
	const rowC = time + offset * 2;
	for (const index of points.a) {
		uvs[index * 2 + 1] = rowA;
	}
	for (const index of points.b) {
		uvs[index * 2 + 1] = rowB;
	}
	for (const index of points.c) {
		uvs[index * 2 + 1] = rowC;
	}
	geometry.attributes.uv.needsUpdate = true;
};

export { CreditsMaterial, setupCredits, updateCredits };
