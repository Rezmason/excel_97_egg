#ifdef GL_OES_standard_derivatives
#extension GL_OES_standard_derivatives: enable
#endif

precision mediump float;

uniform highp float tick, time;
uniform sampler2D moonscapeTexture;
uniform sampler2D platformTexture;
uniform sampler2D creditsTexture;
uniform float quadBorder, birdsEyeView;

uniform vec3 creditColor1;
uniform vec3 creditColor2;
uniform vec3 creditColor3;
uniform vec3 creditColor4;

uniform vec2 timeOffset;

varying float vWhichTexture;
varying vec2 vUV;
varying float vFogFactor, vBrightness, vSpotlight;
varying vec3 vBarycentrics;
varying float vPointyQuad;

void main() {

	vec3 color = vec3(0.0);

	int whichTexture = int(vWhichTexture);

	if (whichTexture == 0) {
		color = texture2D(moonscapeTexture, vUV).rgb;
	} else if (whichTexture == 1) {
		color = texture2D(platformTexture, vUV).rgb;
	} else if (whichTexture == 2) {
		highp vec2 creditUV = vUV;
		creditUV.y = fract((time + timeOffset.y) * -0.006 + creditUV.y * 0.03 - 0.0225);

		creditUV.y *= 0.92;
		creditUV.y += 0.076;

		creditUV.y *= 5.0;
		creditUV.x = creditUV.x / 5.0 + (1.0 - 1.0 / 5.0);
		creditUV.x += 1.0 / 5.0 * (1.0 + floor(creditUV.y));
		creditUV.y = fract(creditUV.y);

		creditUV = vec2(1.0) - creditUV;
		vec4 credits = texture2D(creditsTexture, fract(creditUV));

		vec3 creditColor = vec3(0.0);
		float amount = 0.0;
		if (credits.b > 0.0 && credits.b > credits.g) {
			amount = credits.b;
			creditColor = mix(creditColor2, creditColor1, abs(vUV.y - 0.5) * 2.0);
		} else if (credits.g > 0.0) {
			amount = credits.g;
			creditColor = mix(creditColor4, creditColor3, abs(vUV.y - 0.5) * 2.0);
		}

		amount = clamp(amount, 0.0, 1.0);

		float radius = 0.4;
		amount = clamp(smoothstep(radius - fwidth(amount), radius, amount), 0.0, 1.0);

		color = creditColor * amount;
	}

	color *= vBrightness;

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

	gl_FragColor = vec4(color, 1.0);
}
