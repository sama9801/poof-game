// ============================================================
//  POOF — Full Game with Updated UI/UX
//  Matches the design mockups with proper HUD, pause menu,
//  game over screen, and character system
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";

// ── Google Fonts ──────────────────────────────────────────
const FONT_LINK = document.createElement("link");
FONT_LINK.rel = "stylesheet";
FONT_LINK.href = "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Space+Mono:wght@400;700&display=swap";
document.head.appendChild(FONT_LINK);

// ── Constants ─────────────────────────────────────────────
const TARGET_HITS  = 15;
const TIME_LIMIT   = 45;
const MAX_ON_SCREEN = 6;

// ── Color tokens ──────────────────────────────────────────
const C = {
  bg:         "#0a0614",
  bgMid:      "#0e0820",
  purple:     "#a855f7",
  purpleLight:"#c084fc",
  cyan:       "#22d3ee",
  pink:       "#ff4080",
  pinkSoft:   "#ff6b9d",
  gold:       "#ffd700",
  blossom:    "#ffb7c5",
  white:      "#e8e0ff",
  textMuted:  "rgba(200,190,255,0.55)",
  border:     "rgba(168,85,247,0.25)",
  btnBg:      "rgba(168,85,247,0.9)",
  btnBgHover: "rgba(168,85,247,1)",
  cardBg:     "rgba(20,10,50,0.85)",
};

// ── Character placeholder colors ──
const CHAR_COLORS = {
  he:   { main:"#1e3a6e", accent:"#4a90d9", skin:"#f0c090", hair:"#1a1a1a", label:"Smug Guy" },
  she:  { main:"#e91e8c", accent:"#ffd700", skin:"#fad7a0", hair:"#6b2fa0", label:"Dismissive Girl" },
  they: { main:"#2ab5a0", accent:"#ffe66d", skin:"#f5cba7", hair:"#ff80b0", label:"Unbothered They" },
};

// ── Spawn count rules ─────────────────────────────────────
function spawnCounts(names) {
  const n = names.length;
  return names.map((item) => ({
    ...item,
    count: n === 1 ? 5 : n === 2 ? 3 : 2,
  }));
}

// ════════════════════════════════════════════════════════════
//  MUSIC (Tone.js lo-fi beat + rain ambience)
// ════════════════════════════════════════════════════════════
let toneStarted = false;
let musicVolume = 0.4;
let masterGain = null;
let rainNodes = [];

async function startMusic() {
  if (toneStarted) return;
  try {
    const Tone = await import("tone");
    await Tone.start();
    toneStarted = true;

    masterGain = new Tone.Gain(musicVolume).toDestination();

    // Main rain ambience — pink noise filtered to sound like rain
    const rainNoise = new Tone.Noise("pink").start();
    const rainLP = new Tone.Filter(800, "lowpass");
    const rainHP = new Tone.Filter(200, "highpass");
    const rainGain = new Tone.Gain(0.18);
    rainNoise.connect(rainLP);
    rainLP.connect(rainHP);
    rainHP.connect(rainGain);
    rainGain.connect(masterGain);

    // Heavier rain layer — white noise for sharper droplets
    const dropNoise = new Tone.Noise("white").start();
    const dropBP = new Tone.Filter(2500, "bandpass");
    dropBP.Q.value = 0.8;
    const dropGain = new Tone.Gain(0.03);
    dropNoise.connect(dropBP);
    dropBP.connect(dropGain);
    dropGain.connect(masterGain);

    // Distant thunder rumble (occasional low drone)
    const thunderNoise = new Tone.Noise("brown").start();
    const thunderLP = new Tone.Filter(120, "lowpass");
    const thunderGain = new Tone.Gain(0);
    thunderNoise.connect(thunderLP);
    thunderLP.connect(thunderGain);
    thunderGain.connect(masterGain);

    // Store nodes so we can stop them
    rainNodes = [rainNoise, dropNoise, thunderNoise];

    // Random thunder rumbles
    const triggerThunder = () => {
      if (!toneStarted) return;
      const now = Tone.now();
      thunderGain.gain.setValueAtTime(0, now);
      thunderGain.gain.linearRampToValueAtTime(0.08 + Math.random()*0.06, now + 0.5);
      thunderGain.gain.linearRampToValueAtTime(0, now + 2.5 + Math.random()*2);
      setTimeout(triggerThunder, 8000 + Math.random()*15000);
    };
    setTimeout(triggerThunder, 4000 + Math.random()*6000);

  } catch(e) {
    console.log("Tone.js not available:", e);
  }
}

function stopMusic() {
  if (!toneStarted) return;
  rainNodes.forEach(node => { try { node.stop(); } catch(e) {} });
  rainNodes = [];
  toneStarted = false;
  masterGain = null;
}

function setMusicVolume(v) {
  musicVolume = v;
  if (masterGain) masterGain.gain.value = v;
}

async function playSliceSound() {
  try {
    const Tone = await import("tone");
    const synth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
    }).toDestination();
    synth.volume.value = -10;
    synth.triggerAttackRelease("G5", "16n");
    setTimeout(() => synth.triggerAttackRelease("C6","16n"), 80);
  } catch(e) {}
}

async function playWinSound() {
  try {
    const Tone = await import("tone");
    const synth = new Tone.PolySynth().toDestination();
    synth.volume.value = -14;
    synth.triggerAttackRelease(["C4","E4","G4","C5"], "4n");
  } catch(e) {}
}


// ════════════════════════════════════════════════════════════
//  CANVAS HELPERS
// ════════════════════════════════════════════════════════════
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.arcTo(x+w,y,x+w,y+r,r); ctx.lineTo(x+w,y+h-r);
  ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h);
  ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r);
  ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
}

// ════════════════════════════════════════════════════════════
//  CHARACTER DRAWING
// ════════════════════════════════════════════════════════════
function drawIdleChar(ctx, x, y, s, col, name, gender) {
  ctx.save(); ctx.globalAlpha = 0.2;
  ctx.fillStyle = "#000";
  ctx.beginPath(); ctx.ellipse(x, y+s*52, s*28, s*7, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  // Legs
  ctx.fillStyle = "#1a1a2e";
  ctx.beginPath(); rrect(ctx, x-s*15, y+s*2, s*12, s*40, s*5); ctx.fill();
  ctx.beginPath(); rrect(ctx, x+s*3,  y+s*2, s*12, s*40, s*5); ctx.fill();

  // Shoes
  ctx.fillStyle = "#111";
  ctx.beginPath(); rrect(ctx, x-s*18, y+s*38, s*17, s*9, s*4); ctx.fill();
  ctx.beginPath(); rrect(ctx, x+s*1,  y+s*38, s*17, s*9, s*4); ctx.fill();
  // Shoe white stripe
  ctx.fillStyle = "#fff";
  ctx.beginPath(); rrect(ctx, x-s*16, y+s*42, s*6, s*3, s*1); ctx.fill();
  ctx.beginPath(); rrect(ctx, x+s*3,  y+s*42, s*6, s*3, s*1); ctx.fill();

  // Body (jacket)
  ctx.fillStyle = col.main;
  ctx.beginPath();
  ctx.moveTo(x-s*22, y-s*44); ctx.lineTo(x+s*22, y-s*44);
  ctx.lineTo(x+s*26, y+s*4);  ctx.lineTo(x-s*26, y+s*4);
  ctx.closePath(); ctx.fill();
  // Jacket highlight stripe
  ctx.fillStyle = col.accent;
  ctx.beginPath(); rrect(ctx, x-s*26, y-s*44, s*4, s*48, s*2); ctx.fill();
  ctx.beginPath(); rrect(ctx, x+s*22, y-s*44, s*4, s*48, s*2); ctx.fill();

  // Arms crossed
  ctx.fillStyle = col.skin;
  ctx.beginPath(); rrect(ctx, x-s*36, y-s*38, s*14, s*26, s*7); ctx.fill();
  ctx.beginPath(); rrect(ctx, x+s*22, y-s*38, s*14, s*26, s*7); ctx.fill();
  ctx.fillStyle = col.main;
  ctx.beginPath(); rrect(ctx, x-s*26, y-s*28, s*52, s*14, s*5); ctx.fill();

  // Neck
  ctx.fillStyle = col.skin;
  ctx.beginPath(); rrect(ctx, x-s*6, y-s*56, s*12, s*14, s*4); ctx.fill();

  // Head
  ctx.fillStyle = col.skin;
  ctx.beginPath(); ctx.ellipse(x, y-s*72, s*22, s*24, 0, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.1)"; ctx.lineWidth = s*0.5; ctx.stroke();

  // Hair
  ctx.fillStyle = col.hair;
  if (gender === "she") {
    // Long flowing hair for girls
    // Top of head
    ctx.beginPath(); ctx.ellipse(x, y-s*88, s*26, s*18, 0, Math.PI, Math.PI*2); ctx.fill();
    // Side hair flowing down (left)
    ctx.beginPath();
    ctx.moveTo(x-s*24, y-s*80);
    ctx.quadraticCurveTo(x-s*30, y-s*40, x-s*26, y-s*10);
    ctx.quadraticCurveTo(x-s*24, y+s*5, x-s*20, y+s*10);
    ctx.lineTo(x-s*16, y+s*10);
    ctx.quadraticCurveTo(x-s*18, y-s*5, x-s*20, y-s*40);
    ctx.quadraticCurveTo(x-s*18, y-s*70, x-s*20, y-s*80);
    ctx.closePath(); ctx.fill();
    // Side hair flowing down (right)
    ctx.beginPath();
    ctx.moveTo(x+s*24, y-s*80);
    ctx.quadraticCurveTo(x+s*30, y-s*40, x+s*26, y-s*10);
    ctx.quadraticCurveTo(x+s*24, y+s*5, x+s*20, y+s*10);
    ctx.lineTo(x+s*16, y+s*10);
    ctx.quadraticCurveTo(x+s*18, y-s*5, x+s*20, y-s*40);
    ctx.quadraticCurveTo(x+s*18, y-s*70, x+s*20, y-s*80);
    ctx.closePath(); ctx.fill();
    // Bangs
    ctx.beginPath();
    ctx.moveTo(x-s*20, y-s*76);
    ctx.quadraticCurveTo(x-s*10, y-s*68, x-s*4, y-s*72);
    ctx.quadraticCurveTo(x, y-s*66, x+s*4, y-s*72);
    ctx.quadraticCurveTo(x+s*10, y-s*68, x+s*20, y-s*76);
    ctx.lineTo(x+s*24, y-s*82);
    ctx.quadraticCurveTo(x, y-s*96, x-s*24, y-s*82);
    ctx.closePath(); ctx.fill();
    // Hair shine
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath(); ctx.ellipse(x-s*6, y-s*88, s*8, s*6, -0.3, 0, Math.PI*2); ctx.fill();
  } else {
    // Short spiky hair for boys / they
    ctx.beginPath(); ctx.ellipse(x, y-s*88, s*24, s*16, 0, Math.PI, Math.PI*2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x-s*24, y-s*76); ctx.lineTo(x-s*22, y-s*60);
    ctx.lineTo(x+s*22, y-s*60); ctx.lineTo(x+s*24, y-s*76);
    ctx.closePath(); ctx.fill();
    // Spiky hair top
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i*s*8, y-s*88);
      ctx.lineTo(x + i*s*8 - s*4, y-s*96 - Math.abs(i)*s*3);
      ctx.lineTo(x + i*s*8 + s*4, y-s*96 - Math.abs(i)*s*3);
      ctx.closePath(); ctx.fill();
    }
  }

  // Eyes (confident/smug)
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.ellipse(x-s*8, y-s*74, s*6, s*7, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x+s*8, y-s*74, s*6, s*7, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#1a1a2e";
  ctx.beginPath(); ctx.arc(x-s*8, y-s*73, s*3.5, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x+s*8, y-s*73, s*3.5, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(x-s*6.5, y-s*75, s*1.2, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x+s*9.5, y-s*75, s*1.2, 0, Math.PI*2); ctx.fill();

  // Smug eyebrows (angled)
  ctx.strokeStyle = col.hair; ctx.lineWidth = s*2.5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x-s*14,y-s*83); ctx.lineTo(x-s*3,y-s*81); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x+s*14,y-s*83); ctx.lineTo(x+s*3, y-s*81); ctx.stroke();

  // Smirk
  ctx.strokeStyle = "#c0786a"; ctx.lineWidth = s*2;
  ctx.beginPath(); ctx.moveTo(x-s*4,y-s*62); ctx.quadraticCurveTo(x+s*4,y-s*58,x+s*10,y-s*63); ctx.stroke();

  // Name label below
  ctx.font = `700 ${s*11}px 'Nunito',sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(230,220,255,0.85)";
  ctx.fillText(name, x, y+s*56);
}

function drawShockedHead(ctx, x, y, s, col, rotAngle, gender) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotAngle);

  ctx.fillStyle = col.skin;
  ctx.beginPath(); ctx.ellipse(0, 0, s*22, s*24, 0, 0, Math.PI*2); ctx.fill();

  // Hair
  ctx.fillStyle = col.hair;
  if (gender === "she") {
    // Long hair flying wildly
    ctx.beginPath(); ctx.ellipse(0,-s*14,s*26,s*18,0,Math.PI,Math.PI*2); ctx.fill();
    // Long strands flying outward
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI + i * (Math.PI / 4.5);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*s*20, Math.sin(a)*s*16 - s*8);
      ctx.quadraticCurveTo(
        Math.cos(a)*s*38, Math.sin(a)*s*30 - s*10,
        Math.cos(a+0.2)*s*44, Math.sin(a+0.2)*s*36 - s*6
      );
      ctx.quadraticCurveTo(
        Math.cos(a+0.4)*s*36, Math.sin(a+0.4)*s*28 - s*8,
        Math.cos(a+0.3)*s*18, Math.sin(a+0.3)*s*14 - s*8
      );
      ctx.closePath(); ctx.fill();
    }
  } else {
    // Short wild hair for boys/they
    ctx.beginPath(); ctx.ellipse(0,-s*14,s*24,s*16,0,Math.PI,Math.PI*2); ctx.fill();
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI + i * (Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*s*18, Math.sin(a)*s*14 - s*8);
      ctx.lineTo(Math.cos(a)*s*30, Math.sin(a)*s*22 - s*12);
      ctx.lineTo(Math.cos(a+0.3)*s*20, Math.sin(a+0.3)*s*16 - s*8);
      ctx.closePath(); ctx.fill();
    }
  }

  // Wide shocked eyes
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.ellipse(-s*8,-s*2,s*8,s*9,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(+s*8,-s*2,s*8,s*9,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = "#1a1a2e";
  ctx.beginPath(); ctx.arc(-s*8,-s*2,s*4,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(+s*8,-s*2,s*4,0,Math.PI*2); ctx.fill();
  // Tiny shocked pupils
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(-s*6,-s*4,s*1.5,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(+s*10,-s*4,s*1.5,0,Math.PI*2); ctx.fill();

  // Open mouth
  ctx.fillStyle = "#8b4513";
  ctx.beginPath(); ctx.ellipse(0,s*12,s*8,s*9,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = "#1a1a2e";
  ctx.beginPath(); ctx.ellipse(0,s*13,s*6,s*7,0,0,Math.PI*2); ctx.fill();

  // Shock lines
  ctx.strokeStyle = "#ffd700"; ctx.lineWidth = s*1.5; ctx.lineCap = "round";
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI*0.8 + i * 0.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a)*s*26, Math.sin(a)*s*26 - s*4);
    ctx.lineTo(Math.cos(a)*s*32, Math.sin(a)*s*32 - s*4);
    ctx.stroke();
  }

  ctx.restore();
}

function drawHeadlessBody(ctx, x, y, s, col, rotAngle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotAngle);

  // Neck stump
  ctx.fillStyle = col.skin;
  ctx.beginPath(); rrect(ctx, -s*6, -s*56, s*12, s*14, s*4); ctx.fill();

  // Body (jacket)
  ctx.fillStyle = col.main;
  ctx.beginPath();
  ctx.moveTo(-s*22,-s*44); ctx.lineTo(s*22,-s*44);
  ctx.lineTo(s*26, s*4);   ctx.lineTo(-s*26, s*4);
  ctx.closePath(); ctx.fill();
  // Jacket stripes
  ctx.fillStyle = col.accent;
  ctx.beginPath(); rrect(ctx, -s*26,-s*44,s*4,s*48,s*2); ctx.fill();
  ctx.beginPath(); rrect(ctx, s*22,-s*44,s*4,s*48,s*2); ctx.fill();

  // Arms
  ctx.fillStyle = col.skin;
  ctx.beginPath(); rrect(ctx,-s*36,-s*38,s*14,s*26,s*7); ctx.fill();
  ctx.beginPath(); rrect(ctx,+s*22,-s*38,s*14,s*26,s*7); ctx.fill();
  ctx.fillStyle = col.main;
  ctx.beginPath(); rrect(ctx,-s*26,-s*28,s*52,s*14,s*5); ctx.fill();

  // Legs
  ctx.fillStyle = "#1a1a2e";
  ctx.beginPath(); rrect(ctx,-s*15,s*2,s*12,s*40,s*5); ctx.fill();
  ctx.beginPath(); rrect(ctx,+s*3, s*2,s*12,s*40,s*5); ctx.fill();

  // Shoes
  ctx.fillStyle="#111";
  ctx.beginPath(); rrect(ctx,-s*18,s*38,s*17,s*9,s*4); ctx.fill();
  ctx.beginPath(); rrect(ctx,+s*1, s*38,s*17,s*9,s*4); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); rrect(ctx,-s*16,s*42,s*6,s*3,s*1); ctx.fill();
  ctx.beginPath(); rrect(ctx,+s*3, s*42,s*6,s*3,s*1); ctx.fill();

  ctx.restore();
}


// ════════════════════════════════════════════════════════════
//  PARTICLE CLASSES
// ════════════════════════════════════════════════════════════
class StarParticle {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = (Math.random()-0.5)*10;
    this.vy = (Math.random()-0.5)*10 - 3;
    this.rot = Math.random()*Math.PI*2;
    this.vrot = (Math.random()-0.5)*0.3;
    this.size = 8 + Math.random()*14;
    this.life = 1;
    this.decay = 0.02 + Math.random()*0.015;
    this.color = Math.random() > 0.5 ? C.gold : "#fff176";
  }
  update() {
    this.x+=this.vx; this.y+=this.vy;
    this.vy+=0.2; this.rot+=this.vrot;
    this.life-=this.decay;
  }
  draw(ctx) {
    if (this.life<=0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0,this.life);
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    for (let i=0; i<5; i++) {
      const a = (i*4*Math.PI/5) - Math.PI/2;
      const b = (i*4*Math.PI/5 + 2*Math.PI/5) - Math.PI/2;
      if (i===0) ctx.moveTo(Math.cos(a)*this.size, Math.sin(a)*this.size);
      else ctx.lineTo(Math.cos(a)*this.size, Math.sin(a)*this.size);
      ctx.lineTo(Math.cos(b)*this.size*0.4, Math.sin(b)*this.size*0.4);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

class BlossomParticle {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = (Math.random()-0.5)*4;
    this.vy = -Math.random()*2 - 1;
    this.rot = Math.random()*Math.PI*2;
    this.vrot = (Math.random()-0.5)*0.08;
    this.size = 6 + Math.random()*10;
    this.life = 1;
    this.decay = 0.008 + Math.random()*0.008;
    this.swing = Math.random()*0.05;
    this.swingPhase = Math.random()*Math.PI*2;
  }
  update() {
    this.swingPhase += 0.08;
    this.x += this.vx + Math.sin(this.swingPhase)*this.swing;
    this.y += this.vy;
    this.vy += 0.06;
    this.rot += this.vrot;
    this.life -= this.decay;
  }
  draw(ctx) {
    if (this.life<=0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0,this.life);
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    for (let i=0; i<5; i++) {
      ctx.save();
      ctx.rotate(i * Math.PI*2/5);
      ctx.fillStyle = i%2===0 ? C.blossom : "#ffcdd6";
      ctx.beginPath();
      ctx.ellipse(0, -this.size*0.7, this.size*0.4, this.size*0.7, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#ffe082";
    ctx.beginPath(); ctx.arc(0,0,this.size*0.25,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

class RainDrop {
  constructor(w, h) { this.w=w; this.h=h; this.reset(true); }
  reset(init) {
    this.x = Math.random()*this.w;
    this.y = init ? Math.random()*this.h : -20;
    this.len = 20 + Math.random()*35;
    this.spd = 9 + Math.random()*7;
    this.a   = 0.04 + Math.random()*0.07;
  }
  update() {
    this.y+=this.spd; this.x-=1.5;
    if (this.y>this.h+60) this.reset(false);
  }
  draw(ctx) {
    ctx.save();
    ctx.strokeStyle=`rgba(180,210,240,${this.a})`;
    ctx.lineWidth=0.7;
    ctx.beginPath();
    ctx.moveTo(this.x,this.y);
    ctx.lineTo(this.x-this.len*0.15,this.y+this.len);
    ctx.stroke();
    ctx.restore();
  }
}

// ════════════════════════════════════════════════════════════
//  SORRY BUBBLE
// ════════════════════════════════════════════════════════════
class SorryBubble {
  constructor(x,y) {
    this.x=x; this.y=y; this.vy=-1.5;
    this.life=1; this.scale=0; this.decay=0.012;
  }
  update() {
    this.y+=this.vy; this.vy*=0.96;
    this.scale=Math.min(1,this.scale+0.12);
    this.life-=this.decay;
  }
  draw(ctx) {
    if(this.life<=0) return;
    ctx.save();
    ctx.globalAlpha=Math.max(0,this.life);
    ctx.translate(this.x,this.y);
    ctx.scale(this.scale,this.scale);
    const w=90,h=44,r=22;
    ctx.fillStyle="#fff";
    ctx.strokeStyle=C.pink;
    ctx.lineWidth=3;
    rrect(ctx,-w/2,-h/2,w,h,r);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-10,h/2); ctx.lineTo(10,h/2); ctx.lineTo(0,h/2+14);
    ctx.closePath(); ctx.fillStyle="#fff"; ctx.fill();
    ctx.strokeStyle=C.pink; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(-10,h/2); ctx.lineTo(0,h/2+14); ctx.lineTo(10,h/2); ctx.stroke();
    ctx.fillStyle=C.pink;
    ctx.font="bold 20px 'Nunito',sans-serif";
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText("Sorry!",0,0);
    ctx.restore();
  }
}


// ════════════════════════════════════════════════════════════
//  ENEMY CLASS
// ════════════════════════════════════════════════════════════
class Enemy {
  constructor(nameObj, w, h, slotX) {
    this.name   = nameObj.name;
    this.gender = nameObj.gender;
    this.col    = CHAR_COLORS[nameObj.gender] || CHAR_COLORS.he;
    this.id     = Math.random();
    this.W=w; this.H=h;
    this.s = Math.max(0.85, Math.min(1.5, w/560));

    this.x      = slotX;
    this.groundY= h * 0.70;
    // Start above the screen
    this.y      = -this.s * 120;
    this.baseY  = this.groundY;
    this.vy     = 0;

    this.phase    = Math.random()*Math.PI*2;
    this.bobSpd   = 0.35+Math.random()*0.3;
    this.vx       = (Math.random()-0.5)*0.5;

    this.opacity  = 1;
    this.sliced   = false;
    this.dead     = false;
    this.flash    = 0;
    this.sliceT   = 0;

    const hdir = Math.random()<0.5?-1:1;
    this.head = { x:0,y:0, vx:hdir*(4+Math.random()*4), vy:-(9+Math.random()*4), rot:0, vrot:hdir*(0.1+Math.random()*0.12) };
    this.body = { rot:0, vrot:(Math.random()-0.5)*0.04, vx:(Math.random()-0.5)*1.5 };
  }

  update() {
    if (!this.sliced) {
      // Drop slowly from above — destroyed if they reach the bottom
      this.vy += 0.15; // gentle gravity
      this.y += this.vy;
      // Cap fall speed so they drift down slowly
      if (this.vy > 3) this.vy = 3;
      // Slight horizontal drift
      this.x += this.vx;
      if (this.x < this.W*0.08 || this.x > this.W*0.92) this.vx*=-1;
      // If they fall past the bottom, they're gone (missed)
      if (this.y > this.H + 60) {
        this.dead = true;
      }
      if (this.flash>0) this.flash--;
    } else {
      this.sliceT++;
      this.head.x  += this.head.vx;
      this.head.y  += this.head.vy;
      this.head.vy += 0.5;
      this.head.rot+= this.head.vrot;
      this.body.rot = Math.min(Math.PI*0.6, this.body.rot+0.045);
      if (this.sliceT>100) this.dead=true;
    }
  }

  hitTest(mx,my) {
    if (this.sliced) return false;
    const s=this.s;
    return Math.abs(mx-this.x)<s*34 && my>this.y-s*100 && my<this.y+s*56;
  }

  slice() {
    if (this.sliced) return false;
    this.sliced=true; this.flash=10;
    return true;
  }

  draw(ctx) {
    if (this.dead) return;
    ctx.save();
    ctx.globalAlpha=this.opacity;
    if (this.flash>0 && this.flash%4<2) ctx.filter="brightness(3) saturate(0.2)";

    if (!this.sliced) {
      drawIdleChar(ctx, this.x, this.y, this.s, this.col, this.name, this.gender);
    } else {
      ctx.save();
      ctx.translate(this.x + this.body.vx*this.sliceT, this.y);
      ctx.rotate(this.body.rot);
      drawHeadlessBody(ctx, 0, 0, this.s, this.col, 0);
      ctx.restore();
      ctx.save();
      ctx.translate(this.x+this.head.x, this.y-this.s*72+this.head.y);
      drawShockedHead(ctx, 0, 0, this.s, this.col, this.head.rot, this.gender);
      ctx.restore();
    }
    ctx.restore();
  }
}

// ════════════════════════════════════════════════════════════
//  BACKGROUND IMAGE (loaded once)
// ════════════════════════════════════════════════════════════
let bgImage = null;
let bgLoaded = false;
const bgImg = new Image();
bgImg.onload = () => { bgImage = bgImg; bgLoaded = true; };
bgImg.src = process.env.PUBLIC_URL + "/bg.jpg";

// ════════════════════════════════════════════════════════════
//  BACKGROUND DRAWER
// ════════════════════════════════════════════════════════════
function drawBackground(ctx, w, h, frame) {
  if (bgLoaded && bgImage) {
    // Draw the image covering the full canvas (cover mode)
    const imgRatio = bgImage.width / bgImage.height;
    const canvasRatio = w / h;
    let drawW, drawH, drawX, drawY;
    if (canvasRatio > imgRatio) {
      drawW = w;
      drawH = w / imgRatio;
      drawX = 0;
      drawY = (h - drawH) / 2;
    } else {
      drawH = h;
      drawW = h * imgRatio;
      drawX = (w - drawW) / 2;
      drawY = 0;
    }
    ctx.drawImage(bgImage, drawX, drawY, drawW, drawH);

    // Slight dark overlay so characters pop
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(0, 0, w, h);
  } else {
    // Fallback if image hasn't loaded yet
    const sky = ctx.createLinearGradient(0,0,0,h);
    sky.addColorStop(0,"#0a1a2a");
    sky.addColorStop(0.6,"#0d2535");
    sky.addColorStop(1,"#061218");
    ctx.fillStyle=sky; ctx.fillRect(0,0,w,h);
  }
}


// ════════════════════════════════════════════════════════════
//  GAME CANVAS COMPONENT
// ════════════════════════════════════════════════════════════
function GameCanvas({ nameObjs, onWin, onLose, onPause, paused }) {
  const cvs   = useRef();
  const G     = useRef(null);
  const ptr   = useRef({ down:false, trail:[], x:0, y:0 });
  const dpr   = window.devicePixelRatio||1;

  const buildPool = useCallback(() => {
    const counts = spawnCounts(nameObjs);
    const pool   = [];
    counts.forEach(item => {
      for (let i=0;i<item.count;i++) pool.push({ name:item.name, gender:item.gender });
    });
    return pool;
  },[nameObjs]);

  const spawnEnemy = useCallback((pool,w,h) => {
    const item = pool[Math.floor(Math.random()*pool.length)];
    const margin = w*0.12;
    const slotX  = margin + Math.random()*(w-margin*2);
    return new Enemy(item, w, h, slotX);
  },[]);

  useEffect(()=>{
    const el=cvs.current; if(!el) return;
    el.width  = el.offsetWidth*dpr;
    el.height = el.offsetHeight*dpr;
    const w=el.width, h=el.height;
    const pool = buildPool();
    const initialEnemies = [];
    const startCount = Math.min(MAX_ON_SCREEN, pool.length);
    for(let i=0;i<Math.min(3,startCount);i++) {
      const en = spawnEnemy(pool,w,h);
      en.x = w*(0.15 + i*(0.7/Math.max(2,startCount-1)));
      // Stagger the drop — each one starts higher so they fall in sequence
      en.y = -(i * 80 + 50) * en.s;
      initialEnemies.push(en);
    }
    G.current = {
      enemies:  initialEnemies,
      particles:[], bubbles:[],
      rain:     Array.from({length:110},()=>new RainDrop(w,h)),
      hits:0, frame:0, phase:"playing", w, h,
      slowMo:0, pending:[],
      pool,
    };
  },[nameObjs, dpr, buildPool, spawnEnemy]);

  const getXY = useCallback((e)=>{
    const el=cvs.current; if(!el) return{x:0,y:0};
    const r=el.getBoundingClientRect();
    const src=e.touches?(e.touches[0]||e.changedTouches[0]):e;
    return{x:(src.clientX-r.left)*dpr, y:(src.clientY-r.top)*dpr};
  },[dpr]);

  const onDown = useCallback(e=>{
    e.preventDefault();
    const p=getXY(e);
    ptr.current={down:true,trail:[p],x:p.x,y:p.y};
  },[getXY]);

  const onUp = useCallback(e=>{
    e.preventDefault();
    ptr.current.down=false; ptr.current.trail=[];
  },[]);

  const onMove = useCallback(e=>{
    e.preventDefault();
    if(!ptr.current.down) return;
    const g=G.current; if(!g||g.phase!=="playing") return;
    const p=getXY(e);
    ptr.current.trail.push(p);
    if(ptr.current.trail.length>20) ptr.current.trail.shift();
    ptr.current.x=p.x; ptr.current.y=p.y;

    g.enemies.forEach(en=>{
      if(en.hitTest(p.x,p.y)){
        if(en.slice()){
          g.hits++;
          g.slowMo=20;
          playSliceSound();
          for(let i=0;i<18;i++) g.particles.push(new StarParticle(p.x,p.y));
          for(let i=0;i<12;i++) g.particles.push(new BlossomParticle(p.x,p.y));
          g.bubbles.push(new SorryBubble(en.x, en.y - en.s*100));
        }
      }
    });
  },[getXY]);

  useEffect(()=>{
    const el=cvs.current; if(!el) return;
    let raf;
    function loop(){
      const g=G.current; if(!g){raf=requestAnimationFrame(loop);return;}
      const ctx=el.getContext("2d");
      const{w,h}=g;

      // Always draw background even when paused
      drawBackground(ctx,w,h,g.frame);
      g.rain.forEach(r=>{r.update();r.draw(ctx);});

      if(!paused && g.phase==="playing") {
        if(g.slowMo>0) g.slowMo--;
        g.frame++;

        // Pending respawns
        g.pending=g.pending.filter(p=>{
          p.delay--;
          if(p.delay<=0 && g.enemies.length<MAX_ON_SCREEN){
            g.enemies.push(spawnEnemy(g.pool,g.w,g.h));
            return false;
          }
          return true;
        });

        // Update enemies
        g.enemies.forEach(en=>en.update());
        const dead=g.enemies.filter(en=>en.dead).length;
        g.enemies=g.enemies.filter(en=>!en.dead);
        for(let i=0;i<dead;i++){
          g.pending.push({delay:80+Math.floor(Math.random()*50)});
        }
      }

      // Draw slash trail
      if(ptr.current.down && ptr.current.trail.length>2){
        const tr=ptr.current.trail;
        ctx.save();
        ctx.strokeStyle="rgba(255,255,255,0.9)";
        ctx.lineWidth=4*dpr; ctx.lineCap="round"; ctx.lineJoin="round";
        ctx.shadowColor="#c084fc"; ctx.shadowBlur=18*dpr;
        ctx.beginPath(); ctx.moveTo(tr[0].x,tr[0].y);
        tr.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
        ctx.stroke(); ctx.restore();
      }

      // Draw particles
      g.particles=g.particles.filter(p=>p.life>0);
      g.particles.forEach(p=>{p.update();p.draw(ctx);});

      // Draw bubbles
      g.bubbles=g.bubbles.filter(b=>b.life>0);
      g.bubbles.forEach(b=>{b.update();b.draw(ctx);});

      // Draw enemies
      g.enemies.forEach(en=>en.draw(ctx));

      // Slow mo overlay
      if(g.slowMo>0){
        ctx.save(); ctx.globalAlpha=g.slowMo/20*0.12;
        ctx.fillStyle="#c0d8ff"; ctx.fillRect(0,0,w,h);
        ctx.restore();
      }

      // HUD
      drawHUD(ctx,g,w,h,dpr);

      // Win / Lose check
      if(!paused && g.phase==="playing"){
        if(g.hits>=TARGET_HITS){
          g.phase="done";
          playWinSound();
          setTimeout(()=>onWin(g.hits),900);
        }
        if(g.frame/60>=TIME_LIMIT && g.hits<TARGET_HITS){
          g.phase="done";
          setTimeout(()=>onLose(g.hits),900);
        }
      }

      raf=requestAnimationFrame(loop);
    }
    raf=requestAnimationFrame(loop);
    return()=>cancelAnimationFrame(raf);
  },[nameObjs,onWin,onLose,dpr,spawnEnemy,paused]);

  return (
    <canvas ref={cvs}
      style={{width:"100%",height:"100%",display:"block",cursor:"crosshair",touchAction:"none"}}
      onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
      onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
    />
  );
}

function drawHUD(ctx,g,w,h,dpr){
  const padding = 16*dpr;
  const hudH = 40*dpr;
  const hudY = padding;

  // Left: SLICES counter with rounded pill
  ctx.save();
  const sliceW = 120*dpr;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  rrect(ctx, padding, hudY, sliceW, hudH, hudH/2); ctx.fill();
  ctx.strokeStyle = "rgba(168,85,247,0.4)";
  ctx.lineWidth = 1.5*dpr;
  rrect(ctx, padding, hudY, sliceW, hudH, hudH/2); ctx.stroke();

  ctx.font = `600 ${9*dpr}px 'Space Mono',monospace`;
  ctx.fillStyle = "rgba(200,180,255,0.6)";
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText("SLICES", padding + 14*dpr, hudY + hudH*0.35);

  ctx.font = `800 ${14*dpr}px 'Nunito',sans-serif`;
  ctx.fillStyle = "#fff";
  ctx.fillText(`${g.hits} / ${TARGET_HITS}`, padding + 14*dpr, hudY + hudH*0.7);
  ctx.restore();

  // Right: TIME counter with rounded pill
  ctx.save();
  const timeW = 100*dpr;
  const timeX = w - padding - timeW;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  rrect(ctx, timeX, hudY, timeW, hudH, hudH/2); ctx.fill();
  ctx.strokeStyle = "rgba(168,85,247,0.4)";
  ctx.lineWidth = 1.5*dpr;
  rrect(ctx, timeX, hudY, timeW, hudH, hudH/2); ctx.stroke();

  ctx.font = `600 ${9*dpr}px 'Space Mono',monospace`;
  ctx.fillStyle = "rgba(200,180,255,0.6)";
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText("TIME", timeX + 14*dpr, hudY + hudH*0.35);

  const remain = Math.max(0, TIME_LIMIT - g.frame/60);
  ctx.font = `800 ${14*dpr}px 'Nunito',sans-serif`;
  ctx.fillStyle = remain < 10 ? "#ff6060" : "#fff";
  ctx.fillText(`${Math.ceil(remain)}s`, timeX + 14*dpr, hudY + hudH*0.7);
  ctx.restore();

  // Center: Pause button (two vertical bars)
  ctx.save();
  const pauseSize = 36*dpr;
  const pauseX = (w - pauseSize)/2;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath(); ctx.arc(w/2, hudY + hudH/2, pauseSize/2, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = "rgba(168,85,247,0.4)";
  ctx.lineWidth = 1.5*dpr;
  ctx.beginPath(); ctx.arc(w/2, hudY + hudH/2, pauseSize/2, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle = "#fff";
  const barW = 3*dpr, barH = 12*dpr;
  ctx.fillRect(w/2 - 5*dpr, hudY + hudH/2 - barH/2, barW, barH);
  ctx.fillRect(w/2 + 2*dpr, hudY + hudH/2 - barH/2, barW, barH);
  ctx.restore();

  // Hint
  if(g.hits===0 && g.frame<200){
    ctx.font=`400 italic ${12*dpr}px 'Nunito',sans-serif`;
    ctx.fillStyle="rgba(200,180,255,0.4)"; ctx.textAlign="center";
    ctx.fillText("swipe to poof them away \u2728",w/2,h-40*dpr);
  }
}


// ════════════════════════════════════════════════════════════
//  SCREEN COMPONENTS
// ════════════════════════════════════════════════════════════
function Stars() {
  const stars=useRef(Array.from({length:80},()=>({
    x:Math.random()*100, y:Math.random()*100,
    sz:0.5+Math.random()*1.8, d:2+Math.random()*5, p:Math.random()*6,
  }))).current;
  return (
    <div style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none"}}>
      {stars.map((st,i)=>(
        <div key={i} style={{
          position:"absolute", left:st.x+"%", top:st.y+"%",
          width:st.sz, height:st.sz, borderRadius:"50%",
          background:"rgba(210,200,255,0.9)",
          animation:`starTwinkle ${st.d}s ease-in-out ${st.p}s infinite`,
        }}/>
      ))}
    </div>
  );
}

// ── Intro Screen ──────────────────────────────────────────
function IntroScreen({ onStart }) {
  const [vis,setVis]=useState(false);
  useEffect(()=>{ setTimeout(()=>setVis(true),80); },[]);
  return (
    <div style={S.screen}>
      <Stars/>
      {/* Warm glow orbs */}
      <div style={{position:"absolute",inset:0,pointerEvents:"none",
        background:"radial-gradient(ellipse at 35% 30%,rgba(168,85,247,0.15) 0%,transparent 50%),radial-gradient(ellipse at 65% 75%,rgba(255,100,150,0.1) 0%,transparent 45%),radial-gradient(ellipse at 50% 50%,rgba(80,40,160,0.08) 0%,transparent 70%)"
      }}/>
      <div style={{...S.col,opacity:vis?1:0,transition:"opacity 1.4s ease",gap:0,
        width:"100%",maxWidth:420,padding:"0 28px",boxSizing:"border-box"}}>

        {/* Glowing icon */}
        <div style={{fontSize:40,marginBottom:24,
          animation:"breathe 3s ease-in-out infinite",
          filter:"drop-shadow(0 0 16px rgba(255,180,100,0.6))"}}>🕯️</div>

        {/* Main headline */}
        <h1 style={{
          fontFamily:"'Nunito',sans-serif",fontWeight:900,
          fontSize:"clamp(30px,7.5vw,48px)",color:"#fff",
          margin:"0 0 12px",lineHeight:1.25,textAlign:"center",
          letterSpacing:-0.5,
        }}>
          who's been<br/>
          <span style={{
            background:"linear-gradient(135deg,#c084fc,#f472b6)",
            WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
          }}>weighing you</span><br/>
          down lately?
        </h1>

        {/* Subtitle */}
        <p style={{fontFamily:"'Nunito',sans-serif",fontSize:14,
          color:"rgba(200,180,240,0.5)",marginBottom:36,textAlign:"center"}}>
          it's time to let go
        </p>

        {/* Emotional prompts */}
        <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:44,width:"100%"}}>
          {[
            {emoji:"🧠", text:"that person living in your head rent-free"},
            {emoji:"🔁", text:"the one you keep replaying conversations with"},
            {emoji:"🫠", text:"whoever made you feel small today"},
          ].map((item,i)=>(
            <div key={i} style={{
              display:"flex",alignItems:"center",gap:14,
              background:"rgba(168,85,247,0.06)",
              border:"1px solid rgba(168,85,247,0.12)",
              borderRadius:16,padding:"14px 18px",
              transition:"all 0.3s",
              animation:`fadeSlideIn 0.6s ease ${0.3 + i*0.15}s both`,
            }}>
              <span style={{fontSize:22,flexShrink:0}}>{item.emoji}</span>
              <span style={{fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:500,
                color:"rgba(220,200,255,0.75)",lineHeight:1.5}}>{item.text}</span>
            </div>
          ))}
        </div>

        {/* CTA button */}
        <button onClick={()=>{ onStart(); }} style={{
          ...S.btnPrimary,
          padding:"16px 52px",fontSize:17,
          background:"linear-gradient(135deg,#a855f7,#ec4899)",
          boxShadow:"0 6px 30px rgba(168,85,247,0.35),0 2px 8px rgba(236,72,153,0.2)",
        }}>
          let them go →
        </button>

        {/* Footer */}
        <div style={{marginTop:40,fontSize:10,letterSpacing:3,
          color:"rgba(140,110,180,0.35)",fontFamily:"'Space Mono',monospace"}}>
          rainy nights · emotional release
        </div>
      </div>
    </div>
  );
}

// ── Name Input Screen ─────────────────────────────────────
function NameInputScreen({ onNext }) {
  const [input,setInput]=useState("");
  const [vis,setVis]=useState(false);
  useEffect(()=>{ setTimeout(()=>setVis(true),60); },[]);
  const names = input.split(/[,\n]+/).map(n=>n.trim()).filter(Boolean).slice(0,5);

  const removeName = (idx) => {
    const newNames = [...names];
    newNames.splice(idx, 1);
    setInput(newNames.join(", "));
  };

  return (
    <div style={S.screen}>
      <Stars/>
      <div style={{position:"absolute",inset:0,pointerEvents:"none",
        background:"radial-gradient(ellipse at 50% 40%,rgba(168,85,247,0.1) 0%,transparent 55%)"
      }}/>
      <div style={{...S.col,opacity:vis?1:0,transition:"opacity 0.8s ease",
        width:"100%",maxWidth:420,padding:"0 28px",boxSizing:"border-box"}}>

        {/* Step label */}
        <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,letterSpacing:4,
          color:"rgba(168,85,247,0.6)",textTransform:"uppercase",marginBottom:16}}>
          step 01 — identify
        </div>

        {/* Heading */}
        <h2 style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,
          fontSize:"clamp(26px,6vw,40px)",color:"#fff",
          margin:"0 0 6px",lineHeight:1.2,textAlign:"center"}}>
          Who lives<br/>
          <span style={{
            background:"linear-gradient(135deg,#c084fc,#f472b6)",
            WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
          }}>rent-free?</span>
        </h2>

        <p style={{fontFamily:"'Nunito',sans-serif",fontSize:13,
          color:"rgba(180,160,220,0.5)",marginBottom:28,textAlign:"center"}}>
          type the names you need to release
        </p>

        {/* Input */}
        <div style={{width:"100%",position:"relative"}}>
          <input
            autoFocus value={input}
            onChange={e=>setInput(e.target.value)}
            placeholder="type their name..."
            style={{
              ...S.input,
              padding:"16px 50px 16px 20px",
              fontSize:17,borderRadius:16,
              border:"1.5px solid rgba(168,85,247,0.25)",
              background:"rgba(10,6,28,0.8)",
              boxShadow:"0 4px 20px rgba(0,0,0,0.3),inset 0 1px 0 rgba(168,85,247,0.1)",
            }}
          />
          {/* Add button */}
          <div style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",
            width:28,height:28,borderRadius:8,
            background:"rgba(168,85,247,0.3)",
            display:"flex",alignItems:"center",justifyContent:"center",
            color:"#c084fc",fontSize:18,fontWeight:700,cursor:"pointer",
          }}>+</div>
        </div>

        {/* Name tags */}
        {names.length>0&&(
          <div style={{display:"flex",flexWrap:"wrap",gap:10,marginTop:18,justifyContent:"center"}}>
            {names.map((n,i)=>(
              <div key={i} style={{
                background:"rgba(168,85,247,0.15)",
                border:"1px solid rgba(168,85,247,0.35)",borderRadius:30,
                padding:"8px 16px",fontSize:14,fontFamily:"'Nunito',sans-serif",
                fontWeight:700,color:"#d4b8ff",
                display:"flex",alignItems:"center",gap:8,
                animation:`fadeSlideIn 0.3s ease ${i*0.1}s both`,
              }}>
                {n}
                <span onClick={()=>removeName(i)} style={{
                  cursor:"pointer",opacity:0.5,fontSize:16,
                  lineHeight:1,marginTop:-1,
                }}>×</span>
              </div>
            ))}
          </div>
        )}

        <p style={{fontFamily:"'Space Mono',monospace",fontSize:10,
          color:"rgba(140,110,180,0.4)",marginTop:14,letterSpacing:1}}>
          comma separate · max 5
        </p>

        {/* Submit button */}
        <button
          onClick={()=>names.length>0&&onNext(names)}
          style={{
            ...S.btnPrimary,marginTop:32,
            padding:"16px 52px",fontSize:16,
            background:names.length>0
              ?"linear-gradient(135deg,#a855f7,#ec4899)"
              :"rgba(80,40,120,0.3)",
            boxShadow:names.length>0
              ?"0 6px 30px rgba(168,85,247,0.35)"
              :"none",
            opacity:names.length>0?1:0.4,
            pointerEvents:names.length>0?"auto":"none",
          }}
        >
          RELEASE →
        </button>
      </div>
    </div>
  );
}

// ── Character Pick Screen ─────────────────────────────────
function CharPickScreen({ names, onNext }) {
  const [assignments,setAssignments]=useState(
    ()=>Object.fromEntries(names.map(n=>[n,"he"]))
  );
  const [currentIdx, setCurrentIdx] = useState(0);
  const [vis,setVis]=useState(false);
  useEffect(()=>{ setTimeout(()=>setVis(true),60); },[]);

  const genders=[
    {key:"he",  label:"He"},
    {key:"she", label:"She"},
    {key:"they",label:"They"},
  ];

  const currentName = names[currentIdx];
  const currentGender = assignments[currentName];
  const charInfo = CHAR_COLORS[currentGender];

  const handleNext = () => {
    if (currentIdx < names.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      const result = names.map(n=>({ name:n, gender:assignments[n] }));
      onNext(result);
    }
  };

  return (
    <div style={S.screen}>
      <Stars/>
      <div style={{...S.col,opacity:vis?1:0,transition:"opacity 0.8s ease",
        width:"100%",maxWidth:420,padding:"0 24px",boxSizing:"border-box"}}>
        <div style={S.step}>02 · who are they?</div>
        <h2 style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:28,
          color:"#fff",margin:"8px 0 4px",lineHeight:1.2}}>
          "{currentName}"
        </h2>

        {/* Gender buttons */}
        <div style={{display:"flex",gap:12,marginTop:24,marginBottom:24}}>
          {genders.map(g=>{
            const active = assignments[currentName]===g.key;
            return (
              <button key={g.key}
                onClick={()=>setAssignments(a=>({...a,[currentName]:g.key}))}
                style={{
                  width:72, height:72, borderRadius:16,
                  border:`2px solid ${active?C.purple:"rgba(180,150,255,0.2)"}`,
                  background:active?"rgba(168,85,247,0.3)":"rgba(20,10,50,0.6)",
                  color:active?"#fff":"rgba(180,160,220,0.7)",
                  cursor:"pointer", fontFamily:"'Nunito',sans-serif",
                  fontWeight:700, fontSize:14,
                  transition:"all 0.2s",
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                  transform:active?"scale(1.05)":"scale(1)",
                  boxShadow:active?"0 0 20px rgba(168,85,247,0.3)":"none",
                }}>
                <div style={{fontSize:11,opacity:0.7}}>{g.label}</div>
                {active && <div style={{fontSize:10,marginTop:2}}>✓</div>}
              </button>
            );
          })}
        </div>

        {/* Character preview */}
        <div style={{
          width:200,height:200,borderRadius:20,
          background:"rgba(10,5,30,0.8)",
          border:"1px solid rgba(168,85,247,0.3)",
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
          marginBottom:16,
        }}>
          <div style={{fontSize:64,marginBottom:8}}>
            {currentGender==="he"?"👦":currentGender==="she"?"👧":"🧑"}
          </div>
          <div style={{color:C.purpleLight,fontSize:12,fontFamily:"'Space Mono',monospace"}}>
            {charInfo.label}
          </div>
        </div>

        <p style={{...S.muted,fontSize:11}}>
          {currentIdx < names.length - 1 ? "repeat for each name" : "all set!"}
        </p>

        <button onClick={handleNext} style={{...S.btnPrimary,marginTop:16}}>
          {currentIdx < names.length - 1 ? "next →" : "start battle →"}
        </button>
      </div>
    </div>
  );
}

// ── Pause Menu ────────────────────────────────────────────
function PauseMenu({ onResume, onRestart, onQuit }) {
  const [volume, setVolume] = useState(musicVolume * 100);
  const [sfxOn, setSfxOn] = useState(true);

  const handleVolume = (e) => {
    const v = parseInt(e.target.value);
    setVolume(v);
    setMusicVolume(v / 100);
  };

  return (
    <div style={{
      position:"absolute",inset:0,
      background:"rgba(10,6,20,0.92)",
      backdropFilter:"blur(12px)",
      display:"flex",alignItems:"center",justifyContent:"center",
      zIndex:100,
    }}>
      <div style={{...S.col,gap:0}}>
        <h2 style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:36,
          color:"#fff",margin:"0 0 32px",letterSpacing:2}}>
          PAUSED
        </h2>

        <button onClick={onResume} style={S.menuBtn}>
          <span style={{marginRight:8}}>▶</span> resume
        </button>
        <button onClick={onRestart} style={S.menuBtn}>
          <span style={{marginRight:8}}>↺</span> restart
        </button>
        <button onClick={onQuit} style={S.menuBtn}>
          <span style={{marginRight:8}}>⏏</span> quit
        </button>

        {/* Volume slider */}
        <div style={{marginTop:32,width:200}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:16}}>🎵</span>
            <input type="range" min="0" max="100" value={volume}
              onChange={handleVolume}
              style={{flex:1,accentColor:C.purple}}
            />
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginTop:12}}>
            <span style={{fontSize:16}}>🔊</span>
            <div onClick={()=>setSfxOn(!sfxOn)} style={{
              width:40,height:22,borderRadius:11,
              background:sfxOn?"rgba(168,85,247,0.8)":"rgba(60,40,100,0.5)",
              cursor:"pointer",position:"relative",transition:"background 0.2s",
            }}>
              <div style={{
                width:18,height:18,borderRadius:9,background:"#fff",
                position:"absolute",top:2,
                left:sfxOn?20:2,transition:"left 0.2s",
              }}/>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ── Game Screen (with pause) ──────────────────────────────
function GameScreen({ nameObjs, onWin, onLose, onQuit }) {
  const [vis,setVis]=useState(false);
  const [paused,setPaused]=useState(false);
  useEffect(()=>{ setTimeout(()=>setVis(true),100); startMusic(); },[]);

  const handlePauseClick = useCallback((e) => {
    // Check if click is in the pause button area (center top)
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const topY = 16 + 20; // padding + half button height
    if (Math.abs(x - centerX) < 24 && y < 56) {
      setPaused(true);
    }
  }, []);

  return (
    <div style={{...S.screen,opacity:vis?1:0,transition:"opacity 0.6s ease"}}
      onClick={handlePauseClick}>
      <GameCanvas nameObjs={nameObjs} onWin={onWin} onLose={onLose} paused={paused}/>
      {paused && (
        <PauseMenu
          onResume={()=>setPaused(false)}
          onRestart={()=>{ setPaused(false); onQuit(); }}
          onQuit={onQuit}
        />
      )}
    </div>
  );
}

// ── Game Over / Result Screen ─────────────────────────────
const WIN_MESSAGES = [
  { title:"ritual complete", sub:"Inner Peace Restored", body:"you faced them.\nyou released them.\nyou survived today." },
  { title:"breathe out", sub:"They're Gone Now", body:"that weight you carried?\nit just got lighter.\nyou chose yourself tonight." },
  { title:"silence", sub:"Your Mind Is Yours Again", body:"no more replaying.\nno more what-ifs.\njust you, just peace." },
  { title:"free", sub:"You Let Them Go", body:"they don't live here anymore.\nthis space belongs to you now.\nalways did." },
  { title:"exhale", sub:"The Storm Has Passed", body:"you stood in the rain\nand chose to keep walking.\nthat takes courage." },
  { title:"released", sub:"Lighter Than Before", body:"some people are lessons.\nyou just graduated.\nbe proud of that." },
];

const LOSE_MESSAGES = [
  { title:"not yet", sub:"But You Showed Up", body:"healing isn't linear.\nthe fact that you're here\nmeans you're already fighting." },
  { title:"it's okay", sub:"Some Nights Are Harder", body:"you don't have to win every battle.\njust showing up is enough.\ntry again when you're ready." },
  { title:"breathe", sub:"You're Still Here", body:"they got away this time.\nbut you didn't break.\nthat's what matters." },
  { title:"pause", sub:"Rest Is Not Defeat", body:"sometimes the weight is heavy.\nthat's not weakness.\ncome back stronger." },
  { title:"gentle", sub:"Be Kind To Yourself", body:"not every night is for fighting.\nsome nights are for feeling.\nboth are valid." },
];

function ResultScreen({ hits, won, onPlayAgain, onHome }) {
  const [vis,setVis]=useState(false);
  const [msg] = useState(()=>{
    const pool = won ? WIN_MESSAGES : LOSE_MESSAGES;
    return pool[Math.floor(Math.random()*pool.length)];
  });
  useEffect(()=>{ setTimeout(()=>setVis(true),120); },[]);

  return (
    <div style={S.screen}>
      <Stars/>
      <div style={{position:"absolute",inset:0,pointerEvents:"none",
        background:won
          ? "radial-gradient(ellipse at 50% 40%,rgba(80,200,120,0.1) 0%,transparent 60%)"
          : "radial-gradient(ellipse at 50% 40%,rgba(200,80,120,0.08) 0%,transparent 60%)",
      }}/>
      <div style={{...S.col,opacity:vis?1:0,transition:"opacity 1.4s ease",gap:0,
        width:"100%",maxWidth:380,padding:"0 28px",boxSizing:"border-box"}}>

        {/* Title label */}
        <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,letterSpacing:4,
          color:won?"rgba(120,255,160,0.6)":"rgba(255,150,150,0.6)",
          textTransform:"uppercase",marginBottom:12}}>
          {msg.title}
        </div>

        {/* Main heading */}
        <h2 style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,
          fontSize:"clamp(26px,6.5vw,44px)",textAlign:"center",
          margin:"0 0 24px",lineHeight:1.2,
          color:won?"#90ffb8":"#ffb0b0",
          textShadow:won?"0 0 30px rgba(80,255,140,0.3)":"0 0 30px rgba(255,100,100,0.2)",
        }}>
          {msg.sub}
        </h2>

        {/* Stats */}
        <p style={{fontFamily:"'Nunito',sans-serif",fontSize:15,
          color:"rgba(220,210,255,0.6)",textAlign:"center",marginBottom:4}}>
          you released
        </p>

        <div style={{
          fontFamily:"'Nunito',sans-serif",fontWeight:900,
          fontSize:68,color:"#fff",
          textShadow:"0 0 30px rgba(168,85,247,0.4)",
          margin:"4px 0 4px",lineHeight:1,
        }}>
          {hits}
        </div>

        <p style={{fontFamily:"'Nunito',sans-serif",fontSize:15,
          color:"rgba(220,210,255,0.6)",textAlign:"center",marginBottom:24}}>
          thoughts tonight.
        </p>

        {/* Empathetic body text */}
        <p style={{fontFamily:"'Nunito',sans-serif",fontSize:14,
          color:"rgba(180,160,220,0.55)",textAlign:"center",lineHeight:1.8,
          whiteSpace:"pre-line",marginBottom:36}}>
          {msg.body}
        </p>

        {/* Buttons */}
        <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%",maxWidth:260}}>
          <button onClick={onPlayAgain} style={{
            ...S.btnPrimary,
            background:"linear-gradient(135deg,#a855f7,#ec4899)",
            boxShadow:"0 6px 30px rgba(168,85,247,0.35)",
          }}>
            {won ? "new session" : "try again"}
          </button>
          <button onClick={onHome} style={S.btnSecondary}>
            home
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  ROOT APP
// ════════════════════════════════════════════════════════════
export default function App() {
  const [screen,  setScreen  ] = useState("intro");
  const [names,   setNames   ] = useState([]);
  const [nameObjs,setNameObjs] = useState([]);
  const [hits,    setHits    ] = useState(0);
  const [won,     setWon     ] = useState(false);

  const reset = () => { setNames([]); setNameObjs([]); setScreen("intro"); };

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={S.root}>
        {screen==="intro" && <IntroScreen onStart={()=>setScreen("names")}/>}
        {screen==="names" && <NameInputScreen onNext={ns=>{ setNames(ns); setScreen("pick"); }}/>}
        {screen==="pick"  && <CharPickScreen names={names} onNext={objs=>{ setNameObjs(objs); setScreen("game"); }}/>}
        {screen==="game"  && (
          <GameScreen
            nameObjs={nameObjs}
            onWin={h=>{ stopMusic(); setHits(h); setWon(true); setScreen("result"); }}
            onLose={h=>{ stopMusic(); setHits(h); setWon(false); setScreen("result"); }}
            onQuit={reset}
          />
        )}
        {screen==="result" && (
          <ResultScreen
            hits={hits}
            won={won}
            onPlayAgain={()=>setScreen("game")}
            onHome={reset}
          />
        )}
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════
//  DESIGN TOKENS & STYLES
// ════════════════════════════════════════════════════════════
const S = {
  root: {
    width:"100vw",height:"100vh",background:C.bg,overflow:"hidden",
    fontFamily:"'Nunito',sans-serif",position:"relative",
  },
  screen: {
    position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
    background:`linear-gradient(150deg,${C.bg},${C.bgMid},#060410)`,
  },
  col: {
    display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",
  },
  step: {
    fontFamily:"'Space Mono',monospace",fontSize:11,letterSpacing:3,
    color:"rgba(180,130,255,0.65)",textTransform:"lowercase",marginBottom:20,
  },
  logo: {
    fontFamily:"'Nunito',sans-serif",fontWeight:900,
    fontSize:"clamp(60px,14vw,120px)",color:"#f0eeff",
    margin:"0 0 4px",lineHeight:1,letterSpacing:-2,
    textShadow:"0 0 60px rgba(168,85,247,0.5)",
    animation:"floatTitle 4s ease-in-out infinite",
  },
  tagline: {
    fontFamily:"'Nunito',sans-serif",fontSize:14,color:"rgba(180,160,240,0.65)",
    marginTop:4,marginBottom:4,lineHeight:1.6,
  },
  muted: {
    fontFamily:"'Nunito',sans-serif",fontSize:13,color:C.textMuted,lineHeight:1.6,
  },
  btnPrimary: {
    fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:16,
    color:"#fff",background:C.btnBg,
    border:"none",borderRadius:40,
    padding:"14px 48px",cursor:"pointer",
    letterSpacing:0.5,width:"100%",maxWidth:240,
    boxShadow:"0 4px 20px rgba(168,85,247,0.3)",
    transition:"all 0.22s",
  },
  btnSecondary: {
    fontFamily:"'Nunito',sans-serif",fontWeight:700,fontSize:15,
    color:"rgba(200,180,255,0.8)",background:"transparent",
    border:"1.5px solid rgba(168,85,247,0.4)",borderRadius:40,
    padding:"12px 48px",cursor:"pointer",
    letterSpacing:0.5,width:"100%",maxWidth:240,
    transition:"all 0.22s",
  },
  menuBtn: {
    fontFamily:"'Nunito',sans-serif",fontWeight:700,fontSize:16,
    color:"#fff",background:"rgba(30,15,60,0.6)",
    border:"1.5px solid rgba(168,85,247,0.3)",borderRadius:14,
    padding:"14px 40px",cursor:"pointer",width:200,
    marginBottom:10,textAlign:"left",
    transition:"all 0.2s",
  },
  input: {
    width:"100%",background:"rgba(10,6,28,0.7)",
    border:"1.5px solid rgba(120,60,220,0.28)",borderRadius:14,
    color:"#c8b8ff",fontSize:16,fontFamily:"'Nunito',sans-serif",
    padding:"14px 18px",outline:"none",
    boxSizing:"border-box",
  },
  nameTag: {
    background:"rgba(80,30,160,0.35)",
    border:"1px solid rgba(168,85,247,0.4)",borderRadius:30,
    padding:"6px 16px",fontSize:14,fontFamily:"'Nunito',sans-serif",
    fontWeight:700,color:"#c0a8ff",
    display:"flex",alignItems:"center",
  },
};

const GLOBAL_CSS = `
*{box-sizing:border-box;}
body{margin:0;padding:0;background:#0a0614;overflow:hidden;}
@keyframes starTwinkle{0%,100%{opacity:0.15;transform:scale(1)}50%{opacity:1;transform:scale(1.7)}}
@keyframes floatTitle{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
@keyframes fadeSlideIn{0%{opacity:0;transform:translateY(12px)}100%{opacity:1;transform:translateY(0)}}
button:hover{filter:brightness(1.15);transform:scale(1.02)!important;}
button:active{transform:scale(0.97)!important;}
input::placeholder{color:rgba(140,110,200,0.4);}
input:focus{border-color:rgba(168,85,247,0.55)!important;box-shadow:0 0 24px rgba(120,60,255,0.15),0 4px 20px rgba(0,0,0,0.3)!important;}
::-webkit-scrollbar{display:none;}
input[type="range"]{-webkit-appearance:none;height:4px;border-radius:2px;background:rgba(168,85,247,0.3);outline:none;}
input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#a855f7;cursor:pointer;}
`;
