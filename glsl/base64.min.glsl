#ifdef VERTEX_SHADER
attribute vec2 aPos; void main(){gl_Position=vec4(aPos,0,1);}
#else
precision highp float;
uniform vec2 size;
uniform sampler2D src,tab;
void main(){
	vec4 a=(gl_FragCoord-.5)*3.,i=vec4(0,1,2,0)+a.y*size.x+a.x,y=floor(i/size.x),x=i-y*size.x;
#define s(n)texture2D(src,vec2(x[n],y[n])/size)[0]
#define e(n)texture2D(tab,vec2(a[n],0))[0]
	a=vec4(s(0),s(1),s(2),0)*255.*pow(vec4(2),-vec4(2,4,6,0)),a=fract(a).wxyz+floor(a)/64.,gl_FragColor=vec4(e(0),e(1),e(2),e(3));
}
#endif
