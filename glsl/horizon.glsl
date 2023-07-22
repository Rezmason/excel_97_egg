precision mediump float;

#define PI 3.14159265359

#define DEMO_SHADING 0
#define DEMO_SCANLINES 1

#if defined(FRAGMENT_SHADER)
#define attribute //
#endif

attribute vec2 aPosition;

varying vec2 vTexCoord;

uniform mat4 camera, horizonTransform;

uniform sampler2D horizonTexture;
uniform float horizonHeight;
uniform vec3 rotation;
uniform float showSindogs;

uniform float colorTableWidth;
uniform sampler2D colorTable;

uniform highp float time;
uniform vec2 timeOffset;

#if defined(VERTEX_SHADER)
void vert() {
	vTexCoord = 0.5 * (aPosition + 1.0);

	// Convert the 2D quad into a 3D object,
	// always in front of the camera,
	vec4 position = vec4(-1.0, aPosition * -0.2, 1.0);
	// rotated to match the roll of the camera.
	position = horizonTransform * position;
	position = camera * position;

	gl_Position = position;
}
#endif

#if defined(FRAGMENT_SHADER)
void frag() {
	vec2 texCoord = vTexCoord;

	// Stretch the texture so that its size relative to the quad
	// is proportional to the horizon's size on a 480-pixel-tall screen.
	float y = (0.5 - texCoord.y) * 480.0 / horizonHeight + 1.0;

#if defined(INDEXED_COLOR)

	if (y > 1.0) {
		y = 0.0;
	}
	float src = texture2D(horizonTexture, vec2(texCoord.x, y)).r;

	// Look up the indexed color in the palette.
	int index = int(src * (colorTableWidth * colorTableWidth - 1.0));
	int numColumns = int(colorTableWidth);
	int row = index / numColumns;
	int column = index - row * numColumns;
#if defined(DEMO_ID) && DEMO_ID == DEMO_SHADING
		row = int(colorTableWidth) - 1;
#endif

	// row = int(colorTableWidth) - 1;
	// column = int(colorTableWidth) - 1;

	vec3 color;

#ifdef CURSED
	int colorIndex = column + row * int(colorTableWidth);
	gl_FragColor = vec4(float(colorIndex) / 255.0, vec3(0.0));
	return;
#else
	vec2 colorTableTexCoord = vec2(float(column), float(row)) / colorTableWidth;
	color = texture2D(colorTable, colorTableTexCoord).rgb;
#endif

#elif defined(TRUE_COLOR)
	color = texture2D(horizonTexture, vec2(texCoord.x, y)).rgb;

#if defined(DEMO_ID) && DEMO_ID == DEMO_SHADING
		color = vec3(max(color.r, max(color.g, color.b)));
#endif

#endif

	// "Sindogs" are a repeating glow evenly distributed across the horizon,
	// which slowly circle over time.
	float brightness = 1.0;
	if (showSindogs == 1.0) {
		brightness += (sin((rotation.y + texCoord.x * 26.0 + (time + timeOffset.y)) * PI / 180.0 * 15.0) - (texCoord.y) + 1.0) * 0.5;
	}

	color *= brightness;

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
