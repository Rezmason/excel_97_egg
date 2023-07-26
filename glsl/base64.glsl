precision mediump float;

#if defined(FRAGMENT_SHADER)
#define attribute //
#endif

attribute vec2 aPosition;
varying vec2 vTexCoord;
uniform sampler2D tex;
uniform sampler2D base64Table;

#if defined(VERTEX_SHADER)
void vert() {
	vTexCoord = 0.5 * (aPosition + 1.0);
	gl_Position = vec4(aPosition, 0.0, 1.0);
}
#endif

float getByte(int index) {
	int y = index / 640;
	int x = index - y * 640;
	vec2 uv = vec2(float(x) / 640.0, float(y) / 480.0);
	return texture2D(tex, uv).r * 255.0;
}

float recombine(float leftOct, float leftShift, float rightOct, float rightShift) {
	// left shift
	float left = leftOct * pow(2.0, leftShift); // multiply by powers of 2
	left = fract(left / 64.0) * 64.0; // remove higher bits (mod 2^6)

	// right shift
	float right = rightOct * pow(2.0, -rightShift); // multiply by inverse powers of 2
	right = floor(right); // remove lower bits (round down)

	float sextet = left + right;

	// look up sextet in table
	return texture2D(base64Table, vec2(sextet / 64.0, 0.0)).r;
}

#if defined(FRAGMENT_SHADER)
void frag() {

	vec2 uv = vTexCoord;
	int x = int(uv.x * 640.0);
	int y = int(uv.y * 480.0);
	int index = (y * 640 + x) * 3;

	float o0 =   getByte( index + 0             );
	float o1 =   getByte                        ( index + 1             );
	float o2 =   getByte                                                ( index + 2             );

	// https://en.wikipedia.org/wiki/Base64#Examples

	//   Source (ASCII) | 'M'                   | 'a'                   | 'n'                   |
	//           Octets | 0x4d                  | 0x61                  | 0x6e                  |
	//             Bits | 01    00    11  | 01  | 01    10  | 00    01  | 01  | 10    11    10  |
	//          Sextets | 0x13            | 0x16            | 0x05            | 0x2e            |
	//     Base64 Chars | 'T'             | 'W'             | 'F'             | 'u'             |
	//    Base64 Octets | 0x54            | 0x57            | 0x46            | 0x75            |

	gl_FragColor = vec4(
	           recombine( 0.,0.,    o0,2. ),
	           recombine                  ( o0,6.-2., o1,4. ),
	           recombine                                    ( o1,6.-4., o2,6. ),
	           recombine                                                      ( o2,6.-6., 0.,0. )
	);
}
#endif

void main() {
#if defined(VERTEX_SHADER)
	vert();
#elif defined(FRAGMENT_SHADER)
	frag();
#endif
}
