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

	int whichTexture = int(vWhichTexture);

	if (whichTexture == 0) {
		gl_FragColor = texture2D(moonscapeTexture, vUV);
	} else if (whichTexture == 1) {
		gl_FragColor = texture2D(platformTexture, vUV);
	} else if (whichTexture == 2) {
		highp vec2 uv = vUV;
		uv.y = fract((time + timeOffset.y) * -0.006 + uv.y * 0.03 - 0.0225);

		uv.y *= 0.92;
		uv.y += 0.076;

		uv.y *= 5.0;
		uv.x = uv.x / 5.0 + (1.0 - 1.0 / 5.0);
		uv.x += 1.0 / 5.0 * (1.0 + floor(uv.y));
		uv.y = fract(uv.y);

		uv = vec2(1.0) - uv;
		vec4 credits = texture2D(creditsTexture, fract(uv));
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

		gl_FragColor = vec4(amount * creditColor, 1.0);
	}

	gl_FragColor.rgb *= vBrightness;

	float quadBorder = quadBorder;
	if (birdsEyeView == 1.0) {
		quadBorder *= 2.0;
	}

	if (quadBorder == 0.0) {
		gl_FragColor.rgb += vec3(1.0, 0.8, 0.2) * vSpotlight;
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
			gl_FragColor = mix(
				vec4(1.0, 0.8, 0.0, 1.0),
				gl_FragColor,
				borderDistance
			);
		} else {
			vec4 borderColor = mix(
				vec4(1.0, 0.0, 0.5, 1.0),
				vec4(1.0, 0.5, 0.0, 1.0),
				pow(vFogFactor, 2.0)
			);
			gl_FragColor = mix(
				borderColor,
				gl_FragColor,
				borderDistance
			);
		}
	}
}
