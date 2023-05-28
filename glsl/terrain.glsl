#if defined(FRAGMENT_SHADER) && defined(GL_OES_standard_derivatives)
#extension GL_OES_standard_derivatives: enable
#endif

precision mediump float;

#define PI 3.14159265359

#if defined(FRAGMENT_SHADER)
#define attribute //
#endif

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
varying float vDepth, vBrightness, vSpotlight;
varying float vPointyQuad;

varying vec2 vLeftVertex;
varying float vTopLeftSlope, vBottomLeftSlope;

uniform highp float time;
uniform vec2 timeOffset;

uniform mat4 camera, transform;
uniform vec3 position;
uniform float terrainSize, maxDrawDistance;
uniform float currentQuadID;
uniform float birdsEyeView, lightingCutoff, limitDrawResolution;
uniform float fogNear, fogFar;
uniform vec2 repeatOffset;

uniform sampler2D moonscapeTexture;
uniform sampler2D platformTexture;
uniform sampler2D creditsTexture;
uniform float quadBorder;
uniform vec2 screenSize;
uniform float shadingOnly;
uniform vec2 moonscapeUVDistort;

uniform float colorTableWidth;
uniform sampler2D colorTable, linearColorTable;
uniform float titleCreditColor, bodyCreditColor;

#if defined(VERTEX_SHADER)
void vert() {
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

	gl_Position = screenPosition;

	// Compute fog
	float depth = -worldPosition.z;
	vDepth = clamp(depth / maxDrawDistance, 0.0, 1.0);
	float fogFactor = smoothstep( fogNear, fogFar, depth );

	// Adjust brightness by wave amplitude and old school exponential-squared fog
	vBrightness = aBrightness + wave * 0.08;
	vBrightness = clamp(pow(vBrightness, (1.0 + fogFactor * 2.0)) * (1.0 - fogFactor), 0.0, 1.0);

#if defined(INDEXED_COLOR)
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
#endif
}
#endif

// Maps the UV coordinates, time and time offset to the crawling credits UV
highp vec2 getCreditUV() {
	highp vec2 uv = vUV;
	uv.y = fract((time + timeOffset.y) * -0.006 + uv.y * 0.03 - 0.0225);

	uv.y *= 0.92;
	uv.y += 0.076;

	uv.y *= 5.0;
	uv.x = uv.x * 0.2 + (1.0 - 1.0 * 0.2);
	uv.x += 1.0 * 0.2 * (1.0 + floor(uv.y));
	uv.y = fract(uv.y);

	uv = vec2(1.0) - uv;
	uv = fract(uv);

	return uv;
}

#if defined(FRAGMENT_SHADER)
void frag() {

	int whichTexture = int(vWhichTexture);

#if defined(INDEXED_COLOR)
	float src = 0.0;
	float brightness = vBrightness;

	// The first two textures are sampled normally
	if (whichTexture == 0) {
		src = texture2D(moonscapeTexture, vUV * moonscapeUVDistort).r;
	} else if (whichTexture == 1) {
		src = texture2D(platformTexture, vUV).r;
	} else if (whichTexture == 2) {
		// The credits texture is mapped in a special way,
		src = texture2D(creditsTexture, getCreditUV()).r;
		// and contains text in its green and blue channels
		// with different color gradients applied with indexed colors
		float credit = 1.0 - abs(vUV.y - 0.5) * 2.0;

		if (shadingOnly == 0.0) {
			brightness *= credit;
		}
	}

	// Look up the indexed color in the palette.
	int row = int(src * colorTableWidth);
	int column = int(brightness * colorTableWidth);

	// Terrain brightness is limited to 4-bit color depth, aka 16 shades,
	// but the apparent color depth can be doubled by careful dithering
	if (fract(brightness * colorTableWidth) >= 0.5) {

		// The dithering just alternates between the two nearest shades,
		// but that alternation is offset by the beginning of the raster scanline.
		// Modern GPUs don't rasterize with scanlines, so these are homemade.

		// Find how far along the virtual scanline this fragment is
		vec2 origin = gl_FragCoord.xy - vLeftVertex;
		float slope = origin.y < 0.0 ? vTopLeftSlope : vBottomLeftSlope;
		float hDist = origin.x - origin.y * slope;

		// Alternate along that scanline
		int everyOtherPixel = int(fract(hDist * 0.5) * 2.0);

		// For some reason the original program didn't dither near quad edges
		bool nearBorder = min(min(vBarycentrics.r, vBarycentrics.g), vBarycentrics.b) < 0.01;
		if (everyOtherPixel == 1 || nearBorder) {
			column += 1;
		}
	}

	if (shadingOnly == 1.0) {
		row = int(colorTableWidth) - 1;
	}

	// row = int(colorTableWidth) - 1;
	// column = int(colorTableWidth) - 1;

	vec2 colorTableUV = vec2(float(column), float(row)) / colorTableWidth;
	vec3 color = texture2D(colorTable, colorTableUV).rgb;
#elif defined(TRUE_COLOR)
	vec3 color = vec3(0.0);
	float brightness = vBrightness;

	// The first two textures are sampled normally
	if (whichTexture == 0) {
		color = texture2D(moonscapeTexture, vUV).rgb;
	} else if (whichTexture == 1) {
		color = texture2D(platformTexture, vUV).rgb;
	} else if (whichTexture == 2) {
		// The credits texture is mapped in a special way,
		vec4 credits = texture2D(creditsTexture, fract(getCreditUV()));
		// and contains SDFs in its green and blue channels
		// with different color gradients applied with indexed colors
		float scroll = 1.0 - abs(vUV.y - 0.5) * 2.0;
		float colorIndex = (credits.g > credits.b) ? titleCreditColor : bodyCreditColor;
		vec2 colorTableUV = vec2(scroll, (colorIndex + 0.5) / colorTableWidth);
		color = texture2D(linearColorTable, colorTableUV).rgb;

		float radius = 0.4;
		float credit = max(credits.g, credits.b);
		float derivative = 0.02;

		// If the draw resolution isn't limited,
		// the SDF smoothing envelope gets based on derivatives
		if (limitDrawResolution == 0.0) {
			derivative = fwidth(credit);
			if (derivative > 0.1) {
				derivative = 0.0;
			}
		}

		if (shadingOnly == 0.0) {
			brightness *= smoothstep(radius - derivative, radius, credit);
		}
	}

	if (shadingOnly == 1.0) {
		color = vec3(1.0);
	}

	color *= clamp(brightness, 0.0, 1.0);
#endif

	// The quad border is smaller in birds' eye view
	float quadBorder = quadBorder;
	if (birdsEyeView == 1.0) {
		quadBorder *= 2.0;
	}

	if (quadBorder == 0.0) {
		// Add the spotlight
		color += vec3(1.0, 0.8, 0.2) * vSpotlight;
	} else {
		// Thick lines are drawn along the edges of the quads
		float borderDistance = min(vBarycentrics.g, vBarycentrics.b);

		// A quad whose triangles are very steep
		// earns an additional thick line along the edge between them
		if (vPointyQuad > 24.0) {
			borderDistance = min(borderDistance, vBarycentrics.r);
		}

		// The credits shouldn't be obscured by the thick lines
		if (whichTexture == 2) {
			borderDistance = 1.0 - max(abs(vUV.x - 0.5), abs(vUV.y - 0.5)) * 2.0;
		}

		borderDistance /= 1.0 + vDepth;
		float derivative = fwidth(borderDistance);
		float border = smoothstep(quadBorder, quadBorder + derivative, borderDistance);

		if (limitDrawResolution == 1.0) {
			border = border > 0.5 ? 1.0 : 0.0;
		}

		vec3 borderColor;
		if (vSpotlight == 1.0) {
			// The quad beneath the camera gets a solid border color
			borderColor = vec3(1.0, 0.8, 0.0);
		} else {
			// The other quads' border color varies with distance to camera, aka the fog factor
			borderColor = mix(vec3(1.0, 0.0, 0.5), vec3(1.0, 0.5, 0.0), pow(vDepth, 2.0));
		}
		color = mix(borderColor, color, border);
	}

	// The original program didn't rasterize faces
	// in the two rightmost columns of the framebuffer,
	// and only drew pixels on the edges of terrain
	// in the second rightmost column.
	if (limitDrawResolution == 1.0) {
		float distanceFromRight = screenSize.x - gl_FragCoord.x;
		if (distanceFromRight < 2.0) {
			float borderDistance = min(vBarycentrics.g, vBarycentrics.b);
			if (borderDistance > 0.02 || distanceFromRight <= 1.0) {
					color = vec3(0.0);
			}
		}
	}

	gl_FragColor = vec4(color, 1.0);
}
#endif

void main() {
#if defined(VERTEX_SHADER)
	vert();
#elif defined(FRAGMENT_SHADER)
	frag();
#endif
}
