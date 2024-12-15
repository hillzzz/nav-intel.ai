// Initialize WebGL
const canvas = document.getElementById('glCanvas');
if (!canvas) {
    throw new Error('Canvas not found');
}

/** @type {WebGLContextAttributes} */
const webglOptions = {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
}
/** @type {WebGL2RenderingContext} */
const gl = canvas.getContext('webgl2');

if (!gl) {
    throw new Error('WebGL not available');
}

// Resize canvas to full window size
function resize() {
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
}
window.addEventListener('resize', resize);
resize();

// Vertex shader (same for both passes)
const vertexShader = /*glsl*/`#version 300 es
    in vec4 position;
    void main() {
        gl_Position = position;
    }
`;

// Main Fragment Shader
const mainShader = /*glsl*/`#version 300 es
    // forking https://www.shadertoy.com/view/XsXBzM
    precision highp float;
    uniform vec2 iResolution;
    uniform float iTime;
    out vec4 fragColor;

    float noise(vec2 uv) {
        return fract(sin(dot(uv,vec2(32.23,365.07))) * 17.0125);
    }
    float noiseOG(vec2 c) {
        return fract(sin(c.x+c.y*100.)*1000.);
    }

    float Cell(vec2 c) {
        vec2 uv = fract(c);
        c -= uv;
        float m = (1.-length(uv*2.-1.) * (noise(c) * 10. + 1.) * 2.);
        m = clamp(m, 0., 1.);
        return m * step(
            noiseOG(c),
            .06
        );
    }

    void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
        vec2 p = fragCoord.xy / iResolution.xy -.5;
        p.x *= iResolution.x/iResolution.y;
        float a = fract(atan(p.x, p.y) / 6.2832);
        float d = length(p);
        float z = iTime / 1.5;
        vec3 col;

        for(int i=0; i<3;i++) {
            z += 0.015;
            vec2 coord = vec2(pow(d, .04), a)*256.;
            vec2 delta = vec2(1. + z*1.5, 1.);
            float c = Cell(coord-=delta) * .25;
            c += Cell(coord-=delta) * .5;
            c += Cell(coord-=delta);
            col[i]=c;
        }

        float backgroundStrength = 0.3;
        float backgroundFade_px = 400.0;
        float starsFade_px = 200.0;

        float alpha =
            max(col.x, max(col.y, col.z))
            + (
                smoothstep(0.0, 1.0, (iResolution.y - fragCoord.y) / backgroundFade_px)
                * smoothstep(0.0, 1.0, (fragCoord.y) / backgroundFade_px)
            ) * backgroundStrength;
        fragColor = vec4(col * d * 3., alpha);

        // fade out at top
        fragColor *= 
            smoothstep(0.0, 1.0, (iResolution.y - fragCoord.y) / starsFade_px)
            * smoothstep(0.0, 1.0, (fragCoord.y) / starsFade_px);
    }

    void main() {
        mainImage(fragColor, gl_FragCoord.xy);
    }
`;

// Compile shader
function createShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

// Create shader program
function createProgram(vertexSource, fragmentSource) {
    const vertexShader = createShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentSource);
    
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(program));
        return null;
    }
    return program;
}

// Create buffer A program and main program
const mainProgram = createProgram(vertexShader, mainShader);
const mainProgramInfo = {
    uniforms: {
        iResolution: gl.getUniformLocation(mainProgram, 'iResolution'),
        iTime: gl.getUniformLocation(mainProgram, 'iTime'),
    },
    attributes: {
        position: gl.getAttribLocation(mainProgram, 'position')
    }
}

// Create vertex buffer for fullscreen quad
const positions = new Float32Array([
    -1, -1,
        1, -1,
    -1,  1,
        1,  1
]);
const vertexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

// Render loop
let startTime = performance.now();
function render() {
    const currentTime = (performance.now() - startTime) / 1000;

    // Second pass: Render to screen
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(mainProgram);

    gl.enableVertexAttribArray(mainProgramInfo.attributes.position);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.vertexAttribPointer(mainProgramInfo.attributes.position, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(mainProgramInfo.uniforms.iResolution, canvas.width, canvas.height);

    gl.uniform1f(mainProgramInfo.uniforms.iTime, currentTime);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    requestAnimationFrame(render);
}

render();