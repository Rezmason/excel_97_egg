#define PI 3.14159265359
precision mediump float;

uniform sampler2D horizonTexture;
uniform float horizonHeight;
uniform vec3 rotation;
uniform float showSindogs;

uniform float time;
uniform vec2 timeOffset;

varying vec2 vUV;

void main() {
	vec2 uv = vUV;
	float y = (0.5 - uv.y) * 480. / horizonHeight + 1.0;
	vec3 color = vec3(0.0);
	if (y < 1.0) {
		color = texture2D(horizonTexture, vec2(uv.x, y)).rgb;

		float brightness = 1.0;
		if (showSindogs == 1.0) {
			brightness += (sin((rotation.y + uv.x * 26.0 + (time + timeOffset.y)) * PI / 180.0 * 15.0) - (uv.y) + 1.0) * 0.5;
		}

		color *= brightness;
	}

	gl_FragColor = vec4(color, 1.0);
}
