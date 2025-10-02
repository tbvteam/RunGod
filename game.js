// game.js — Full game script
(() => {
  'use strict';

  // ========== SKILL STATE ==========
  let skillActiveUntil = 0;      // thời điểm skill kết thúc
  let skillCooldownUntil = 0;    // thời điểm hồi chiêu xong
  let statues = []; // mảng các hình nhân đang bay
  // ========== PLAYER STATE ==========
  let invincible = false;        // bất tử
  let birdMode = false;          // chế độ chim (song song với player.mode)
  let doubleJumpActive = false;  // double jump đang bật
  let jumpCount = 0;             // số lần nhảy liên tiếp

  // ========== PROJECTILE ==========
  let projectiles = [];          // mảng đạn (bắn bóng)

  // ========== CLOUD WALK ==========
  let cloudWalkUntil = 0;        // skill đi trên mây

  // ========== WORLD EFFECT ==========
  let slowWorldActive = false;       // cờ giảm tốc thế giới
  let effectCloneUntil = 0;     // skill 6: clone
  let cloneActive = false;
  let clone = null;   
  let effectDestroyColumnsUntil = 0; // skill 7: phá cột
  let effectDestroyAllUntil = 0;     // skill 8: phá toàn bộ trong thời gian ngắn
  let effectDestroyHolesUntil = 0;   // skill 9: lấp hố
  let effectInvisibleUntil = 0;      // skill 3: vô hình
  // ========== PLAYER ==========
  const ballImg = new Image();
  ballImg.src = "images/U/ball.png"; // ảnh quả bóng

  // ========== HELPERS ==========
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function now(){ return performance.now(); }
  function metersToKmStr(m){
    const km = m/1000;
    return km.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
  }
  function aabb(ax,ay,aw,ah,bx,by,bw,bh){ 
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by; 
  }
  function drawRectFallback(ctx,x,y,w,h,color){ ctx.fillStyle = color; ctx.fillRect(x,y,w,h); }
  function drawImageOrRect(ctx,img,x,y,w,h){
    if(img && img.complete && !img.__fallback){
      ctx.drawImage(img, x, y, w, h);
    } else {
      drawRectFallback(ctx, x, y, w, h, img && img.__color ? img.__color : '#666');
    }
  }
  function loadImage(src, fallbackColor='#999'){
    const i = new Image();
    i.src = src;
    i.onerror = () => { i.__fallback = true; i.__color = fallbackColor; };
    return i;
  }

  let bgScroll = 0;

  // ========== CANVAS SETUP ==========
  const canvas = document.getElementById('gameCanvas');
  if(!canvas){ console.error('Thiếu <canvas id="gameCanvas"> trong game.html'); return; }
  const ctx = canvas.getContext('2d');
  const DPR = Math.max(1, Math.floor(window.devicePixelRatio || 1));

  function resize(){
    canvas.width  = Math.floor(window.innerWidth * DPR);
    canvas.height = Math.floor(window.innerHeight * DPR);
    canvas.style.width  = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
  }
  resize();
  window.addEventListener('resize', resize);

  // ========== LOAD PLAYER SELECTION ==========
  const selected = JSON.parse(localStorage.getItem('selectedCharacter') || 'null');
  if(!selected || typeof selected.id !== 'number'){
    alert('Bạn chưa chọn nhân vật!');
    window.location.href = 'nv.html';
    return;
  }
  const charId = clamp(Math.floor(selected.id), 1, 10);
  const imgBg = loadImage('images/N/NG.png'); 

  // ========== ASSETS ==========
  const CHARACTER_ASSETS = {
    1:  { run: 'images/G/1r.png',  fly: 'images/G/1f.png'  },
    2:  { run: 'images/G/2r.png',  fly: 'images/G/2f.png'  },
    3:  { run: 'images/G/3r.png',  fly: 'images/G/3f.png'  },
    4:  { run: 'images/G/4r.png',  fly: 'images/G/4f.png'  },
    5:  { run: 'images/G/5r.png',  fly: 'images/G/5f.png'  },
    6:  { run: 'images/G/6r.png',  fly: 'images/G/6f.png'  },
    7:  { run: 'images/G/7r.png',  fly: 'images/G/7f.png'  },
    8:  { run: 'images/G/8r.png',  fly: 'images/G/8f.png'  },
    9:  { run: 'images/G/9r.png',  fly: 'images/G/9f.png'  },
    10: { run: 'images/G/10r.png', fly: 'images/G/10f.png' }
  };

  const imgRun    = loadImage(CHARACTER_ASSETS[charId].run);
  const imgFly    = loadImage(CHARACTER_ASSETS[charId].fly);
  const imgRoad   = loadImage('images/U/road.png');
  const imgColumn1= loadImage('images/U/c1.png');
  const imgColumn2= loadImage('images/U/c2.png');
  const imgHole   = loadImage('images/U/hole.png');
  const imgPickup = loadImage('images/I/icon.png');
  const imgMeet   = loadImage('images/U/meet.png');

  // ========== CONSTANTS & STATE ==========
  const BLOCK = Math.floor(24 * DPR);
  const KM_MAX_HUD = 99_999_999;
  const M_SWITCH_TO_BIRD = 90_000_000; 
  const M_MEET_NPC       = 99_999_999;
  const M_BOTTLE_TARGET  = 99_900_000;
  const defaultGap = BLOCK * 20;  // khoảng cách mặc định giữa obstacle/hole
  let spawnGap = defaultGap; 
  let groundTop    = Math.floor(canvas.height * 0.55);
  let groundBottom = canvas.height - Math.floor(2 * BLOCK);
  let groundHeight = Math.max(BLOCK * 4, groundBottom - groundTop);

  // Player
  const playerTemplate = () => ({
    mode: 'dino', 
    w: BLOCK * 2,
    h: BLOCK * 3,
    x: Math.floor(canvas.width * 0.25),
    y: 0,
    vy: 0,
    onGround: true,
    lives: 1
  });
  let player = playerTemplate();
  player.y = groundTop - player.h;

  // === PHYSICS ===
  const BLOCK_SIZE = BLOCK;
  const GRAVITY = 2200 * DPR;
  const JUMP_BLOCKS = 8;
  const JUMP_VEL = -Math.sqrt(2 * GRAVITY * (JUMP_BLOCKS * BLOCK_SIZE));
  const FLAP_VEL = JUMP_VEL * 0.7;
  const MAX_FALL = 2500 * DPR;

  // World
  let worldSpeed = 7000;
  const SPEED_MAX= 20000;
  const SPEED_ACC = 0.000005;

  let distanceM = 0;

  let obstacles = [];
  let holes = [];
  let pickups = [];

  let nextSpawnAtM  = 200;
  let nextPickupAtM = 1500;

  // Skill object (gọn)
  const skill = { active:false, charges:0, type: clamp(charId,1,10) };

  const M2PX = 0.04 * DPR;


  // UI flags
  let gameOver = false;
  let meetShown = false;
  let roadScroll = 0;
  let last = now();
  let bestDistanceM = Number(localStorage.getItem('bestDistanceM') || '0');

  // ========== UTILS ==========
  function toast(text){
    skill.toast = { text, until: now() + 1500 };
  }

  function resetWorldDimensions(){
    groundTop    = Math.floor(canvas.height * 0.55);
    groundBottom = canvas.height - Math.floor(2 * BLOCK);
    groundHeight = Math.max(BLOCK * 4, groundBottom - groundTop);
    player.x = Math.floor(canvas.width * 0.25);
  }

  
let lastX = 0; // nhớ vị trí cuối cùng của obstacle/hole

// cấu hình khoảng cách
const DEFAULT_GAP = 20; // đơn vị block
const INCREASED_GAP = 50; // đơn vị block (skill 6)

function spawnObstacleOrHole() {
  // ===== Nếu đang ở chế độ bird thì sinh cột trên + dưới =====
  if (player.mode === 'bird') {
    const gapMin = 3; // khe hở tối thiểu = 3 block
    const hBottom = 1 + Math.floor(Math.random() * 5);   // cột dưới 1–5 block
    const hTop    = 1 + Math.floor(Math.random() * 6);   // cột trên 1–6 block

    const baseX = Math.max(
      canvas.width + BLOCK * (Math.random() * 2 + 1),
      lastX + BLOCK * 25   // khoảng cách tối thiểu 25 block
    );

    // cột dưới
    obstacles.push({
      type: 'column',
      x: baseX,
      y: groundTop - hBottom * BLOCK,
      w: BLOCK * 1.2,
      h: BLOCK * hBottom,
      hBlocks: hBottom,
      remove: false,
      destroy: false,
      melted: false
    });

    // cột trên
    obstacles.push({
      type: 'column',
      x: baseX,
      y: groundTop - (hBottom + gapMin + hTop) * BLOCK,
      w: BLOCK * 1.2,
      h: BLOCK * hTop,
      hBlocks: hTop,
      remove: false,
      destroy: false,
      melted: false
    });

    lastX = baseX;
    return; // bird mode đã xử lý xong
  }

  // ===== Dino mode =====
  const roll = Math.random();
  const colChance = 0.55;

  // ===== Skill 6: tăng khoảng cách =====
  const gapBlocks = (now() < effectCloneUntil) ? INCREASED_GAP : DEFAULT_GAP;
  const minGap = BLOCK * gapBlocks;

  const baseX = Math.max(
    canvas.width + BLOCK * (Math.random() * 2 + 1),
    lastX + minGap
  );

  if (roll < colChance) {
    // ===== Cột =====
    const r = Math.random();
    let hBlocks;
    if (r < 0.50)      hBlocks = 1;
    else if (r < 0.85) hBlocks = 2;
    else               hBlocks = 3;

    const w = BLOCK * 1.2;
    const h = BLOCK * hBlocks;
    obstacles.push({
      type: 'column',
      x: baseX,
      y: groundTop - h,
      w,
      h,
      hBlocks,
      remove: false,
      destroy: false,
      melted: false
    });

  } else {
    // ===== Hố =====
    const wBlocks = 1 + Math.floor(Math.random() * 3);
    const depthBlocks = 1 + Math.floor(Math.random() * 4);
    const w = BLOCK * wBlocks;
    const h = BLOCK * depthBlocks;
    holes.push({
      type: 'hole',
      x: baseX,
      y: groundTop,
      wBlocks,
      depthBlocks,
      w,
      h,
      covered: false,
      remove: false
    });
  }

  lastX = baseX;
}


  function spawnPickup() {
  // Giảm tỉ lệ xuất hiện bằng cách chỉ gọi khi random nhỏ hơn 5%
  if (Math.random() > 0.05) return; // ~5% cơ hội spawn mỗi lần gọi

  const x = canvas.width + BLOCK * (2 + Math.random() * 4);
  let y;

  const mode = Math.random();
  if (mode < 0.4) {
    // 40%: ở gần mặt đất
    y = groundTop - BLOCK;
  } else if (mode < 0.7) {
    // 30%: lơ lửng 2–4 block
    y = groundTop - BLOCK * (2 + Math.floor(Math.random() * 3)); 
  } else {
    // 30%: trên cột nếu có cột gần đó
    const nearCol = obstacles.find(ob =>
      ob.x > x - BLOCK*2 && ob.x < x + BLOCK*2
    );
    if (nearCol) {
      y = nearCol.y - BLOCK * 1.2; // ngay trên cột
    } else {
      y = groundTop - BLOCK * (2 + Math.floor(Math.random() * 3));
    }
  }

  pickups.push({
    x,
    y,
    size: BLOCK * 1.2,
    remove: false,
  });
}

  function removeOffscreen(list){
    for(const it of list){
      if((it.x + (it.w || BLOCK)) < -BLOCK*2) it.remove = true;
    }
  }
  function purge(list){
    for(let i=list.length-1;i>=0;i--){
      const o = list[i];
      if(o.destroy || o.remove || o.melted) list.splice(i,1);
    }
  }

  // ========== INPUT ==========
  window.addEventListener('keydown', e => {
    if(e.code === 'Space' || e.code === 'ArrowUp'){ (player.mode === 'dino' ? jump() : flap()); e.preventDefault(); }
    if(e.code === 'KeyE'){ activateSkill(); }
  });
  canvas.addEventListener('pointerdown', e => {
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * DPR;
    const py = (e.clientY - rect.top) * DPR;
    if(gameOver){
      // check overlay buttons
      if(handleGameOverClick(px, py)) return;
    } else {
      (player.mode === 'dino' ? jump() : flap());
    }
  });

function jump() {
  // Nếu đang trên mặt đất
  if (player.onGround) {
    player.vy = JUMP_VEL;
    player.onGround = false;
    jumpCount = 1;   // reset, nhảy lần 1
  }
  // Nếu đang trên không và được phép double jump
  else if (doubleJumpActive && jumpCount < 2) {
    player.vy = JUMP_VEL;  // dùng cùng lực nhảy
    jumpCount++;           // nhảy lần 2
  }
}

  
  function flap(){
    player.vy = FLAP_VEL;
  }
  // ========== GAME LOOP ==========
  function loop(){
    const t = now();
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if(!gameOver) update(dt);
    render();
    requestAnimationFrame(loop);
  }

function update(dt) {
  // =============================
  // 1. SCROLL & SPEED
  // =============================
  bgScroll -= worldSpeed * 0.2 * dt;
  if (bgScroll < -canvas.width) bgScroll += canvas.width;

  roadScroll -= worldSpeed * dt;
  if (roadScroll < -BLOCK) roadScroll += BLOCK;

  if (!slowWorldActive) {
    worldSpeed = Math.min(SPEED_MAX, worldSpeed + SPEED_ACC);
  }
  distanceM += worldSpeed * dt;

  if (player.onGround) jumpCount = 0;

  // =============================
  // 2. SKILL TIMEOUT
  // =============================
  if (skill.active && now() >= skillActiveUntil) {
    skill.active = false;
    invincible = false;
    player.hovering = false;

    switch (charId) {
      case 1: // chim
        birdMode = false;
        player.mode = 'dino';
        player.onGround = true;
        break;
        case 3: // skill 3: vô hình
        effectInvisibleUntil = 0;
        break;
      case 4: // double jump
        doubleJumpActive = false;
        break;
      case 5: // đi trên mây
        cloudWalkUntil = 0;
        break;
      case 6: // tăng khoảng cách chướng ngại
        effectCloneUntil = 0;
        break;
      case 7: // phá cột
        effectDestroyColumnsUntil = 0;
        break;
      case 8: // phá tất cả
        effectDestroyAllUntil = 0;
        break;
      case 9: // phá hố
        effectDestroyHolesUntil = 0;
        break;
      case 10: // dịch chuyển
        break;
    }
  }

  // =============================
  // 3. SPAWN OBSTACLES & PICKUPS
  // =============================
  while (distanceM >= nextSpawnAtM) {
    spawnObstacleOrHole();

    const extraGapM = (now() < effectCloneUntil) ? 400 : 0;
    nextSpawnAtM += 200 + Math.random() * 400 + extraGapM;
  }

  if (distanceM < 90_000_000_000) {
    while (distanceM >= nextPickupAtM) {
      spawnPickup();
      nextPickupAtM += 3000 + Math.random() * 4000;
    }
  }

  // =============================
  // 4. MOVE ENTITIES
  // =============================
  const dx = worldSpeed * dt * M2PX;
  obstacles.forEach(o => o.x -= dx);
  holes.forEach(h => h.x -= dx);
  pickups.forEach(p => p.x -= dx);

  removeOffscreen(obstacles);
  removeOffscreen(holes);
  removeOffscreen(pickups);

  // =============================
  // 5. EFFECTS
  // =============================
  if (now() < effectDestroyHolesUntil) {
    holes.forEach(h => h.covered = true);
  } else {
    holes.forEach(h => h.covered = false);
  }
  if (now() < effectCloneUntil && cloneActive) {
    // clone chạy theo player
    if (clone) {
      clone.x = player.x;
      clone.y = player.y - BLOCK * 2;
    }
  } else {
    cloneActive = false;
    clone = null;
  }

  // =============================
  // 6. UPDATE PLAYER
  // =============================
  if (player.mode === 'dino') {
    player.vy += GRAVITY * dt;
    player.vy = Math.min(player.vy, MAX_FALL);
    player.y += player.vy * dt;

    if (player.y + player.h >= groundTop) {
      player.y = groundTop - player.h;
      player.vy = 0;
      player.onGround = true;
    } else player.onGround = false;

    // ===== Va chạm cột =====
    if (now() >= effectInvisibleUntil) {
      for (const o of obstacles) {
        if (o.type !== 'column' || o.destroy || o.melted) continue;

        // Skill 7 hoặc Skill 8 đang chạy → bỏ qua va chạm, KHÔNG phá cột
        if (now() < effectDestroyColumnsUntil || now() < effectDestroyAllUntil) {
          continue;
        }

        if (aabb(player.x, player.y, player.w, player.h, o.x, o.y, o.w, o.h)) {
          if (!invincible) hit();
          o.destroy = true; // chỉ phá khi va chạm thực sự
          break;
        }
      }
    }

    // ===== Va chạm hố =====
    if (now() >= effectInvisibleUntil) {
      for (const h of holes) {
        if (now() < effectDestroyAllUntil || now() < effectDestroyHolesUntil) continue;

        const leftEdge = player.x + player.w * 0.4;
        const rightEdge = player.x + player.w * 0.6;
        const inX = rightEdge > h.x && leftEdge < h.x + h.w;

        if (inX) {
          const holeTopY = groundTop;
          const holeBottomY = groundTop + h.h;

          if (player.y + player.h >= holeTopY && player.y < holeBottomY) {
            if (!invincible) hit();
            break;
          }
        }
      }
    }

  } else {
    // ===== Bird mode =====
    if (player.hovering && skill.active) {
      player.vy = 0;
    } else {
      player.vy += (GRAVITY * 0.7) * dt;
      player.vy = Math.min(player.vy, MAX_FALL * 0.8);
      player.y += player.vy * dt;
    }

    if (!player.hovering && player.y + player.h >= groundTop) {
      hit();
      return;
    }

    const topLimit = Math.max(10 * DPR, groundTop - BLOCK * 20);
    if (player.y < topLimit) {
      player.y = topLimit;
      player.vy = 0;
    }

    for (const o of obstacles) {
      if (o.type !== 'column' || o.destroy || o.melted) continue;
      // Bird không bị ảnh hưởng bởi skill 7/8 → chỉ va chạm thật
      if (aabb(player.x, player.y, player.w, player.h, o.x, o.y, o.w, o.h)) {
        if (!invincible) hit();
        o.destroy = true;
        break;
      }
    }
  }

  // ===== SKILL 5: ĐI TRÊN MÂY =====
  if (now() < cloudWalkUntil) {
    player.y = groundTop - 5 * BLOCK - player.h;
    player.vy = 0;
    player.onGround = true;
  }

  // =============================
  // 7. PICKUPS
  // =============================
  for (const p of pickups) {
    if (aabb(player.x, player.y, player.w, player.h,
             p.x - p.size/2, p.y - p.size/2, p.size, p.size)) {
      p.remove = true;
      skill.charges = 1;
      toast("Nhặt vật phẩm: Kỹ năng sẵn sàng (bấm E để dùng)");
    }
  }

  purge(obstacles);
  purge(holes);
  purge(pickups);

 // =============================
// 8. BIRD MODE TRIGGER
// =============================
if (distanceM >= M_SWITCH_TO_BIRD && !birdMode) {
  birdMode = true;
  player.mode = 'bird';
  player.onGround = false;

  // luôn reset về tốc độ 30 m/s
  worldSpeed = 15000;  
  invincible = false;
  player.hovering = false;
  skill.active = false;

  toast("Đã vào chế độ Chim!");
}

  // =============================
  // 9. MEET NPC
  // =============================
  if (!meetShown && distanceM >= M_MEET_NPC) {
    meetShown = true;
    player.onGround = true;
    effectInvisibleUntil = true;
    showMeetOverlay();
  }
if (meetShown && !gameOver) {
  const npcX = canvas.width - 200;   // NPC đứng gần cuối màn hình
  if (player.x + player.w < npcX) {
    player.x += 200 * dt;            // player tự chạy tới
  } else {
    gameOver = true;
    toast("Chiến thắng! Bạn đã gặp nhân vật bí ẩn!");
  }
}
  // =============================
  // 10. PROJECTILES
  // =============================
  for (const b of projectiles) {
    if (b.destroyed) continue;

    b.x += b.vx * dt;

    // va chạm với cột
    for (const o of obstacles) {
      if (o.type !== 'column' || o.destroy) continue;
      if (aabb(b.x, b.y, b.size, b.size, o.x, o.y, o.w, o.h)) {
        o.destroy = true;
        b.destroyedCount++;
        // nếu muốn chỉ phá 1 cột thì thêm:
        // b.destroyed = true; break;
      }
    }

    if (b.x > canvas.width) {
      if (b.destroyedCount > 0) {
        toast(`Quả bóng đã phá vỡ ${b.destroyedCount} cột!`);
      }
      b.destroyed = true;
    }

    // giới hạn tối đa 100 cột
    if (b.destroyedCount <= 100) {
      toast(`Quả bóng đã phá tối đa ${b.destroyedCount} cột!`);
      b.destroyed = true;
    }
  }

  projectiles = projectiles.filter(b => !b.destroyed);

for (const s of statues) {
  if (s.removed) continue;

  // di chuyển statue
  s.x += s.vx * dt;

  // Va chạm với cột
  for (const o of obstacles) {
    if (o.type === 'column' && !o.destroy &&
        aabb(s.x, s.y, s.w, s.h, o.x, o.y, o.w, o.h)) {
      o.destroy = true;       // phá cột
      s.hitsLeft--;           // giảm lượt phá
      if (s.hitsLeft <= 0) {
        s.removed = true;     // hết lượt phá → statue biến mất
        break;
      }
    }
  }

  // Va chạm với hố
  for (const h of holes) {
    if (!h.remove &&
        aabb(s.x, s.y, s.w, s.h, h.x, h.y, h.w, h.h)) {
      h.covered= true;        // lấp hố
      s.hitsLeft--;           // giảm lượt phá
      if (s.hitsLeft <= 0) {
        s.removed = true;
        break;
      }
    }
  }

  // Nếu bay ra khỏi màn hình thì remove
  if (s.x > canvas.width) {
    s.removed = true;
  }
}

// lọc lại statue còn tồn tại
statues = statues.filter(s => !s.removed);


  // =============================
  // 11. SAVE BEST DISTANCE
  // =============================
  if (distanceM > bestDistanceM) {
    bestDistanceM = distanceM;
    localStorage.setItem('bestDistanceM', Math.floor(bestDistanceM));
  }
}

  function hit(){
    if(player.lives > 1){
      player.lives--;
      player.vy = JUMP_VEL * 0.6;
      clearOnScreen();
      toast('Bị thương! Mất 1 mạng.');
      return;
    }
    gameOver = true;
    // stop skill effects
    skill.active = false;
    // show overlay handled in render
  }


  function clearOnScreen(){
    const L = 0, R = canvas.width;
    obstacles.forEach(o => { if(o.x + o.w > L && o.x < R) o.destroy = true; });
    holes.forEach(h => { if(h.x + h.w > L && h.x < R) h.covered = true; });
  }

function showMeetOverlay(){
  meetShown = true;
  worldSpeed = 0;        // dừng map
  toast('Gặp nhân vật bí ẩn!');
}


  // ========== SKILL FUNCTIONS ==========
  function skillName(id){
    switch(id){
      case 1: return 'Tiên Công';
      case 2: return 'Siêu Cầu';
      case 3: return 'Vô hình';
      case 4: return 'Nhảy đôi';
      case 5: return 'Nghệ sĩ';
      case 6: return 'Phân Thân ';
      case 7: return 'Phá cột';
      case 8: return 'Ngôi Vương';
      case 9: return 'Lấp Hố';
      case 10: return 'Viễn Chinh';
      default: return '—';
    }
  }

// ========== SKILLS ==========
function activateSkill() {
  const nowMs = now();

  // nếu skill đang hoạt động
  if (skill.active && nowMs < skillActiveUntil) {
    toast('Kỹ năng vẫn đang hoạt động!');
    return;
  }
  // chưa có vật phẩm
  if (skill.charges <= 0) {
    toast('Chưa có vật phẩm để dùng kỹ năng!');
    return;
  }
  // đang hồi chiêu
  if (nowMs < skillCooldownUntil) {
    toast('Kỹ năng đang hồi chiêu!');
    return;
  }

  // trừ vật phẩm
  skill.charges--;

  const id = charId;
  let duration = 0;    // thời gian hiệu lực
  let cooldown = 15e3; // mặc định hồi chiêu 15s

  switch (id) {
    // ================== SKILL 1 ==================
    case 1: // chế độ chim (bay, KHÔNG bất tử)
      player.mode = 'bird';
      player.onGround = false;
      birdMode = true;
      player.y = groundTop - BLOCK * 6;
      player.vy = 0;
      player.hovering = false;
      duration = 20e3;   // 20s
      cooldown = 30e3;
      toast("Kỹ năng 1: Tiên Công");
      break;

    // ================== SKILL 2 ==================
    case 2: // bắn bóng
      projectiles.push({
        x: player.x + player.w,
        y: player.y + player.h / 2,
        vx: BLOCK * 2,
        size: BLOCK,
        remove: false,
        img: ballImg,
        destroyed: 0
      });
      toast('Kỹ năng 2: Siêu Cầu!');
      duration = 0; // tác dụng ngay
      break;

    // ================== SKILL 3 ==================
    case 3: // vô hình
      effectInvisibleUntil = nowMs + 100e3;
      duration = 100e3;
      toast("Kỹ năng 3: Vô hình");
      break;

    // ================== SKILL 4 ==================
    case 4: // Double Jump
      doubleJumpActive = true;
      duration = 10e3;
  
      toast("Kỹ năng 4: Nhảy đôi");
      break;

    // ================== SKILL 5 ==================
    case 5: // đi trên mây
      duration = 100e3; 
      cloudWalkUntil = nowMs + duration;
      toast("Kỹ năng 5: Nghệ sĩ");
      break;

    // ================== SKILL 6 ==================
case 6: // Bắn hình nhân phá chướng ngại
  {
    // tác dụng ngay: spawn 1 statue projectile
    // speed, size, hits (số chướng ngại phá được trước khi biến mất)
    const speed = BLOCK * 6;      // px/s (tùy chỉnh)
    const sizeW = player.w;       // dùng kích thước player
    const sizeH = player.h;
    const hits = 6;               // tối đa phá 6 chướng ngại

    statues.push({
      x: player.x + player.w,     // xuất phát ở trước player
      y: player.y,
      w: sizeW,
      h: sizeH,
      vx: speed,                  // di chuyển theo trục x
      removed: false,
      img: imgRun,                // dùng ảnh chạy của nhân vật
      hitsLeft: hits,
    });

    // skill tác dụng ngay => duration = 0, chỉ có cooldown
    duration = 0;
    cooldown = 20e3; // ví dụ 20s hồi chiêu
    toast("Kỹ năng 6: Phân Thân ");
  }
  break;

    // ================== SKILL 7 ==================
    case 7: // phá cột

  // Trong 100s sau đó, nhân vật đi xuyên cột (không va chạm)
  effectDestroyColumnsUntil = nowMs + 100e3;
  duration = 100e3;
  toast("Kỹ năng 7: Phá Cột ");
  break;


    // ================== SKILL 8 ==================
   case 8: // phá tất cả chướng ngại vật (hố + cột)

  // trong 100s nhân vật miễn va chạm
  effectDestroyAllUntil = nowMs + 20e3;
  duration = 20e3;
  toast("Kỹ năng 8: Ngôi Vương ");
  break;

    // ================== SKILL 9 ==================
    case 9: // lấp hố
      effectDestroyHolesUntil = nowMs + 100e3;
      duration = 100e3;
      toast("Kỹ năng 9: Lấp Hố");
      break;

    // ================== SKILL 10 ==================
    case 10: // dịch chuyển
      {
        const delta = M_BOTTLE_TARGET - distanceM;
        if (delta > 0) {
          teleportDelta(delta);
          clearOnScreen();
          toast(`Kỹ năng 10: Viễn Chinh`);
        }
        duration = 0; // tác dụng ngay
      }
      break;

    // ================== DEFAULT ==================
default:
  toast('Nhân vật chưa có kỹ năng.');
  return;
}

// bật trạng thái hiệu lực
if (duration > 0) {
  skill.active = true;
  skillActiveUntil = nowMs + duration;
  skill.activeUntil = skillActiveUntil; // đồng bộ object + biến global
} else {
  skill.active = false;
  skillActiveUntil = 0;
  skill.activeUntil = 0;
}

// hồi chiêu bắt đầu tính sau khi hiệu lực kết thúc
if (duration > 0) {
  skillCooldownUntil = skillActiveUntil + cooldown;
} else {
  skillCooldownUntil = nowMs + cooldown;
}
skill.cooldownUntil = skillCooldownUntil;

// debug log để kiểm tra ngay trong console
console.log('[SKILL] id=', charId,
            'duration(ms)=', duration,
            'activeUntil=', skillActiveUntil,
            'cooldownUntil=', skillCooldownUntil,
            'charges=', skill.charges);
}
    function teleportDelta(delta){
    // nếu delta nhỏ thì xử lý bình thường, nếu quá lớn thì xử an toàn
    if(!isFinite(delta) || delta <= 0) return;

    const HUGE_DELTA_THRESHOLD = 5_000_000; // 5,000 km (meters) — nếu lớn hơn, xử lý 'safe'
    const rand = (n) => Math.floor(Math.random() * n);

    // tăng distance
    distanceM += delta;

    if(delta > HUGE_DELTA_THRESHOLD){
      // dọn sạch các chướng ngại/hole/pickup trên màn hình để tránh spawn/va chạm hàng loạt
      // cũng tránh vòng while spawn lớn bằng cách đặt nextSpawn/nextPickup ngay sau distanceM
      nextSpawnAtM = distanceM + 200 + rand(400);    // spawn tiếp trong ~200..600m
      nextPickupAtM = distanceM + 1500 + rand(4000); // pickup sau ~1500..5500m

      // xóa nhanh các object hiện trên màn hình để không gây va chạm ngay
      obstacles.forEach(o => { if(o.x + o.w > 0 && o.x < canvas.width) o.melted = true; });
      holes.forEach(h => { if(h.x + h.w > 0 && h.x < canvas.width) h.covered = true; });
      pickups.forEach(p => { if(p.x > 0 && p.x < canvas.width) p.remove = true; });

      // giảm tốc độ tạm thời để giữ UX mượt
      const prevSpeed = worldSpeed;
      worldSpeed = Math.max(200, Math.min(worldSpeed, 2000));
      setTimeout(() => { worldSpeed = prevSpeed; }, 900);
    } else {
      // delta nhỏ — điều chỉnh mốc spawn theo tỉ lệ như cũ nhưng không để loop sinh to
      nextSpawnAtM = Math.max(nextSpawnAtM + Math.floor(delta * 0.5), distanceM + 200);
      nextPickupAtM = Math.max(nextPickupAtM + Math.floor(delta * 0.3), distanceM + 1500);
    }
  }

  function teleportTo(target){
    if(!isFinite(target)) return;
    const delta = target - distanceM;
    if(delta <= 0) return;
    teleportDelta(delta);
  }

  // ========== RENDER ==========
  function render() {
  // =============================
  // BACKGROUND
  // =============================
  if (imgBg && imgBg.complete && !imgBg.__fallback) {
    const bgW = canvas.width;
    const bgH = canvas.height;

    // vẽ 2 lần để lặp liên tục
    ctx.drawImage(imgBg, bgScroll, 0, bgW, bgH);
    ctx.drawImage(imgBg, bgScroll + bgW, 0, bgW, bgH);
  } else {
    ctx.fillStyle = '#0c0f14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // =============================
  // ROAD (scroll)
  // =============================
  const roadY = groundTop, roadH = groundHeight;
  roadScroll = (roadScroll + worldSpeed * 0.6 * M2PX) % (BLOCK * 4);

  if (imgRoad && imgRoad.complete && !imgRoad.__fallback) {
    const tileW = BLOCK * 4;
    for (let x = -tileW; x < canvas.width + tileW; x += tileW) {
      ctx.drawImage(imgRoad, Math.floor(x - roadScroll), roadY, tileW, roadH);
    }
  } else {
    ctx.fillStyle = '#2a2f39';
    ctx.fillRect(0, roadY, canvas.width, roadH);
  }

  // =============================
  // PROJECTILES
  // =============================
  for (const b of projectiles) {
    ctx.drawImage(b.img, b.x, b.y - 16, 32, 32);
  }

  // =============================
  // HOLES
  // =============================
  holes.forEach(h => {
    if (
      now() < effectDestroyAllUntil ||
      now() < effectDestroyHolesUntil
    ) {
      // lấp hố
      ctx.fillStyle = '#ffffffff';
      ctx.fillRect(h.x, roadY - 2 * DPR, h.w, 4 * DPR);
    } else {
      // vẽ hố thật
      drawImageOrRect(ctx, imgHole, h.x, roadY, h.w, h.h);
    }
  });


// =============================
// COLUMNS
// =============================
obstacles.forEach(o => {
  if (o.type !== 'column' || o.destroy || o.melted) return;

  let img;

  if (now() < effectDestroyAllUntil || now() < effectDestroyColumnsUntil) {
    // Skill 7/8 đang chạy → vẽ giả (như cột bị ẩn)
    ctx.fillStyle = '#ffffffff';
    ctx.fillRect(o.x, roadY - 2 * DPR, o.w, 4 * DPR); 
  } else {
    // Hết hiệu ứng → vẽ lại cột thật
    img = (o.hBlocks === 1) ? imgColumn1 : imgColumn2;
    drawImageOrRect(ctx, img, o.x, o.y, o.w, Math.max(1, o.h));
  }
});
  // =============================
  // PICKUPS
  // =============================
  pickups.forEach(p => {
    if (imgPickup && imgPickup.complete && !imgPickup.__fallback) {
      ctx.drawImage(imgPickup, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else {
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // =============================
  // PLAYER SPRITE
  // =============================
  const sprite = (player.mode === 'dino') ? imgRun : imgFly;
  drawImageOrRect(ctx, sprite, player.x, player.y, player.w, player.h);
  // trong draw()
// draw statues (skill 6)
for (const s of statues) {
  if (!s.img || !s.img.complete) {
    // fallback: vẽ rect mờ
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#66ccff';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.restore();
  } else {
    ctx.save();
    ctx.globalAlpha = 0.6; // mờ hơn so với player
    ctx.drawImage(s.img, s.x, s.y, s.w, s.h);
    ctx.restore();
  }
}

  // =============================
  // HUD
  // =============================
  drawHUD();

  // meet overlay small icon
  if (meetShown) drawMeet();

  // toast
  if (skill.toast && now() < skill.toast.until) drawToast(skill.toast.text);

  // game over overlay
  if (gameOver) drawGameOverOverlay();
}

function drawHUD() {
  const pad = 10 * DPR;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(pad, pad, 380 * DPR, 100 * DPR);

  ctx.fillStyle = '#fff';
  ctx.font = `${14 * DPR}px Arial`;

  ctx.fillText(`Nhân vật: ${selected.name || ('NV #' + charId)}`, pad + 10*DPR, pad + 20*DPR);
  ctx.fillText(`Chế độ: ${player.mode === 'dino' ? 'Khủng long' : 'Chim'}`, pad + 10*DPR, pad + 40*DPR);
  ctx.fillText(`Tốc độ: ${Math.round(worldSpeed)} m/s`, pad + 10*DPR, pad + 60*DPR);
  ctx.fillText(
    `Quãng đường: ${metersToKmStr(distanceM)} / ${KM_MAX_HUD.toLocaleString('vi-VN')} km`,
    pad + 10*DPR, pad + 80*DPR
  );

// =============================
// SKILL BOX
// =============================
const right = canvas.width - pad;
const top = pad;

// Khung nền
ctx.fillStyle = 'rgba(0,0,0,0.35)';
ctx.fillRect(right - 340*DPR, top, 330*DPR, 100*DPR);

// Tên kỹ năng
ctx.fillStyle = '#fff';
ctx.fillText(`Kỹ năng: ${skillName(skill.type)}`, right - 330*DPR, top + 20*DPR);

const nowMs = now();

// Hiển thị trạng thái kỹ năng
if (skillActiveUntil > nowMs) {
  // còn hiệu lực
  const remain = Math.ceil((skillActiveUntil - nowMs) / 1000);
  ctx.fillText(`Đang hiệu lực: ${remain}s`, right - 330*DPR, top + 40*DPR);

} else if (skillCooldownUntil > nowMs) {
  // đang hồi chiêu
  const cd = Math.ceil((skillCooldownUntil - nowMs) / 1000);
  ctx.fillText(`Hồi chiêu: ${cd}s`, right - 330*DPR, top + 40*DPR);

} else if (!skill.type) {
  // chưa chọn kỹ năng
  ctx.fillText(`Sẵn sàng: Chưa có`, right - 330*DPR, top + 40*DPR);

} else if (skill.charges > 0) {
  // có kỹ năng và còn lượt dùng
  ctx.fillText(`Sẵn sàng: Có (E)`, right - 330*DPR, top + 40*DPR);

} else {
  // hết lượt, cần nhặt thêm
  ctx.fillText(`Hết lượt — cần nhặt thêm!`, right - 330*DPR, top + 40*DPR);
}


  ctx.fillText(`Mạng: ${player.lives}`, right - 330*DPR, top + 80*DPR);

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(pad, canvas.height - 40*DPR, 260*DPR, 30*DPR);
  ctx.fillStyle = '#000000ff';
  ctx.fillText(`Best: ${metersToKmStr(bestDistanceM)} km`, pad + 10*DPR, canvas.height - 18*DPR);
}

  function drawToast(text){
    ctx.font = `${14*DPR}px Arial`;
    const w = ctx.measureText(text).width + 40*DPR;
    const x = (canvas.width - w) / 2;
    const y = 20 * DPR;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y, w, 30*DPR);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x + 20*DPR, y + 20*DPR);
  }

function drawMeet(){
  if(imgMeet && imgMeet.complete && !imgMeet.__fallback){
    const w = BLOCK * 3;
    const h = BLOCK * 4;
    const x = canvas.width - 200;     // NPC đứng cố định cuối màn
    const y = groundTop - h;
    ctx.drawImage(imgMeet, x, y, w, h);
  } else {
    ctx.fillStyle = 'purple';
    ctx.fillRect(canvas.width - 200, groundTop - BLOCK * 4, BLOCK * 3, BLOCK * 4);
  }
}
 
function drawGameOverOverlay() {
    // Nền mờ
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Panel
    const w = Math.min(700 * DPR, canvas.width * 0.9);
    const h = Math.min(500 * DPR, canvas.height * 0.8);
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;

    ctx.fillStyle = '#11161a';
    roundRect(ctx, x, y, w, h, 12 * DPR, true, false);

    // Title
    ctx.fillStyle = '#fff';
    ctx.font = `${32 * DPR}px Arial Black`;
    const title = "GAME OVER";
    const tw = ctx.measureText(title).width;
    ctx.fillText(title, x + (w - tw) / 2, y + 50 * DPR);

    // Nhân vật
    let selectedChar = null;
    try {
        selectedChar = JSON.parse(localStorage.getItem("selectedCharacter"));
    } catch (e) {}

    if (selectedChar) {
        const characterImg = new Image();
        characterImg.src = selectedChar.img;

        const maxImgSize = 200 * DPR;
        const imgX = x + 40 * DPR;
        const imgY = y + 90 * DPR;

        function drawCharImage() {
            let imgWidth = characterImg.width;
            let imgHeight = characterImg.height;
            let scale = 1;

            if (imgWidth > imgHeight) scale = maxImgSize / imgWidth;
            else scale = maxImgSize / imgHeight;

            imgWidth *= scale;
            imgHeight *= scale;

            ctx.drawImage(characterImg, imgX, imgY, imgWidth, imgHeight);

            // Tên nhân vật
            ctx.fillStyle = '#fff';
            ctx.font = `${20 * DPR}px Arial`;
            ctx.fillText(`Nhân vật: ${selectedChar.name}`, imgX + imgWidth + 30 * DPR, imgY + 40 * DPR);

            // Tên người chơi
            const playerName = localStorage.getItem("playerName") || "Người chơi";
            ctx.fillStyle = '#ddd';
            ctx.font = `${18 * DPR}px Arial`;
            ctx.fillText(`Tên người chơi: ${playerName}`, imgX + imgWidth + 30 * DPR, imgY + 140 * DPR);
        }

        if (characterImg.complete) drawCharImage();
        else characterImg.onload = drawCharImage;
    }

    // Điểm
    ctx.fillStyle = '#ddd';
    ctx.font = `${18 * DPR}px Arial`;
    ctx.fillText(`Quãng đường: ${metersToKmStr(distanceM)} km`, x + 40 * DPR, y + h - 140 * DPR);
    ctx.fillText(`Best: ${metersToKmStr(bestDistanceM)} km`, x + 40 * DPR, y + h - 110 * DPR);

    // Nút
    const btnW = 160 * DPR, btnH = 50 * DPR;
    const gap = 40 * DPR;
    const by = y + h - btnH - 30 * DPR;
    const bx1 = x + (w / 2) - btnW - (gap / 2);
    const bx2 = x + (w / 2) + (gap / 2);

    drawButton(ctx, bx1, by, btnW, btnH, 'Chơi lại');
    drawButton(ctx, bx2, by, btnW, btnH, 'Về menu');

    // Lưu tọa độ nút để xử lý click
    gameOverButtons = [
        {x: bx1, y: by, w: btnW, h: btnH, action: "restart"},
        {x: bx2, y: by, w: btnW, h: btnH, action: "menu"}
    ];
}

function roundRect(ctx, x, y, w, h, r, fill=true, stroke=false){
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}

function drawButton(ctx, x, y, w, h, label){
    ctx.fillStyle = '#1f2933';
    roundRect(ctx, x, y, w, h, 8*DPR, true, false);
    ctx.fillStyle = '#fff';
    ctx.font = `${16*DPR}px Arial`;
    const tw = ctx.measureText(label).width;
    ctx.fillText(label, x + (w - tw) / 2, y + h / 2 + 6*DPR);
}

let gameOverButtons = []; // phải khai báo global

canvas.addEventListener("click", function(e) {
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top) * (canvas.height / rect.height);

    handleGameOverClick(px, py);
});

function handleGameOverClick(px, py){
    if (!gameOverButtons) return false;
    for (let btn of gameOverButtons){
        if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h){
            if (btn.action === "restart") window.location.href = "game.html";
            if (btn.action === "menu") window.location.href = "menu.html";
            return true;
        }
    }
    return false;
}


  // ========== START ==========
  // ensure canvas dims used in some constants reflect final size
  resetWorldDimensions();
  loop();

  // expose for debug (optional)
  window.__RUN_GOD = {
    state: () => ({ distanceM, worldSpeed, player, obstaclesLength: obstacles.length })
  };
// Gắn sự kiện click
  // ============================== Additional small utility end ==============================
})();
