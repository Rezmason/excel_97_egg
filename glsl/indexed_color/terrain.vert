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
attribute vec3 aBarycentrics;
attribute float aWhichTexture;
attribute vec2 aUV;
attribute float aBrightness;
attribute float aWaveAmplitude, aWavePhase;
attribute float aPointyQuad;

attribute vec3 aPosition0, aPosition1, aPosition2;

varying float vWhichTexture;
varying vec2 vUV;
varying vec3 vBarycentrics;
varying float vFogFactor, vBrightness, vSpotlight;
varying float vPointyQuad;

varying vec2 vLeftVertex;
varying float vTopLeftSlope, vBottomLeftSlope;

void main() {
	vWhichTexture = aWhichTexture;
	vBarycentrics = aBarycentrics;
	vPointyQuad = aPointyQuad;
	vUV = aUV + 0.5;

	vec2 centroid = (fract((aCentroid + airplanePosition.xy) / terrainSize + 0.5) - 0.5) * terrainSize - airplanePosition.xy;

	centroid += terrainSize * repeatOffset;

	vec2 diff = maxDrawDistance - abs(centroid + airplanePosition.xy);
	if (lightingCutoff == 1.0 && (diff.x < 0.0 || diff.y < 0.0)) {
		return;
	}

	float wave = aWaveAmplitude * -10.0 * sin((time * 1.75 + aWavePhase) * PI * 2.0);
	vec3 offset = vec3(centroid, wave);

	vSpotlight = birdsEyeView * 0.5 - length(abs(centroid + airplanePosition.xy)) * 0.0025;
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

	gl_Position = screenPosition;

	vBrightness = aBrightness + wave * 0.08;
	float fogDepth = -worldPosition.z;
	float fogFactor = smoothstep( fogNear, fogFar, fogDepth );
	vFogFactor = fogFactor;
	// vBrightness *= (1.0 - fogFactor);
	vBrightness = pow(vBrightness, (1.0 + fogFactor * 2.0)) * (1.0 - fogFactor);


	vec2 pos0 = (camera * transform * vec4(aPosition0 + offset, 1.0)).xy;
	vec2 pos1 = (camera * transform * vec4(aPosition1 + offset, 1.0)).xy;
	vec2 pos2 = (camera * transform * vec4(aPosition2 + offset, 1.0)).xy;

	bool less01 = pos0.x < pos1.x;
	bool less12 = pos1.x < pos2.x;
	bool less20 = pos2.x < pos0.x;

	vec2 posP, posQ;
	if (less01 && !less20) vLeftVertex = pos0, posP = pos1, posQ = pos2;
	if (less12 && !less01) vLeftVertex = pos1, posP = pos2, posQ = pos0;
	if (less20 && !less12) vLeftVertex = pos2, posP = pos0, posQ = pos1;

	float slopeP = (posP.y - vLeftVertex.y) / (posP.x - vLeftVertex.x);
	float slopeQ = (posQ.y - vLeftVertex.y) / (posQ.x - vLeftVertex.x);
	vTopLeftSlope = abs(max(slopeP, slopeQ));
	vBottomLeftSlope = abs(min(slopeP, slopeQ));
}
