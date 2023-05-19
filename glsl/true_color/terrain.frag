#ifdef GL_OES_standard_derivatives
#extension GL_OES_standard_derivatives: enable
#endif

precision mediump float;

uniform highp float tick, time;
uniform sampler2D moonscapeTexture;
uniform sampler2D platformTexture;
uniform sampler2D creditsTexture;
uniform float quadBorder, birdsEyeView, limitDrawResolution;
uniform vec2 screenSize;

uniform float colorTableWidth;
uniform sampler2D linearColorTable;
uniform float creditColor1, creditColor2;

uniform vec2 timeOffset;

varying float vWhichTexture;
varying vec2 vUV;
varying float vFogFactor, vBrightness, vSpotlight;
varying vec3 vBarycentrics;
varying float vPointyQuad;

varying vec2 vLeftVertex;
varying float vTopLeftSlope, vBottomLeftSlope;

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
	float amount = vBrightness;

	if (whichTexture == 0) {
		color = texture2D(moonscapeTexture, vUV).rgb;
	} else if (whichTexture == 1) {
		color = texture2D(platformTexture, vUV).rgb;
	} else if (whichTexture == 2) {
		highp vec2 creditUV = getCreditUV();
		vec4 credits = texture2D(creditsTexture, fract(creditUV));

		float scroll = 1.0 - abs(vUV.y - 0.5) * 2.0;
		float colorIndex = (credits.g > credits.b) ? creditColor1 : creditColor2;
		vec2 colorTableUV = vec2(scroll, (colorIndex + 0.5) / colorTableWidth);
		color = texture2D(linearColorTable, colorTableUV).rgb;

		float radius = 0.4;
		amount = max(credits.g, credits.b);
		float derivative = 0.02;
		if (limitDrawResolution == 0.0) {
			derivative = fwidth(amount);
			if (derivative > 0.1) {
				derivative = 0.0;
			}
		}
		amount = clamp(smoothstep(radius - derivative, radius, amount), 0.0, 1.0);
	}

	color *= amount;

	float quadBorder = quadBorder;
	if (birdsEyeView == 1.0) {
		quadBorder *= 2.0;
	}

	if (quadBorder == 0.0) {
		color += vec3(1.0, 0.8, 0.2) * vSpotlight;
	} else {
		float borderDistance = min(vBarycentrics.g, vBarycentrics.b);

		if (vPointyQuad > 24.0) {
			borderDistance = min(borderDistance, vBarycentrics.r);
		}

		if (whichTexture == 2) {
			borderDistance = 1.0 - max(abs(vUV.x - 0.5), abs(vUV.y - 0.5)) * 2.0;
		}

		borderDistance = smoothstep(0.03, quadBorder * (2.0 + vFogFactor), borderDistance);

		if (vSpotlight == 1.0) {
			color = mix(
				vec3(1.0, 0.8, 0.0),
				color,
				borderDistance
			);
		} else {
			vec3 borderColor = mix(
				vec3(1.0, 0.0, 0.5),
				vec3(1.0, 0.5, 0.0),
				pow(vFogFactor, 2.0)
			);
			color = mix(
				borderColor,
				color,
				borderDistance
			);
		}
	}

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
