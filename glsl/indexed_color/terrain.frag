precision mediump float;

uniform highp float time;
uniform vec2 timeOffset;

uniform sampler2D moonscapeTexture;
uniform sampler2D platformTexture;
uniform sampler2D creditsTexture;
uniform float quadBorder, birdsEyeView, limitDrawResolution;
uniform vec2 screenSize;
uniform vec2 moonscapeUVDistort;

uniform float colorTableWidth;
uniform sampler2D colorTable;


varying float vWhichTexture;
varying vec2 vUV;
varying float vFogFactor, vBrightness, vSpotlight;
varying vec3 vBarycentrics;
varying float vPointyQuad;

varying vec2 vLeftVertex;
varying float vTopLeftSlope, vBottomLeftSlope;

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

void main() {

	int whichTexture = int(vWhichTexture);

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
		brightness *= credit;
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

	// row = int(colorTableWidth) - 1;
	// column = int(colorTableWidth) - 1;

	vec2 colorTableUV = vec2(float(column), float(row)) / colorTableWidth;
	vec3 color = texture2D(colorTable, colorTableUV).rgb;

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

		float border = smoothstep(0.03, quadBorder * (2.0 + vFogFactor), borderDistance);

		vec3 borderColor;
		if (vSpotlight == 1.0) {
			// The quad beneath the camera gets a solid border color
			borderColor = vec3(1.0, 0.8, 0.0);
		} else {
			// The other quads' border color varies with distance to camera, aka the fog factor
			borderColor = mix(vec3(1.0, 0.0, 0.5), vec3(1.0, 0.5, 0.0), pow(vFogFactor, 2.0));
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
