precision mediump float;

#define PI 3.14159265359

uniform highp float time;
uniform mat4 camera, transform;
uniform vec3 position;
uniform float terrainSize, maxDrawDistance;
uniform float currentQuadID;
uniform float birdsEyeView, lightingCutoff, limitDrawResolution, vertexJiggle;
uniform float fogNear, fogFar;
uniform vec2 repeatOffset;

attribute float aQuadID;
attribute vec2 aCentroid;
attribute vec3 aPosition;
attribute vec3 aBarycentrics;
attribute float aWhichTexture;
attribute vec2 aUV;
attribute float aBrightness;
attribute float aWaveAmplitude, aWavePhase;
attribute float aPointyQuad;

varying float vWhichTexture;
varying vec2 vUV;
varying vec3 vBarycentrics;
varying float vFogFactor, vBrightness, vSpotlight;
varying float vPointyQuad;

void main() {
	vWhichTexture = aWhichTexture;
	vBarycentrics = aBarycentrics;
	vPointyQuad = aPointyQuad;
	vUV = aUV + 0.5;

	vec2 centroid = (fract((aCentroid + position.xy) / terrainSize + 0.5) - 0.5) * terrainSize - position.xy;

	centroid += terrainSize * repeatOffset;

	vec2 diff = maxDrawDistance - abs(centroid + position.xy);
	if (lightingCutoff == 1.0 && (diff.x < 0.0 || diff.y < 0.0)) {
		return;
	}

	float wave = aWaveAmplitude * -10.0 * sin((time * 1.75 + aWavePhase) * PI * 2.0);
	vec3 offset = vec3(centroid, wave);

	vSpotlight = birdsEyeView * 0.5 - length(abs(centroid + position.xy)) * 0.0025;
	if (aQuadID == currentQuadID) {
		vSpotlight = birdsEyeView;
	}
	vSpotlight = clamp(vSpotlight, 0.0, birdsEyeView);
	if (repeatOffset.x != 0.0 || repeatOffset.y != 0.0) {
		vSpotlight = 0.0;
	}

	vec4 localPosition = vec4(aPosition + offset, 1.0);
	vec4 worldPosition = transform * localPosition;
	vec4 screenPosition = camera * worldPosition;

	if (limitDrawResolution == 1.0) {
		screenPosition.xy = floor(screenPosition.xy * vertexJiggle + 0.5) / vertexJiggle;
	}

	gl_Position = screenPosition;

	vBrightness = aBrightness + wave * 0.08;
	float fogDepth = -worldPosition.z;
	float fogFactor = smoothstep( fogNear, fogFar, fogDepth );
	vFogFactor = fogFactor;
	vBrightness = clamp(pow(vBrightness, (1.0 + fogFactor * 2.0)) * (1.0 - fogFactor), 0.0, 1.0);
}
