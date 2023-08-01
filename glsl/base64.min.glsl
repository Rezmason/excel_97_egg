#ifdef VERTEX_SHADER
attribute vec2 aPos; void main(){gl_Position=vec4(aPos,0,1);}
#else
precision highp float;
uniform vec2 sz;
uniform sampler2D source,base64Table;
void main(){
	vec3 c=gl_FragCoord.xyz-.5,i=vec3(c.y*sz.x+c.x)*3.+vec3(0,1,2),y=floor(i/sz.x),x=i-y*sz.x;
#define s(n)texture2D(source,vec2(x[n],y[n])/sz)[0]
	vec4 b=vec4(s(0),s(1),s(2),0)*255.*pow(vec4(2),vec4(-2,-4,-6,0));
	b=fract(b).wxyz+floor(b)/64.;
#define e(n)texture2D(base64Table,vec2(b[n],0))[0]
	gl_FragColor=vec4(e(0),e(1),e(2),e(3));
}
#endif
