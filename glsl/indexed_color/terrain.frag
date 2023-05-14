precision mediump float;

uniform highp float tick, time;
uniform sampler2D moonscapeTexture;
uniform sampler2D platformTexture;
uniform sampler2D creditsTexture;
uniform float quadBorder, birdsEyeView;

uniform float colorTableWidth;
uniform sampler2D colorTableTexture;

uniform vec2 timeOffset;

varying float vWhichTexture;
varying vec2 vUV;
varying float vFogFactor, vBrightness, vSpotlight;
varying vec3 vBarycentrics;
varying float vPointyQuad;

varying vec2 vLeftVertex;
varying float vTopLeftSlope, vBottomLeftSlope;

void main() {

	int whichTexture = int(vWhichTexture);

	float src = 0.0;
	float amount = 0.0;

	if (whichTexture == 0) {
		src = texture2D(moonscapeTexture, vUV).r;
		amount = vBrightness;
	} else if (whichTexture == 1) {
		src = texture2D(platformTexture, vUV).r;
		amount = vBrightness;
	} else if (whichTexture == 2) {
		highp vec2 creditUV = vUV;
		creditUV.y = fract((time + timeOffset.y) * -0.006 + creditUV.y * 0.03 - 0.0225);

		creditUV.y *= 0.92;
		creditUV.y += 0.076;

		creditUV.y *= 5.0;
		creditUV.x = creditUV.x * 0.2 + (1.0 - 1.0 * 0.2);
		creditUV.x += 1.0 * 0.2 * (1.0 + floor(creditUV.y));
		creditUV.y = fract(creditUV.y);

		creditUV = vec2(1.0) - creditUV;
		src = texture2D(creditsTexture, fract(creditUV)).r;

		amount = 1.0 - abs(vUV.y - 0.5) * 2.0;
	}

	int row = int(src * colorTableWidth);
	int column = int(amount * colorTableWidth);

	if (fract(amount * colorTableWidth) >= 0.5) {

		vec2 origin = gl_FragCoord.xy - vLeftVertex;
		float slope = origin.y < 0.0 ? vTopLeftSlope : vBottomLeftSlope;
		float hDist = origin.x - origin.y * slope;

		bool everyOtherPixel = fract(hDist * 0.5) > 0.5;
		bool nearBorder = min(min(vBarycentrics.r, vBarycentrics.g), vBarycentrics.b) < 0.01;
		if (everyOtherPixel || nearBorder) {
			column += 1;
		}
	}

	// row = int(colorTableWidth) - 1;
	// column = int(colorTableWidth) - 1;

	vec2 colorTableUV = vec2(float(column), float(row)) / colorTableWidth;
	vec3 color = texture2D(colorTableTexture, colorTableUV).rgb;

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
