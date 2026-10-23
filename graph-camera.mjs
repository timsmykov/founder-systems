/** A camera over an immutable SVG layout. Zoom never changes node coordinates. */
export class GraphCamera {
  constructor({scale = 1, x = 0, y = 0, min = 0.5, max = 8} = {}) {
    Object.assign(this, {scale, x, y, min, max});
  }
  worldAt(point) { return {x: (point.x - this.x) / this.scale, y: (point.y - this.y) / this.scale}; }
  pan(dx, dy) { this.x += dx; this.y += dy; return this; }
  zoomAt(factor, point) {
    const world = this.worldAt(point);
    this.scale = Math.max(this.min, Math.min(this.max, this.scale * factor));
    this.x = point.x - world.x * this.scale;
    this.y = point.y - world.y * this.scale;
    return this;
  }
  fit() { this.scale = 1; this.x = 0; this.y = 0; return this; }
  transform() { return `translate(${this.x} ${this.y}) scale(${this.scale})`; }
}

export function bindGraphCamera(svg, layer, camera, {onChange = () => {}, onMove = () => {}} = {}) {
  const abort = new AbortController(), pointers = new Map();
  let lastPinch = null, lastSingle = null, moved = false, blockClickUntil = 0, gestureScale = null;
  const listen = (name, fn, options = {}) => svg.addEventListener(name, fn, {...options, signal: abort.signal});
  const local = (x, y) => {
    const matrix = svg.getScreenCTM();
    return matrix ? new DOMPoint(x, y).matrixTransform(matrix.inverse()) : {x, y};
  };
  const update = () => {layer.setAttribute('transform', camera.transform()); onChange(camera);};
  const midpoint = () => {const [a, b] = [...pointers.values()]; return {x: (a.x+b.x)/2, y: (a.y+b.y)/2, distance: Math.hypot(a.x-b.x, a.y-b.y)};};
  listen('wheel', e => {
    e.preventDefault(); onMove();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? svg.clientHeight : 1;
    if (e.ctrlKey || e.metaKey) {
      if (gestureScale !== null) return;
      camera.zoomAt(Math.exp(-Math.max(-150, Math.min(150, e.deltaY * unit)) * 0.008), local(e.clientX, e.clientY));
    } else {
      const a = local(0, 0), b = local(e.deltaX * unit, e.deltaY * unit);
      camera.pan(a.x-b.x, a.y-b.y);
    }
    update();
  }, {passive: false});
  listen('pointerdown', e => {
    if (e.button !== 0) return;
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if (pointers.size === 2) {lastPinch = midpoint(); moved = true;}
    else {lastSingle = {x:e.clientX,y:e.clientY};moved = false;}
  });
  listen('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, {x:e.clientX,y:e.clientY});
    if (pointers.size === 2) {
      const next = midpoint();
      if (lastPinch) {
        const a = local(lastPinch.x,lastPinch.y), b = local(next.x,next.y);
        camera.pan(b.x-a.x,b.y-a.y).zoomAt(next.distance/Math.max(1,lastPinch.distance),b);
      }
      lastPinch = next; moved = true;
    } else if (lastSingle) {
      const dx=e.clientX-lastSingle.x,dy=e.clientY-lastSingle.y;
      if (!moved && Math.hypot(dx,dy)<4) return;
      const a=local(lastSingle.x,lastSingle.y),b=local(e.clientX,e.clientY);
      camera.pan(b.x-a.x,b.y-a.y);lastSingle={x:e.clientX,y:e.clientY};moved=true;
    }
    if (moved) {svg.setPointerCapture(e.pointerId);svg.classList.add('dragging');onMove();update();}
  });
  const release = e => {
    pointers.delete(e.pointerId);lastPinch=null;lastSingle=null;
    if (moved) blockClickUntil=performance.now()+250;
    if (!pointers.size) {svg.classList.remove('dragging');moved=false;}
  };
  listen('pointerup',release);listen('pointercancel',release);listen('lostpointercapture',release);
  listen('click',e=>{if(performance.now()<blockClickUntil){e.preventDefault();e.stopImmediatePropagation();}}, {capture:true});
  // Safari exposes native trackpad pinches as GestureEvents rather than wheels.
  listen('gesturestart',e=>{e.preventDefault();gestureScale=1;onMove();},{passive:false});
  listen('gesturechange',e=>{e.preventDefault();const r=svg.getBoundingClientRect();camera.zoomAt(e.scale/(gestureScale||1),local(e.clientX||r.x+r.width/2,e.clientY||r.y+r.height/2));gestureScale=e.scale;update();},{passive:false});
  listen('gestureend',e=>{e.preventDefault();gestureScale=null;},{passive:false});
  update();
  return {update, zoom(factor){camera.zoomAt(factor,{x:500,y:380});onMove();update();},fit(){camera.fit();onMove();update();},destroy(){abort.abort();}};
}
