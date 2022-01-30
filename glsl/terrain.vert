precision mediump float;

#define PI 3.14159265359

uniform highp float time;
uniform mat4 camera, transform;
uniform vec3 airplanePosition;
uniform float terrainSize, maxDrawDistance;
uniform float currentQuadID;
uniform float birdsEyeView, lightingCutoff;
uniform float fogNear, fogFar;
uniform vec2 repeatOffset;

attribute float aQuadID;
attribute vec2 aCentroid;
attribute vec3 aPosition;
attribute float aWhichTexture;
attribute vec2 aUV;
attribute float aBrightness;
attribute float aWaveAmplitude, aWavePhase;

varying float vWhichTexture;
varying vec2 vUV;
varying float vFogFactor, vBrightness, vSpotlight;

void main() {
	vWhichTexture = aWhichTexture;
	vUV = aUV + 0.5;

	vec2 centroid = (fract((aCentroid + airplanePosition.xy) / terrainSize + 0.5) - 0.5) * terrainSize - airplanePosition.xy;

	centroid += terrainSize * repeatOffset;

	vec2 diff = maxDrawDistance - abs(centroid + airplanePosition.xy);
	if (lightingCutoff == 1.0 && (diff.x < 0.0 || diff.y < 0.0)) {
		return;
	}

	vec4 localPosition = vec4(aPosition + vec3(centroid, 0.0), 1);
	float wave = aWaveAmplitude * -10.0 * sin((time * 1.75 + aWavePhase) * PI * 2.0);
	localPosition.z += wave;

	vSpotlight = birdsEyeView * 0.5 - length(abs(centroid + airplanePosition.xy)) * 0.0025;
	if (aQuadID == currentQuadID) {
		vSpotlight = birdsEyeView;
	}
	vSpotlight = clamp(vSpotlight, 0.0, birdsEyeView);
	if (repeatOffset.x != 0.0 || repeatOffset.y != 0.0) {
		vSpotlight = 0.0;
	}

	vec4 worldPosition = transform * localPosition;

	vBrightness = aBrightness + wave * 0.08;
	float fogDepth = -worldPosition.z;
	float fogFactor = smoothstep( fogNear, fogFar, fogDepth );
	vFogFactor = fogFactor;
	// vBrightness *= (1.0 - fogFactor);
	vBrightness = pow(vBrightness, (1.0 + fogFactor * 2.0)) * (1.0 - fogFactor);

	vec4 screenPosition = camera * worldPosition;
	gl_Position = screenPosition;
}
