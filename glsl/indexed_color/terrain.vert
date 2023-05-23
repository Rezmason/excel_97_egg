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

attribute vec3 aPosition0, aPosition1, aPosition2;

varying float vWhichTexture;
varying vec2 vUV;
varying vec3 vBarycentrics;
varying float vFogFactor, vBrightness, vSpotlight;
varying float vPointyQuad;

varying vec2 vLeftVertex;
varying float vTopLeftSlope, vBottomLeftSlope;

void main() {
	// Pass these right along to the fragment shader.
	vWhichTexture = aWhichTexture;
	vBarycentrics = aBarycentrics;
	vPointyQuad = aPointyQuad;
	vUV = aUV;

	vec2 quadCentroidLocalPosition = (
			fract((aCentroid + position.xy) / terrainSize + 0.5) - 0.5
			+ repeatOffset
		)
		* terrainSize;

	// Don't draw the triangle if its quad is too far away
	// in the X or the Y axis
	vec2 diff = maxDrawDistance - abs(quadCentroidLocalPosition);
	if (lightingCutoff == 1.0 && (diff.x < 0.0 || diff.y < 0.0)) {
		return;
	}

	// Draw the spotlight if the quad is near enough
	vSpotlight = birdsEyeView * 0.5 - length(abs(quadCentroidLocalPosition)) * 0.0025;
	if (aQuadID == currentQuadID) {
		vSpotlight = birdsEyeView;
	}
	vSpotlight = clamp(vSpotlight, 0.0, birdsEyeView);
	if (repeatOffset.x != 0.0 || repeatOffset.y != 0.0) {
		vSpotlight = 0.0;
	}

	// Move the vertex up and down by its wave amplitude
	float wave = aWaveAmplitude * -10.0 * sin((time * 1.75 + aWavePhase) * PI * 2.0);
	vec3 offset = vec3(quadCentroidLocalPosition - position.xy, wave);

	// Project position from local to world to screen
	vec4 localPosition = vec4(aPosition + offset, 1.0);
	vec4 worldPosition = transform * localPosition;
	vec4 screenPosition = camera * worldPosition;

	// Jiggle the screen position to simulate low precision calculation
	if (limitDrawResolution == 1.0) {
		screenPosition.xy = floor(screenPosition.xy * vertexJiggle + 0.5) / vertexJiggle;
	}

	gl_Position = screenPosition;

	// Compute fog
	float fogDepth = -worldPosition.z;
	float fogFactor = smoothstep( fogNear, fogFar, fogDepth );
	vFogFactor = fogFactor;

	// Adjust brightness by wave amplitude and old school exponential-squared fog
	vBrightness = aBrightness + wave * 0.08;
	vBrightness = clamp(pow(vBrightness, (1.0 + fogFactor * 2.0)) * (1.0 - fogFactor), 0.0, 1.0);

	// Project all three triangle vertices' positions from local to world to screen
	vec2 pos0 = (camera * transform * vec4(aPosition0 + offset, 1.0)).xy;
	vec2 pos1 = (camera * transform * vec4(aPosition1 + offset, 1.0)).xy;
	vec2 pos2 = (camera * transform * vec4(aPosition2 + offset, 1.0)).xy;

	// Identify the leftmost vertex
	bool less01 = pos0.x < pos1.x;
	bool less12 = pos1.x < pos2.x;
	bool less20 = pos2.x < pos0.x;
	vec2 deltaP, deltaQ;
	if (less01 && !less20) vLeftVertex = pos0, deltaP = pos1, deltaQ = pos2;
	if (less12 && !less01) vLeftVertex = pos1, deltaP = pos2, deltaQ = pos0;
	if (less20 && !less12) vLeftVertex = pos2, deltaP = pos0, deltaQ = pos1;

	deltaP -= vLeftVertex;
	deltaQ -= vLeftVertex;

	// Compute the slopes from the leftmost vertex to the other two vertices
	float slopeP = deltaP.y == 0.0 ? 0.0 : clamp(deltaP.x / deltaP.y, -100.0, 100.0);
	float slopeQ = deltaQ.y == 0.0 ? 0.0 : clamp(deltaQ.x / deltaQ.y, -100.0, 100.0);

	// Identify the "top" and "bottom" slopes
	vTopLeftSlope = abs(max(slopeP, slopeQ));
	vBottomLeftSlope = abs(min(slopeP, slopeQ));
}
