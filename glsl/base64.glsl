precision highp float;

#if defined(FRAGMENT_SHADER)
#define attribute //
#endif

attribute vec2 aPos;

uniform vec2 size;
uniform sampler2D src, tab;

#if defined(VERTEX_SHADER)

void main() { gl_Position = vec4(aPos, 0.0, 1.0); }

#elif defined(FRAGMENT_SHADER)

float getByte(float index) {
	float y = floor(index / size.x);
	vec2 coord = vec2(index - y * size.x, y);
	return floor(texture2D(src, coord / size).r * 255.0);
}

float encode(float leftOct, float leftShift, float rightOct, float rightShift) {
	// left shift the left octet
	float left = leftOct * pow(2.0, leftShift);     // multiply by powers of 2
	left = fract(left / 64.0) * 64.0;               // remove higher bits (mod 2^6)

	// right shift the right octet
	float right = rightOct * pow(2.0, -rightShift); // multiply by inverse powers of 2
	right = floor(right);                           // remove lower bits (round down)

	float sextet = left + right;

	// look up sextet's base64 encoding
	return texture2D(tab, vec2(sextet / 64.0, 0.0)).r;
}

void main() {

	vec2 coord = gl_FragCoord.xy - 0.5;
	float byteIndex = (coord.y * size.x + coord.x) * 3.0;

	float o0 =   getByte( byteIndex + 0.0       );
	float o1 =   getByte                        ( byteIndex + 1.0       );
	float o2 =   getByte                                                ( byteIndex + 2.0       );

	// https://en.wikipedia.org/wiki/Base64#Examples

	//   Source (ASCII) | 'M'                   | 'a'                   | 'n'                   |
	//           Octets | 0x4d                  | 0x61                  | 0x6e                  |
	//             Bits | 01    00    11  | 01  | 01    10  | 00    01  | 01  | 10    11    10  |
	//          Sextets | 0x13            | 0x16            | 0x05            | 0x2e            |
	//     Base64 Chars | 'T'             | 'W'             | 'F'             | 'u'             |
	//    Base64 Octets | 0x54            | 0x57            | 0x46            | 0x75            |

	gl_FragColor = vec4(
	              encode( 0.,0.,    o0,2. ),
	              encode                  ( o0,6.-2., o1,4. ),
	              encode                                    ( o1,6.-4., o2,6. ),
	              encode                                                      ( o2,6.-6., 0.,0. )
	);
}

#endif
