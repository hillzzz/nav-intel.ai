/*
 * Night sky scenes: a graded sea photograph with the nav-intel.ai star field in its sky.
 *
 * Markup:
 *   <div class="sc" data-scene data-iw="1920" data-ih="1103" data-hz="0.73" data-vx="0.42" data-vy="0.73"
 *        data-fx="0.5" data-fy="1" data-fx-sm="0.3" style="--mask:url(sky-mask.webp)">
 *     <div class="sc-stage"><img src="photo.webp"> <div class="sc-sky"><canvas></canvas></div></div>
 *   </div>
 *
 * data-iw/ih  photo size in pixels
 * data-hz     horizon, as a fraction of the photo's height
 * data-vx/vy  where the star field's centre sits, as fractions of the photo
 * data-fx/fy  focus used when the photo is cropped to fill the box (like object-position), with -sm versions for phones
 * data-fade   strength of the fade to night blue at the top of the sky (default 1, 0 for none)
 *
 * The photo is laid out like object-fit: cover. Its sky fades to night blue, and the star field fills the sky,
 * masked by a cut-out of the photo (--mask) so stars pass behind masts, rigging and land. An optional .sc-front
 * layer repeats the photo over the page's type, masked to the boat (--front), so the mast can cross the lettering.
 * The scene exposes --hzy, the horizon's position in pixels, for type that lines up with it.
 */
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* The star field shader from nav-intel.ai (js/starfield.js). The star code is unchanged; main() adds an offset so a
     canvas can show the part of a larger field that falls in the sky. */
  const VS = `#version 300 es
    in vec4 position;
    void main() {
        gl_Position = position;
    }
`;
  const FS = `#version 300 es
    // forking https://www.shadertoy.com/view/XsXBzM
    precision highp float;
    uniform vec2 iResolution;
    uniform float iTime;
    uniform vec2 iOffset; // added: where this canvas sits inside the full star field
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

        float backgroundStrength = 0.4;
        float backgroundFade_px = 400.0;
        float starsFade_px = 200.0;

        float alpha =
            max(col.x, max(col.y, col.z))
            + (
                smoothstep(0.0, 1.0, (iResolution.y - fragCoord.y) / backgroundFade_px)
                *
                smoothstep(0.0, 1.0, (fragCoord.y) / backgroundFade_px)
            ) * backgroundStrength;
        fragColor = vec4(col * d * 3., alpha);

        // fade out at top
        fragColor *=
            smoothstep(0.0, 1.0, (iResolution.y - fragCoord.y) / starsFade_px)
            *
            smoothstep(0.0, 1.0, (fragCoord.y) / starsFade_px);
    }

    void main() {
        mainImage(fragColor, gl_FragCoord.xy + iOffset);
    }
`;

  const SPEED = 0.6; // the star field runs at 60% of the current site's speed

  function starfield(canvas) {
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) return; // without WebGL the graded photograph stands on its own
    function compile(type, src) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; }
      return s;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); return; }
    const uRes = gl.getUniformLocation(prog, 'iResolution'), uTime = gl.getUniformLocation(prog, 'iTime');
    const uOff = gl.getUniformLocation(prog, 'iOffset'), aPos = gl.getAttribLocation(prog, 'position');
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    let t = 0, last = 0, raf = 0, visible = false;
    function draw() {
      const cw = canvas.clientWidth, ch = canvas.clientHeight; if (!cw || !ch) return;
      const r = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2.5e6 / (cw * ch)));
      const w = Math.max(1, Math.round(cw * r)), h = Math.max(1, Math.round(ch * r));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const f = canvas._frame || { vw: cw, vh: ch, ox: 0, oy: 0 };
      gl.viewport(0, 0, w, h); gl.useProgram(prog);
      gl.enableVertexAttribArray(aPos); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(uRes, f.vw * r, f.vh * r); gl.uniform2f(uOff, f.ox * r, f.oy * r); gl.uniform1f(uTime, t);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function loop(now) {
      if (!visible) { raf = 0; return; }
      t += Math.min(0.05, (now - last) / 1000) * SPEED; last = now; draw(); raf = requestAnimationFrame(loop);
    }
    new IntersectionObserver((es) => {
      visible = es[0].isIntersecting;
      if (visible && !reduce && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
    }).observe(canvas);
    new ResizeObserver(draw).observe(canvas);
    canvas.addEventListener('reframe', draw);
    draw();
  }

  function scene(el) {
    const d = el.dataset, iw = +d.iw, ih = +d.ih, hz = +d.hz, vx = +d.vx, vy = +d.vy;
    const stage = el.querySelector('.sc-stage'), sky = el.querySelector('.sc-sky'), cv = sky.querySelector('canvas');
    const front = el.querySelector('.sc-front');

    // Fade the sky to night blue, strongest at the top, gone just below the horizon.
    const k = d.fade === undefined ? 1 : +d.fade, H = hz * 100;
    if (k > 0) {
      const fade = document.createElement('div'); fade.className = 'sc-fade';
      fade.style.background = `linear-gradient(180deg, rgba(0,0,19,${0.97 * k}) 0%, rgba(0,0,19,${0.94 * k}) ${H * 0.42}%, ` +
        `rgba(3,7,26,${0.66 * k}) ${H * 0.78}%, rgba(6,12,32,${0.18 * k}) ${H}%, rgba(0,0,19,0) ${H + 7}%)`;
      stage.insertBefore(fade, sky);
      if (front) front.appendChild(fade.cloneNode());
    }

    function layout() {
      const W = el.clientWidth, Hh = el.clientHeight; if (!W || !Hh) return;
      const sm = W < 600, fx = +((sm && d.fxSm) || d.fx), fy = +((sm && d.fySm) || d.fy);
      const s = Math.max(W / iw, Hh / ih), sw = iw * s, sh = ih * s, top = (Hh - sh) * fy;
      stage.style.cssText = `width:${sw}px;height:${sh}px;left:${(W - sw) * fx}px;top:${top}px`;
      el.style.setProperty('--hzy', (top + hz * sh) + 'px');
      const skyH = hz * sh; sky.style.height = skyH + 'px';
      const px = vx * sw, py = vy * sh, hw = Math.max(px, sw - px), hh = Math.max(py, skyH - py);
      // The shader scales star size and brightness with distance from its centre, measured in field heights. Size the
      // field so the farthest visible star sits about as far out as on the current site. The canvas covers only the sky.
      const vh = Math.max(2 * hh, Math.hypot(hw, hh) / 0.72), x0 = px - hw, y0 = py - vh / 2;
      cv._frame = { vw: 2 * hw, vh, ox: -x0, oy: vh + y0 - skyH };
      cv.dispatchEvent(new Event('reframe'));
    }
    new ResizeObserver(layout).observe(el);
    layout();
    starfield(cv);
  }

  document.querySelectorAll('[data-scene]').forEach(scene);
})();
