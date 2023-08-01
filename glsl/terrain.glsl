#if defined(FRAGMENT_SHADER) && defined(GL_OES_standard_derivatives)
#extension GL_OES_standard_derivatives: enable
#endif

precision mediump float;

#define PI 3.14159265359

#define DEMO_SHADING 0
#define DEMO_SCANLINES 1
#define DEMO_SPHERE 2

#if defined(FRAGMENT_SHADER)
#define attribute //attribute
#endif

attribute float aQuadID;
attribute vec2 aCentroid;
attribute vec3 aPosition;
attribute vec3 aBarycentrics;
attribute float aWhichTexture;
attribute vec2 aTexCoord;
attribute float aBrightness;
attribute float aWaveAmplitude, aWavePhase;
attribute float aPointyQuad;

attribute vec3 aPosition0, aPosition1, aPosition2;

varying float vWhichTexture;
varying vec2 vTexCoord;
varying vec3 vBarycentrics;
varying float vDepth, vBrightness, vSpotlight;
varying float vPointyQuad;

varying mat3 vBottomScanline, vTopScanline;
varying float vScanlineCut;

uniform highp float time;
uniform vec2 timeOffset;

uniform mat4 camera, transform;
uniform mat3 viewport;
uniform vec3 position;
uniform float terrainSize, maxDrawDistance;
uniform float currentQuadID;
uniform float birdsEyeView, lightingCutoff, limitDrawResolution;
uniform float fogNear, fogFar;
uniform vec2 repeatOffset;

uniform sampler2D dunesTexture;
uniform sampler2D cairnTexture;
#ifdef CURSED
uniform sampler2D cursedCreditsTexture;
#else
uniform sampler2D creditsTexture;
#endif
uniform float quadBorder;
uniform vec2 screenSize;
uniform vec2 dunesTextureDistort;

uniform float colorTableWidth;
uniform sampler2D colorTable, linearColorTable;
uniform float titleCreditColor, bodyCreditColor;

vec3 toNDC(vec4 p) {
	return p.xyz / p.w;
}

mat3 createScanline(vec2 p, vec2 q) {

	vec2 o, d;
	if (p.x < q.x) o = -p, d = p - q;
	else o = -q, d = q - p;

	float skw = -d.x / d.y;

	return mat3(
		1.0, 0.0, 0.0,
		skw, 1.0, 0.0,
		0.0, 0.0, 1.0
	) * mat3(
		1.0, 0.0, 0.0,
		0.0, 1.0, 0.0,
		o.x, o.y, 1.0
	);
}

vec4 warpWorld(vec4 pos) {
#if defined(DEMO_ID) && DEMO_ID == DEMO_SPHERE
	float warpAmount;
	if (birdsEyeView == 1.0) {
		warpAmount = -0.002;
	} else {
		warpAmount = -0.00005;
	}
	pos.y += dot(pos.xz, pos.xz) * warpAmount;
#endif
	return pos;
}

#if defined(VERTEX_SHADER)
void vert() {
	// Pass these right along to the fragment shader.
	vWhichTexture = aWhichTexture;
	vBarycentrics = aBarycentrics;
	vPointyQuad = aPointyQuad;
	vTexCoord = aTexCoord;

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
	vec4 worldPosition = warpWorld(transform * localPosition);
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

	// Project the whole triangle from local to world to screen to NDC
	vec2 pos0 = (viewport * toNDC(camera * warpWorld(transform * vec4(aPosition0 + offset, 1.0)))).xy;
	vec2 pos1 = (viewport * toNDC(camera * warpWorld(transform * vec4(aPosition1 + offset, 1.0)))).xy;
	vec2 pos2 = (viewport * toNDC(camera * warpWorld(transform * vec4(aPosition2 + offset, 1.0)))).xy;

	// Identify the lowest vertex
	vec2 a, b, c;
	if (pos0.y >= pos1.y && pos0.y >= pos2.y) a = pos0, b = pos1, c = pos2;
	if (pos1.y >= pos2.y && pos1.y >= pos0.y) a = pos1, b = pos2, c = pos0;
	if (pos2.y >= pos0.y && pos2.y >= pos1.y) a = pos2, b = pos0, c = pos1;

	vBottomScanline = createScanline(a, b);
	vTopScanline = createScanline(b, c);
	vScanlineCut = b.y;

#endif
}
#endif

// Maps the texture coordinates, time and time offset to the crawling credits texture coordinates
highp vec2 getCreditTexCoord(float numColumns, float crawlSpeed, float verticalScale, float verticalOffset, float coveragePercent, float coverageOffset) {
	highp vec2 texCoord = vTexCoord;

	texCoord.y = fract(
		(time + timeOffset.y) * crawlSpeed +
		texCoord.y * verticalScale +
		verticalOffset
	);

	texCoord.y = (texCoord.y - 1.0) * coveragePercent + 1.0 + coverageOffset;

	texCoord.y *= numColumns;
	texCoord.x = (texCoord.x + floor(texCoord.y)) / numColumns + 1.0;

	texCoord = vec2(1.0) - texCoord;
	texCoord = fract(texCoord);
	return texCoord;
}

#if defined(FRAGMENT_SHADER)
void frag() {

	int whichTexture = int(vWhichTexture + 0.1); // +0.1 to fix precision issues on legacy plat
	vec3 color;

#if defined(INDEXED_COLOR)

	// The original program's rasterizer had an off-by-one error for the width of the framebuffer.
	// This causes the edges of triangles to not be drawn in the last column of pixels,
	// and causes the interior fragments of triangles to not be drawn in the last two columns
	// (because the interiors were drawn two at a time with STOSW).
	if (limitDrawResolution == 1.0) {
		float distanceFromRight = screenSize.x - gl_FragCoord.x;
		if (distanceFromRight < 2.0) {
			float borderDistance = min(vBarycentrics.g, vBarycentrics.b);
			if (borderDistance > 0.02 || distanceFromRight <= 1.0) {
				gl_FragColor = vec4(vec3(0.0), 1.0);
				return;
			}
		}
	}


	float src = 0.0;
	float brightness = vBrightness;

	// The first two textures are sampled normally
	if (whichTexture == 0) {
		src = texture2D(dunesTexture, vTexCoord * dunesTextureDistort).r;
	} else if (whichTexture == 1) {
		src = texture2D(cairnTexture, vTexCoord).r;
	} else if (whichTexture == 2) {
		// The credits texture is mapped in a special way,
#ifdef CURSED
		src = texture2D(cursedCreditsTexture, getCreditTexCoord(2.0, -0.0125, 0.06, -0.0225, 1.0, -0.035)).r;
#else
		src = texture2D(creditsTexture, getCreditTexCoord(5.0, -0.006, 0.03, -0.0225, 0.92, -0.004)).r;
#endif

		// and contains text in its green and blue channels
		// with different color gradients applied with indexed colors
		float credit = 1.0 - abs(vTexCoord.y - 0.5) * 2.0;

#if !(defined(DEMO_ID) && DEMO_ID == DEMO_SHADING || DEMO_ID == DEMO_SCANLINES)
		brightness *= credit;
#endif
	}

	// TODO: there must be a better way.
	brightness = min(0.9999, brightness);
	src = min(0.9999, src);

	// Look up the indexed color in the palette.
	int row = int(src * colorTableWidth);
	int column = int(brightness * colorTableWidth);

	// Terrain brightness is limited to 4-bit color depth, aka 16 shades,
	// but the apparent color depth can be doubled by careful dithering.
	// The dithering just alternates between the two nearest shades,
	// but that alternation is offset by the beginning of the raster scanline.
	// Modern GPUs don't rasterize with scanlines, so these are homemade.

	// Find how far along the virtual scanline this fragment is
	mat3 scanline = gl_FragCoord.y < vScanlineCut ? vTopScanline : vBottomScanline;
	float scanlineColumn = (scanline * gl_FragCoord.xyz).x;

	// Not sure why, but some triangles very close to the camera
	// do some strange things
	if (scanlineColumn < 0.0) {
		scanlineColumn = 100.0;
	}

	bool nearBorder = min(min(vBarycentrics.r, vBarycentrics.g), vBarycentrics.b) < 0.01;

	if (column < int(colorTableWidth) - 1 && fract(brightness * colorTableWidth) >= 0.5) {

		// Alternate along that scanline
		int everyOtherPixel = int(fract(scanlineColumn / 2.0) * 2.0);

		// For some reason the original program didn't dither near quad edges
		if (everyOtherPixel == 1 || nearBorder) {
			column += 1;
		}
	}

#if defined(DEMO_ID) && DEMO_ID == DEMO_SCANLINES
	if (!nearBorder) {
		float scanlineStreaks = (scanlineColumn * 960.0 / screenSize.y + 0.1) * (1.0 + vDepth * 2.0);
		scanlineStreaks *= (birdsEyeView == 1.0) ? 1.0 : 0.25;
		scanlineStreaks = fract((scanlineStreaks - (time + vDepth) * 10.0) / 10.0) * 10.0 + scanlineStreaks * 0.1;
		scanlineStreaks = smoothstep(7.0, 8.0, scanlineStreaks);
		column = int(min(float(column), (scanlineStreaks + 0.2) * colorTableWidth));
	}
#endif

#if defined(DEMO_ID) && DEMO_ID == DEMO_SCANLINES
		row = (whichTexture == 0) ? 2 : 10;
#endif

#if defined(DEMO_ID) && DEMO_ID == DEMO_SHADING
		row = int(colorTableWidth) - 1;
#endif

	// row = int(colorTableWidth) - 1;
	// column = int(colorTableWidth) - 1;

#ifdef CURSED
	int colorIndex = column + row * int(colorTableWidth);
	gl_FragColor = vec4(float(colorIndex) / 255.0, vec3(0.0));
	return;
#else
	vec2 colorTableTexCoord = vec2(float(column), float(row)) / colorTableWidth;
	color = texture2D(colorTable, colorTableTexCoord).rgb;
#endif

#elif defined(TRUE_COLOR)
	color = vec3(0.0);
	float brightness = vBrightness;

	// The first two textures are sampled normally
	if (whichTexture == 0) {
		color = texture2D(dunesTexture, vTexCoord).rgb;
	} else if (whichTexture == 1) {
		color = texture2D(cairnTexture, vTexCoord).rgb;
	} else if (whichTexture == 2) {
		// The credits texture is mapped in a special way,
		vec4 credits;
#ifdef CURSED
		credits = texture2D(cursedCreditsTexture, fract(getCreditTexCoord(2.0, -0.010, 0.05, -0.0225, 0.42, -0.035)));
#else
		credits = texture2D(creditsTexture, fract(getCreditTexCoord(5.0, -0.006, 0.03, -0.0225, 0.92, -0.004)));
#endif

		// and contains SDFs in its green and blue channels
		// with different color gradients applied with indexed colors
		float scroll = 1.0 - abs(vTexCoord.y - 0.5) * 2.0;
		float colorIndex = (credits.g > credits.b) ? titleCreditColor : bodyCreditColor;
		vec2 colorTableTexCoord = vec2(scroll, (colorIndex + 0.5) / colorTableWidth);
		color = texture2D(linearColorTable, colorTableTexCoord).rgb;

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

#if !(defined(DEMO_ID) && DEMO_ID == DEMO_SHADING)
		brightness *= smoothstep(radius - derivative, radius, credit);
#endif
	}

#if defined(DEMO_ID) && DEMO_ID == DEMO_SHADING
		color = vec3(1.0);
#endif

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
		if (vPointyQuad > 18.0) {
			borderDistance = min(borderDistance, vBarycentrics.r);
		}

		// The credits shouldn't be obscured by the thick lines
		if (whichTexture == 2) {
			borderDistance = 1.0 - max(abs(vTexCoord.x - 0.5), abs(vTexCoord.y - 0.5)) * 2.0;
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
