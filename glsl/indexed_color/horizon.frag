#define PI 3.14159265359
precision mediump float;

uniform sampler2D horizonTexture;
uniform float horizonHeight;
uniform vec3 rotation;
uniform float showSindogs;

uniform float colorTableWidth;
uniform sampler2D colorTableTexture;

uniform float time;
uniform vec2 timeOffset;

varying vec2 vUV;

void main() {
	vec2 uv = vUV;
	float y = (0.5 - uv.y) * 480. / horizonHeight + 1.0;
	vec3 color = vec3(0.0);
	if (y < 1.0) {

		color = texture2D(horizonTexture, vec2(uv.x, y)).rgb;

		int index = int(color.r * (colorTableWidth * colorTableWidth - 1.0));
		int numColumns = int(colorTableWidth);
		int row = index / numColumns;
		int column = index - row * numColumns;

		// row = int(colorTableWidth) - 1;
		// column = int(colorTableWidth) - 1;

		vec2 colorTableUV = vec2(float(column), float(row)) / colorTableWidth;
		color = texture2D(colorTableTexture, colorTableUV).rgb;

		float brightness = 1.0;
		if (showSindogs == 1.0) {
			brightness += (sin((rotation.y + uv.x * 26.0 + (time + timeOffset.y)) * PI / 180.0 * 15.0) - (uv.y) + 1.0) * 0.5;
		}

		color *= brightness;
	}

	gl_FragColor = vec4(color, 1.0);
}
