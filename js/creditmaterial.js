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

const uniforms = {
	creditColor1: { value: new THREE.Color(0x000000) },
	creditColor2: { value: new THREE.Color(0xdfdfdf) },
	creditColor3: { value: new THREE.Color(0x30182c /*0x100810*/) },
	creditColor4: { value: new THREE.Color(0xf0841e) }
};

const params = {
	side: THREE.DoubleSide,
	vertexColors: true,
	vertexShader,
	fragmentShader
};

export default class CreditMaterial extends THREE.ShaderMaterial {
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
