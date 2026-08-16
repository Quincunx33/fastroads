/* traffic.js — two-way AI traffic + collision for Fastroads (modded slowroads.io)
   The game's webpack module sets window.__ROAD (path list + THREE + player car),
   window.__SCENE, window.__CARCTRL (vehicle controller) at runtime,
   but possibly AFTER this script parses — so we poll until they exist.
*/
(function () {
  "use strict";

  var BOOTED = false;

  function boot() {
    if (BOOTED) return;
    var RD = window.__ROAD;
    if (!RD || !RD.r) return;
    BOOTED = true;
    console.log("[traffic] booting, game ready");
    try {
      init(RD);
    } catch (e) {
      console.error("[traffic] boot init failed", e);
    }
  }

  function init(RD) {
    var TR = RD.r;
    var g = RD.g || {};
    // fallback: try named exports in case a full THREE build is exposed
    function pick(named, mapperKey) {
      var f = TR[named] || g[mapperKey];
      if (!f) throw new Error("[traffic] missing constructor: " + named + " / " + mapperKey);
      return f;
    }
    var Vector3 = pick("Vector3", "Vector3"),
      Group = pick("Group", "Group"),
      Mesh = pick("Mesh", "Mesh"),
      SphereProto = pick("SphereGeometry", "SphereGeometry"),
      BoxProto = pick("BoxGeometry", "BoxGeometry"),
      MatBasic = pick("MeshBasicMaterial", "MeshBasicMaterial");
    // shared prototype instances for cheap instancing
    // NOTE: the tree-shaken THREE build has no CylinderGeometry/ConeGeometry;
    // car body = stretched box; wheels = flattened spheres.
    var SphereGeometry = new SphereProto(1, 10, 8),
      BoxBody = new BoxProto(1, 1, 1),
      BoxCabin = new BoxProto(1, 1, 1);

    var STATE = {
      cars: [],
      ready: false,
      lastTime: 0,
      crashCooldown: 0,
      crashFlashTimer: 0,
      spawnTimer: 0,
    };

    var CFG = {
      COUNT: 8,
      SAME_DIR: 4,
      ONCOMING: 4,
      LANE_HALF: 1.05, // meters; keep traffic visibly within the road lanes
      SAME_SPEED_MIN: 14,
      SAME_SPEED_MAX: 24,
      ON_SPEED_MIN: 18,
      ON_SPEED_MAX: 30,
      SPAWN_AHEAD_MIN: 40,
      SPAWN_AHEAD_MAX: 140,
      SPAWN_BEHIND_MIN: 60,
      SPAWN_BEHIND_MAX: 160,
      COLLIDE_DIST: 2.4,
      COLLIDE_DIST_Y: 2.0,
      CRASH_SLOW: 0.32,
      CRASH_SPIN: 1.1,
      CRASH_COOLDOWN: 2.0,
      FLASH_TIME: 1.2,
    };

    var ROAD = { head: null, tail: null, vehicleNode: null };

    function buildCarMesh(color, isOncoming) {
      var g = new Group();
      var bodyMat = new MatBasic({ color: color });
      var glassMat = new MatBasic({ color: 0x88bbee });
      var tireMat = new MatBasic({ color: 0x1a1a1a });

      // body: stretched box (length along -x local; width z; height y)
      var body = new Mesh(BoxBody, bodyMat);
      body.scale.set(4.3, 0.85, 2.0);
      body.position.set(0, 0.62, 0);
      g.add(body);

      // cabin
      var cabin = new Mesh(BoxCabin, glassMat);
      cabin.scale.set(1.9, 0.75, 1.7);
      cabin.position.set(-0.1, 1.2, 0);
      g.add(cabin);

      // wheels: flattened spheres (no CylinderGeometry in this THREE build)
      var wx = [-1.35, 1.25];
      var wz = [1.05, -1.05];
      for (var i = 0; i < 2; i++) {
        for (var j = 0; j < 2; j++) {
          var w = new Mesh(SphereGeometry, tireMat);
          w.scale.set(0.4, 0.7, 0.7);
          w.position.set(wx[i], 0.38, wz[j]);
          g.add(w);
        }
      }

      // headlights (front, -x local)
      var lampMat = new MatBasic({
        color: isOncoming ? 0xffeecc : 0x88aacc,
      });
      var lamp1 = new Mesh(SphereGeometry, lampMat);
      lamp1.scale.set(0.18, 0.18, 0.18);
      lamp1.position.set(-2.15, 0.72, 0.6);
      g.add(lamp1);
      var lamp2 = new Mesh(SphereGeometry, lampMat);
      lamp2.scale.set(0.18, 0.18, 0.18);
      lamp2.position.set(-2.15, 0.72, -0.6);
      g.add(lamp2);

      // tail lights (rear, +x local)
      var tail = new Mesh(SphereGeometry, new MatBasic({ color: 0xff0000 }));
      tail.scale.set(0.15, 0.15, 0.15);
      tail.position.set(2.15, 0.72, 0.65);
      g.add(tail);
      var tail2 = tail.clone();
      tail2.position.set(2.15, 0.72, -0.65);
      g.add(tail2);

      return g;
    }

    function AICar(node, laneDir, speed, dir, color) {
      this.node = node;
      this.laneDir = laneDir; // +1 or -1
      this.speed = speed; // m/s magnitude
      this.dir = dir; // +1 forward along node.next, -1 backward along node.prev
      this.distToNext = 0;
      this.t = 0;
      this.pos = new Vector3();
      this.mesh = buildCarMesh(color, dir < 0);
      this.mesh.visible = false;
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 20;
      this.dead = false;
      this.recomputeDist();
    }

    AICar.prototype.recomputeDist = function () {
      var nxt = this.dir > 0 ? this.node.next : this.node.prev;
      if (!nxt) {
        this.dead = true;
        return;
      }
      var a = this.node.p,
        b = nxt.p;
      var dx = b.x - a.x,
        dz = b.z - a.z;
      this.distToNext = Math.sqrt(dx * dx + dz * dz);
      if (this.distToNext < 0.01) this.distToNext = 1;
    };

    AICar.prototype.update = function (dt) {
      if (this.dead) return;
      this.recomputeDist();
      if (this.dead || this.distToNext <= 0) return;

      var step = this.speed * dt * this.dir;
      var remaining = this.distToNext - Math.abs(step);
      var crossed = false;
      while (Math.abs(step) >= this.distToNext) {
        if (step > 0) {
          this.node = this.node.next;
        } else {
          this.node = this.node.prev;
        }
        if (!this.node) {
          this.dead = true;
          return;
        }
        step = step > 0 ? step - this.distToNext : step + this.distToNext;
        this.recomputeDist();
        if (this.dead || this.distToNext <= 0) return;
        crossed = true;
      }
      if (!crossed) {
        this.t = 1 - Math.abs(step) / this.distToNext;
      } else {
        this.t = 1 - Math.abs(step) / this.distToNext;
      }
      this.t = Math.max(0, Math.min(1, this.t));

      // position: lerp toward the node in the travel direction
      var a = this.node.p;
      var fwd = this.dir > 0 ? this.node.next : this.node.prev;
      var b = fwd ? fwd.p : a;
      var x = a.x + (b.x - a.x) * this.t;
      var y = a.y + (b.y - a.y) * this.t;
      var z = a.z + (b.z - a.z) * this.t;

      // lane offset (perpendicular in XZ plane)
      var dx = b.x - a.x,
        dz = b.z - a.z;
      var len = Math.sqrt(dx * dx + dz * dz) || 1;
      var px = (-dz / len) * CFG.LANE_HALF * this.laneDir;
      var pz = (dx / len) * CFG.LANE_HALF * this.laneDir;
      this.pos.set(x + px, y + 0.15, z + pz);
      this.mesh.position.copy(this.pos);

      // facing: direction of travel in world space
      var edx = dx * this.dir,
        edz = dz * this.dir;
      if (Math.abs(edx) + Math.abs(edz) > 1e-6) {
        this.mesh.rotation.y = Math.atan2(edx, edz);
      }
    };

    // ---------- spawn ----------
    var CAR_COLORS = [
      0xd33b3b, 0x3b7fd3, 0x3bd364, 0xd3a93b, 0x9b3bd3, 0xd33b9a, 0x555555,
      0xeeeeee, 0xd3773b, 0x3bd3c9,
    ];

    function randomRange(min, max) {
      return min + Math.random() * (max - min);
    }

    function walkNode(node, steps, dir) {
      var cur = node;
      for (var k = 0; k < steps; k++) {
        cur = dir > 0 ? cur.next : cur.prev;
        if (!cur) return null;
      }
      return cur;
    }

    function spawnAICar(mode) {
      var vNode = ROAD.vehicleNode;
      if (!vNode) return false;
      // oncoming cars: spawn ahead (further along road) so they approach player
      var ahead = mode === "same" ? Math.floor(randomRange(0, 2)) : Math.floor(randomRange(1, 3));
      var baseNode = walkNode(vNode, ahead, 1);
      if (!baseNode) return false;
      var dir = mode === "same" ? 1 : -1;
      var speed =
        mode === "same"
          ? randomRange(CFG.SAME_SPEED_MIN, CFG.SAME_SPEED_MAX)
          : randomRange(CFG.ON_SPEED_MIN, CFG.ON_SPEED_MAX);
      var lane = mode === "same" ? 0.75 : -0.75;
      var color = CAR_COLORS[(CAR_COLORS.length * Math.random()) | 0];
      var car = new AICar(baseNode, lane, speed, dir, color);
      if (car.dead) return false;
      STATE.cars.push(car);
      car.mesh.visible = true;
      if (window.__SCENE && !car.mesh.parent) window.__SCENE.add(car.mesh);
      // Place the mesh immediately; otherwise the first frame can leave it at (0,0,0).
      car.update(0.016);
      return true;
    }

    function respawn(car, mode) {
      var vNode = ROAD.vehicleNode;
      if (!vNode) {
        car.dead = true;
        return;
      }
      var steps =
        mode === "same"
          ? Math.floor(randomRange(20, 60) / 6)
          : Math.floor(randomRange(20, 60) / 6);
      // oncoming cars spawn far ahead in travel direction (+1 along road)
      var node = walkNode(vNode, steps, 1);
      if (!node) {
        car.dead = true;
        return;
      }
      var speed =
        mode === "same"
          ? randomRange(CFG.SAME_SPEED_MIN, CFG.SAME_SPEED_MAX)
          : randomRange(CFG.ON_SPEED_MIN, CFG.ON_SPEED_MAX);
      car.node = node;
      car.speed = speed;
      car.dir = mode === "same" ? 1 : -1;
      car.laneDir = mode === "same" ? 1 : -1;
      car.dead = false;
      car.mesh.visible = true;
      car.recomputeDist();
      car.update(0.016);
    }

    // ---------- collision with player ----------
    var _dv = new Vector3();
    function checkPlayerCollision(car) {
      var p = RD.car;
      var playerPos = p && (p.position || p.pPosition || p.pos);
      if (!playerPos) return;
      _dv.subVectors(car.pos, playerPos);
      var dx = _dv.x,
        dz = _dv.z,
        dy = _dv.y;
      var dist2 = dx * dx + dz * dz;
      if (dist2 < CFG.COLLIDE_DIST * CFG.COLLIDE_DIST && Math.abs(dy) < CFG.COLLIDE_DIST_Y) {
        handleCrash(car);
      }
    }

    function handleCrash(car) {
      var p = RD.car;
      if (!p || STATE.crashCooldown > 0) return;
      STATE.crashCooldown = CFG.CRASH_COOLDOWN;
      STATE.crashFlashTimer = CFG.FLASH_TIME;

      if (typeof p.speed !== "undefined") p.speed *= CFG.CRASH_SLOW;

      try {
        var ctrl = window.__CARCTRL;
        if (ctrl && ctrl.inputs) {
          ctrl.inputs.brake = 1;
          ctrl.inputs.accel = 0;
          ctrl.inputs.steer = car.dir > 0 ? -CFG.CRASH_SPIN : CFG.CRASH_SPIN;
          setTimeout(function () {
            if (ctrl.inputs) {
              ctrl.inputs.brake = 0;
              ctrl.inputs.steer = 0;
            }
          }, 700);
        }
      } catch (e) {}

      showCrashMessage();
    }

    // ---------- crash HUD message ----------
    var flashEl = null;
    function getOrCreateFlashEl() {
      if (flashEl) return flashEl;
      flashEl = document.createElement("div");
      flashEl.id = "traffic-crash-flash";
      flashEl.textContent = "⚠ CRASH!";
      flashEl.style.cssText =
        "position:fixed;top:16%;left:50%;transform:translateX(-50%);z-index:99999;" +
        "font-family:'Courier New',monospace;font-size:34px;font-weight:bold;color:#ff3b3b;" +
        "text-shadow:0 0 12px rgba(255,0,0,.8),0 0 30px rgba(255,0,0,.5);" +
        "pointer-events:none;opacity:0;transition:opacity .2s;letter-spacing:2px;";
      document.body.appendChild(flashEl);
      return flashEl;
    }
    function showCrashMessage() {
      var el = getOrCreateFlashEl();
      el.style.opacity = "1";
    }

    // ---------- main loop ----------
    function onFrame(dt) {
      if (!STATE.ready) {
        if (window.__ROAD && window.__ROAD.vehicleNode) {
          ROAD.vehicleNode = window.__ROAD.vehicleNode;
          STATE.ready = true;
          console.log("[traffic] road ready");
        }
        if (!STATE.ready) return;
      }
      // keep road ref fresh every frame
      if (window.__ROAD) ROAD.vehicleNode = window.__ROAD.vehicleNode;

            var p = RD.car;
      var playerPos = p && (p.position || p.pPosition || p.pos);
      if (!playerPos && ROAD.vehicleNode && ROAD.vehicleNode.p) {
        playerPos = ROAD.vehicleNode.p;
      }
      if (!playerPos) return;
      var dtClamped = Math.min(dt, 0.1);

      if (STATE.crashCooldown > 0) STATE.crashCooldown -= dtClamped;
      if (STATE.crashFlashTimer > 0) {
        STATE.crashFlashTimer -= dtClamped;
        if (STATE.crashFlashTimer <= 0 && flashEl) flashEl.style.opacity = "0";
      }

      // spawn management
      var sameCount = 0,
        onCount = 0;
      for (var i = 0; i < STATE.cars.length; i++) {
        if (STATE.cars[i].dead) continue;
        if (STATE.cars[i].dir > 0) sameCount++;
        else onCount++;
      }
      STATE.spawnTimer -= dtClamped;
      if (STATE.spawnTimer <= 0) {
        STATE.spawnTimer = 0.8;
        var tries = 0;
        while (sameCount < CFG.SAME_DIR && tries < 4) {
          if (spawnAICar("same")) sameCount++;
          tries++;
        }
        tries = 0;
        while (onCount < CFG.ONCOMING && tries < 4) {
          if (spawnAICar("on")) onCount++;
          tries++;
        }
      }

      // update + collision
      for (var i = STATE.cars.length - 1; i >= 0; i--) {
        var c = STATE.cars[i];
        if (c.dead) {
          if (c.mesh.parent) c.mesh.parent.remove(c.mesh);
          STATE.cars.splice(i, 1);
          continue;
        }
        c.update(dtClamped);
        if (c.dead) continue;

        // cull cars too far from player
        var ddx = c.pos.x - playerPos.x,
          ddz = c.pos.z - playerPos.z;
        if (ddx * ddx + ddz * ddz > 400 * 400) {
          respawn(c, c.dir > 0 ? "same" : "on");
          continue;
        }
        checkPlayerCollision(c);
      }
    }

    // hook into the game loop (called from the patched main chunk each frame)
    window.__onFrame = function (dt) {
      try {
        onFrame(dt);
      } catch (e) {
        console.error("[traffic]", e);
      }
    };

    console.log("[traffic] initialized");
  }

  // Poll for the game module's globals (they may be set after this script parses).
  // Polling is kept running (no timeout) so a late page reload still connects.
  var poll = setInterval(function () {
    if (window.__ROAD && window.__ROAD.r) {
      boot();
    }
  }, 150);
  boot();

  console.log("[traffic] loaded");
})();
