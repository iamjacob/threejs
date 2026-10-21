import { WH } from "./boooksControllerActions";

export const CONTROLLER_CSS = `
@property --pz{syntax:'<length>';inherits:true;initial-value:0px}
.bc-root{--bc-panel:#151a2e;--bc-fg:#f3ead8;--bc-red-1:#7c1414;--bc-red-2:#e22424;--bc-cream:#f3ead8;--bc-ink:#1d1a16;--bc-line:rgba(255,255,255,.12);
  --bc-spring:cubic-bezier(.34,1.56,.64,1);--bc-out:cubic-bezier(.22,1,.36,1);
  font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.bc-scrim{position:fixed;inset:0;background:transparent;opacity:0;pointer-events:none;z-index:50}
.bc-open .bc-scrim{opacity:1;pointer-events:auto}
.bc-dock{position:fixed;left:0;top:0;width:0;height:0;z-index:51;will-change:transform}
.bc-dock.bc-glide{transition:transform .55s var(--bc-spring)}

/* joystick gate */
.bc-base{position:absolute;left:-60px;top:-60px;width:120px;height:120px;border-radius:50%;pointer-events:none;
  background:rgba(13,16,32,.16);box-shadow:inset 0 0 0 1px rgba(243,234,216,.03);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);
  opacity:0;transform:scale(.74);transition:transform .5s var(--bc-spring),opacity .2s}
.bc-joy .bc-base{opacity:1;transform:scale(1)}
.bc-lifted .bc-base{opacity:0;transform:scale(.6)}
.bc-ticks{position:absolute;inset:0;border-radius:50%;opacity:0;transition:opacity .3s;
  background:repeating-conic-gradient(rgba(243,234,216,.06) 0 1.1deg,transparent 1.1deg 15deg);
  -webkit-mask:radial-gradient(circle,transparent 0 50px,#000 51px 55px,transparent 56px);mask:radial-gradient(circle,transparent 0 50px,#000 51px 55px,transparent 56px)}
.bc-joy .bc-ticks{opacity:1}
.bc-arc{position:absolute;inset:0;border-radius:50%;opacity:var(--mag,0);
  background:conic-gradient(from calc(var(--ang,0deg) - 45deg),transparent 0deg,rgba(255,70,70,1) 45deg,transparent 90deg);
  -webkit-mask:radial-gradient(circle,transparent 0 50px,#000 51px 57px,transparent 58px);mask:radial-gradient(circle,transparent 0 50px,#000 51px 57px,transparent 58px);
  filter:drop-shadow(0 0 6px rgba(226,36,36,.9))}

/* logo knob */
.bc-btn{position:absolute;left:-36px;top:-36px;width:72px;height:72px;border-radius:50%;border:0;padding:0;cursor:grab;touch-action:none;outline:none;
  background:none;perspective:240px;display:grid;place-items:center;
  transform:translate(var(--kx,0px),var(--ky,0px)) scale(var(--s,1));transition:--pz .14s var(--bc-out)}
.bc-down .bc-btn{--pz:3px}
.bc-lifted .bc-btn{cursor:grabbing}
.bc-cshadow{position:absolute;inset:14px;border-radius:50%;background:rgba(0,0,0,.35);filter:blur(10px);pointer-events:none;
  transform:translate(var(--shx,0px),calc(var(--shy,9px) - var(--pz)));transition:opacity .2s}
.bc-lifted .bc-cshadow{--shy:26px;opacity:.75}
.bc-cap{position:absolute;inset:0;border-radius:50%;pointer-events:none;
  background:radial-gradient(circle at var(--hx,35%) var(--hy,28%),rgba(255,255,255,.10) 0%,rgba(255,255,255,.025) 55%,rgba(255,255,255,0) 100%);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  transform:translateY(var(--pz)) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg))}
.bc-cap::after{content:"";position:absolute;left:var(--gx,16%);top:var(--gy,9%);width:44%;height:28%;border-radius:50%;
  background:radial-gradient(ellipse,rgba(255,255,255,.14),rgba(255,255,255,0) 70%);transform:rotate(-24deg)}
.bc-btn:focus-visible .bc-cap{box-shadow:0 0 0 3px var(--bc-red-2)}
.bc-lifted .bc-cap{box-shadow:0 0 0 1px rgba(243,234,216,.5)}
.bc-logo{position:relative;z-index:1;width:32px;height:36px;pointer-events:none;
  transform:translateY(var(--pz)) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:rotate .45s var(--bc-spring),scale .45s var(--bc-spring);
  filter:drop-shadow(0 6px 8px rgba(0,0,0,.45)) drop-shadow(0 0 14px rgba(226,36,36,.28))}
.bc-open .bc-logo{rotate:-12deg;scale:.9}
.bc-glow{position:absolute;inset:-14px;border-radius:50%;background:radial-gradient(circle,rgba(226,36,36,.45),transparent 65%);opacity:0;transition:opacity .25s;pointer-events:none}
.bc-open .bc-glow,.bc-joy .bc-glow{opacity:1}
.bc-ring{position:absolute;inset:-6px;width:84px;height:84px;pointer-events:none;transform:rotate(-90deg)}
.bc-ring circle{fill:none;stroke:var(--bc-cream);stroke-width:2.5;stroke-linecap:round;stroke-dasharray:258;stroke-dashoffset:258;opacity:0;transition:opacity .1s}
.bc-arming .bc-ring circle{opacity:1;stroke-dashoffset:0;transition:stroke-dashoffset .28s linear,opacity .1s}
.bc-ripple{position:absolute;left:-36px;top:-36px;width:72px;height:72px;border-radius:50%;border:2px solid var(--bc-red-2);pointer-events:none;animation:bc-rip .55s var(--bc-out) forwards}
@keyframes bc-rip{from{transform:scale(1);opacity:.9}to{transform:scale(2.2);opacity:0}}

/* infinite dial */
.bc-wheel{position:absolute;left:-${WH}px;top:-${WH}px;width:${WH * 2}px;height:${WH * 2}px;pointer-events:none;touch-action:none}
.bc-open .bc-wheel{pointer-events:auto}
.bc-track{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;opacity:0;transition:opacity .25s var(--bc-out)}
.bc-open .bc-track{opacity:1}
.bc-band{fill:none;stroke:rgba(13,16,32,.38);stroke-width:66;stroke-linecap:round}
.bc-rail{fill:none;stroke:rgba(243,234,216,.07);stroke-width:1}
.bc-thumb{fill:rgba(243,234,216,.55)}

.bc-item{position:absolute;left:calc(50% - 27px);top:calc(50% - 27px);width:54px;height:54px;border-radius:50%;border:0;padding:0;cursor:pointer;
  background:var(--bc-panel);color:var(--bc-fg);box-shadow:0 0 0 1px var(--bc-line),0 10px 24px rgba(0,0,0,.45);
  display:grid;place-items:center;opacity:0;pointer-events:none;
  transform:translate(0,0) scale(.3);transition:transform .4s var(--bc-spring),opacity .18s,background .15s}
.bc-item svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.bc-open .bc-item{opacity:var(--o,1);transform:translate(var(--x),var(--y)) scale(var(--k,1))}
.bc-open .bc-item.bc-focus{transform:translate(var(--x),var(--y)) scale(calc(var(--k,1) * 1.08));box-shadow:0 0 0 1px rgba(243,234,216,.28),0 12px 28px rgba(0,0,0,.5)}
.bc-open .bc-item.bc-active{background:linear-gradient(135deg,var(--bc-red-1),var(--bc-red-2));transform:translate(calc(var(--x)*1.1),calc(var(--y)*1.1)) scale(1.18)}
.bc-scrolling .bc-item{transition:background .15s;transition-delay:0ms!important}
.bc-item.bc-on::before{content:"";position:absolute;top:6px;right:8px;width:6px;height:6px;border-radius:50%;background:var(--bc-red-2);box-shadow:0 0 0 2px var(--bc-panel)}
.bc-item:focus-visible{box-shadow:0 0 0 3px var(--bc-fg)}
.bc-label{position:absolute;left:50%;top:50%;white-space:nowrap;font-size:10px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--bc-fg);background:rgba(13,16,32,.8);padding:3px 6px;border-radius:5px;pointer-events:none;opacity:0;
  transform:translate(calc(-50% + var(--lx)),calc(-50% + var(--ly)));transition:opacity .15s}
.bc-focus .bc-label,.bc-active .bc-label{opacity:1}
.bc-picking .bc-item:not(.bc-active) .bc-label{opacity:0}
.bc-item.bc-active .bc-label{background:var(--bc-cream);color:var(--bc-ink)}

@media (prefers-reduced-motion:reduce){.bc-root *{transition-duration:.01ms!important;animation-duration:.01ms!important}}
`;
