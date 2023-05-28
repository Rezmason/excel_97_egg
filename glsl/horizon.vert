precision mediump float;

uniform mat4 camera, horizonTransform;

attribute vec2 aPosition;

varying vec2 vUV;

void main() {
	vUV = 0.5 * (aPosition + 1.0);

	// Convert the 2D quad into a 3D object,
	// always in front of the camera,
	vec4 position = vec4(-1.0, aPosition * -0.2, 1.0);
	// rotated to match the roll of the camera.
	position = horizonTransform * position;
	position = camera * position;

	gl_Position = position;
}
