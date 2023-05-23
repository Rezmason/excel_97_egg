#ifdef GL_OES_standard_derivatives
#extension GL_OES_standard_derivatives: enable
#endif

precision mediump float;

uniform highp float time;
uniform vec2 timeOffset;

uniform sampler2D moonscapeTexture;
uniform sampler2D platformTexture;
uniform sampler2D creditsTexture;
uniform float quadBorder, birdsEyeView, limitDrawResolution;
uniform vec2 screenSize;
uniform float shadingOnly;

uniform float colorTableWidth;
uniform sampler2D linearColorTable;
uniform float titleCreditColor, bodyCreditColor;

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
