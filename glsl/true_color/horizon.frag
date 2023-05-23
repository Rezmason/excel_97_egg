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

	// Stretch the texture so that its size relative to the quad
	// is proportional to the horizon's size on a 480-pixel-tall screen.
	float y = (0.5 - uv.y) * 480.0 / horizonHeight + 1.0;
	vec3 color = texture2D(horizonTexture, vec2(uv.x, y)).rgb;

	// "Sindogs" are a repeating glow evenly distributed across the horizon,
	// which slowly circle over time.
	float brightness = 1.0;
	if (showSindogs == 1.0) {
		brightness += (sin((rotation.y + uv.x * 26.0 + (time + timeOffset.y)) * PI / 180.0 * 15.0) - (uv.y) + 1.0) * 0.5;
	}

	color *= brightness;

	gl_FragColor = vec4(color, 1.0);
}
