precision mediump float;

uniform vec3 rotation;
uniform mat2 rollMat;

attribute vec2 aPosition;

varying vec2 vUV;

void main() {
	vUV = 0.5 * (aPosition + 1.0);
	vUV.y += rotation.x * -0.04;
	vUV = rollMat * (vUV - 0.5) + 0.5;
	gl_Position = vec4(aPosition, 0, 1);
}
