gsap.registerPlugin(ScrollTrigger);

const SITE_ASSET_VERSION = "83";
const assetUrl = (path) => `${path}${path.includes("?") ? "&" : "?"}v=${SITE_ASSET_VERSION}`;

const FRAME_COUNT = 80;
const FRAME_PATH = (index) => `./assets/hero/${String(index).padStart(2, "0")}.webp`;
const FRAME_WORKERS = 4;
const FRAME_FORWARD_WARM = 7;
const FRAME_BACK_WARM = 3;

const hero = document.querySelector("#hero");
const siteNav = document.querySelector("#siteNav");
const navMenu = document.querySelector(".nav-menu");
const navCall = document.querySelector(".nav-call");
const heroBrand = document.querySelector("#heroBrand");
const canvas = document.querySelector("#heroCanvas");
const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
const archetypesRoot = document.querySelector("#archetypes");
const experience = document.querySelector("#experience");
const experiencePin = document.querySelector(".experience-pin");
const experienceTrack = document.querySelector("#experienceTrack");
const experienceProgress = document.querySelector("#experienceProgress");
const experienceCount = document.querySelector("#experienceCount");
const experiencePanels = [...document.querySelectorAll(".experience-panel")];
const heroEditorialCopy = [...document.querySelectorAll(".hero-editorial-copy__item")];

const images = new Array(FRAME_COUNT);
const state = { frame: 0 };
let activeFrame = -1;

const frameLoadPromises = new Map();
const frameQueue = [];
let activeFrameLoads = 0;
let lastHeroWarmCenter = -999;
let lastHeroRenderFrame = 0;

function connectionIsConstrained() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return false;
  const type = String(connection.effectiveType || "").toLowerCase();
  const downlink = Number(connection.downlink);
  const rtt = Number(connection.rtt);
  return Boolean(
    connection.saveData ||
    type === "slow-2g" ||
    type === "2g" ||
    (Number.isFinite(downlink) && downlink > 0 && downlink < 1.25) ||
    (Number.isFinite(rtt) && rtt > 650)
  );
}

/*
  Section 02 content is driven by the supplied archetype artwork:
  Y = Young, M = Middle-aged, O = Older.
  The source pack contains four styling variations (a-d) plus one
  archetype reference image for each group.
*/
const archetypes = [
  {
    id: "young",
    index: "01",
    label: "YOUNG",
    note: "Four directions. One starting point.",
    base: "Y-model.webp",
    looks: [
      { image: "Y-model-a.webp", service: "Hair Colour / Blonde", alt: "Platinum blonde haircut and colour look at Rashcuts", title: "PLATINUM HAIR", tag: "LOOK A", description: "A sharper, pared-back direction with the cut doing the talking." },
      { image: "Y-model-b.webp", service: "Box Braids", alt: "Box braids hairstyle with a clean structured finish at Rashcuts", title: "BOX BRAIDS", tag: "LOOK B", description: "Boxed braids with a clean, structured finish." },
      { image: "Y-model-c.webp", service: "Fade", alt: "High-volume textured fade haircut at Rashcuts", title: "VOLUME FADE", tag: "LOOK C", description: "A clean fade with strong volume carried through the top." },
      { image: "Y-model-d.webp", service: "Braids", alt: "Classic braided hairstyle at Rashcuts", title: "CLASSIC BRAIDS", tag: "LOOK D", description: "Regular braids kept clean, simple and considered." }
    ]
  },
  {
    id: "middle",
    index: "02",
    label: "MIDDLE-AGED",
    note: "Different texture. Different balance.",
    base: "M-model.webp",
    looks: [
      { image: "M-model-a.webp", service: "Classic Cut", alt: "Refined classic haircut with clean lines at Rashcuts", title: "THE REFINED", tag: "LOOK A", description: "Clean lines and controlled shape for an understated finish." },
      { image: "M-model-b.webp", service: "Taper / Styling", alt: "Relaxed tapered haircut with natural texture at Rashcuts", title: "THE RELAXED", tag: "LOOK B", description: "A softer direction that keeps the personality in the room." },
      { image: "M-model-c.webp", service: "Natural Texture Cut", alt: "Natural textured haircut with an easy silhouette at Rashcuts", title: "THE WARM CUT", tag: "LOOK C", description: "Natural texture and an easy silhouette with presence." },
      { image: "M-model-d.webp", service: "Locs / Braids Styling", alt: "Locs or long-form braided hairstyle at Rashcuts", title: "THE DISTINCTIVE", tag: "LOOK D", description: "A bolder direction that leans into character and contrast." }
    ]
  },
  {
    id: "older",
    index: "03",
    label: "OLDER",
    note: "Character stays. The styling changes.",
    base: "O-model.webp",
    looks: [
      { image: "O-model-a.webp", service: "Classic Cut + Grooming", alt: "Polished classic haircut and grooming finish at Rashcuts", title: "THE POLISHED", tag: "LOOK A", description: "A composed, tailored direction with a clean finish." },
      { image: "O-model-b.webp", service: "Natural Texture Cut", alt: "Natural textured haircut with a clean shape at Rashcuts", title: "THE NATURAL", tag: "LOOK B", description: "Texture, shape and character kept deliberately close to natural." },
      { image: "O-model-c.webp", service: "Low Maintenance Cut", alt: "Low-maintenance classic haircut with natural shape at Rashcuts", title: "THE EASY CUT", tag: "LOOK C", description: "Relaxed and confident, with the shape doing the work." },
      { image: "O-model-d.webp", service: "Cut + Beard Grooming", alt: "Casual haircut and beard grooming finish at Rashcuts", title: "THE CASUAL", tag: "LOOK D", description: "A more open, effortless direction built around personality." }
    ]
  }
];

function loadImage(src, fetchPriority = "auto") {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = fetchPriority;
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function pumpFrameQueue() {
  if (activeFrameLoads >= FRAME_WORKERS || !frameQueue.length) return;

  frameQueue.sort((a, b) => (a.priority - b.priority) || (a.sequence - b.sequence));
  while (activeFrameLoads < FRAME_WORKERS && frameQueue.length) {
    const job = frameQueue.shift();
    activeFrameLoads += 1;

    loadImage(assetUrl(FRAME_PATH(job.index + 1)), job.priority === 0 ? "high" : job.priority === 1 ? "auto" : "low")
      .then((image) => {
        images[job.index] = image;
        job.resolve(image);
        if (image && Math.round(state.frame) === job.index && activeFrame !== job.index) {
          drawFrame(job.index);
        }
      })
      .finally(() => {
        activeFrameLoads -= 1;
        pumpFrameQueue();
      });
  }
}

function requestFrame(index, priority = 2) {
  const normalized = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(index)));
  if (images[normalized]) return Promise.resolve(images[normalized]);
  if (frameLoadPromises.has(normalized)) return frameLoadPromises.get(normalized);

  let sequence = frameQueue.length;
  const promise = new Promise((resolve) => {
    frameQueue.push({ index: normalized, priority, sequence, resolve });
    pumpFrameQueue();
  });
  frameLoadPromises.set(normalized, promise);
  return promise;
}

function warmHeroFrames(center, direction = 1) {
  const threshold = connectionIsConstrained() ? 1 : 2;
  if (Math.abs(center - lastHeroWarmCenter) < threshold) return;
  lastHeroWarmCenter = center;

  requestFrame(center, 0);
  const ahead = direction >= 0 ? FRAME_FORWARD_WARM : FRAME_BACK_WARM;
  const behind = direction >= 0 ? FRAME_BACK_WARM : FRAME_FORWARD_WARM;

  for (let step = 1; step <= ahead; step++) requestFrame(center + step, 2);
  for (let step = 1; step <= behind; step++) requestFrame(center - step, 2);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (activeFrame >= 0 && images[activeFrame]) drawFrame(activeFrame);
  }
}

function drawFrame(frameIndex) {
  const index = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(frameIndex)));
  const image = images[index];
  if (!image || !image.naturalWidth) return;

  const cw = canvas.width;
  const ch = canvas.height;
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  const isMobile = window.innerWidth <= 700;

  // The hero itself fills the entire viewport at every breakpoint.
  // Use cover so there are no side gutters or secondary/matte imagery.
  // This intentionally trims only the overflow required by the viewport's aspect ratio while preserving the source proportions.
  // The supplied hero frames carry a tiny green render/seam strip in their
  // final source rows. Crop only that baked-in strip at draw time so the
  // existing frame sequence, timing and interaction remain unchanged.
  const sourceTrim = 6;
  const sourceHeight = Math.max(1, ih - sourceTrim);
  const scale = Math.max(cw / iw, ch / sourceHeight);
  const dw = iw * scale;
  const dh = sourceHeight * scale;
  const dx = (cw - dw) * 0.5;
  // Desktop: anchor the SOURCE TOP to the viewport top. When the wide
  // viewport forces vertical overflow, the crop must come from the lower
  // part of the frame — never from the model's head/hood.
  // Mobile keeps the centered framing that was already working well.
  const dy = isMobile ? (ch - dh) * 0.5 : 0;

  ctx.fillStyle = '#0b0a0d';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(image, 0, 0, iw, sourceHeight, dx, dy, dw, dh);
  activeFrame = index;
}

function renderFrame(frameIndex) {
  const nextFrame = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(frameIndex)));
  const direction = nextFrame >= lastHeroRenderFrame ? 1 : -1;
  lastHeroRenderFrame = nextFrame;

  if (!images[nextFrame]) {
    requestFrame(nextFrame, 0);
    // Keep the nearest available frame on screen while a requested frame is arriving.
    let fallback = -1;
    let fallbackDistance = Infinity;
    images.forEach((image, index) => {
      if (!image || !image.naturalWidth) return;
      const distance = Math.abs(index - nextFrame);
      if (distance < fallbackDistance) {
        fallback = index;
        fallbackDistance = distance;
      }
    });
    if (fallback >= 0 && fallback !== activeFrame) drawFrame(fallback);
  } else {
    drawFrame(nextFrame);
  }

  warmHeroFrames(nextFrame, direction);
}


/* The hero wordmark uses the exact Gebuk glyph outlines for the visible type.
   The handwriting animation is a MASK only: the user never sees a stroke.
   A broad, invisible mask brush follows a deliberate pen order for each
   character, progressively revealing the normal white Gebuk fill beneath it. */
const HERO_BRAND_GLYPHS = [{"ch":"R","advance":592,"d":"M448 288Q489 313 513.5 352.5Q538 392 538 438Q538 486 510.0 528.5Q482 571 435.5 596.5Q389 622 334 622H40V-1H128V367Q128 367 149.5 320.0Q171 273 208.5 214.0Q246 155 301.0 95.5Q356 36 423 -1H572Q521 25 455.0 78.0Q389 131 326 206ZM334 546Q378 546 413.5 513.0Q449 480 449 438Q449 412 434.5 388.5Q420 365 396 349Q383 341 278 270Q190 397 147 546Z"},{"ch":"a","advance":458,"d":"M117 130Q122 163 155.0 177.5Q188 192 253 204Q310 215 344.5 226.5Q379 238 401.5 265.0Q424 292 420 338Q415 405 354.0 430.0Q293 455 224 451Q159 448 109.0 419.0Q59 390 33 346L90 305Q113 344 145.5 362.0Q178 380 224 383Q288 389 313.5 365.5Q339 342 330 318Q321 290 290.0 278.5Q259 267 200 258Q196 257 194 257Q144 249 107.0 235.5Q70 222 45.5 194.0Q21 166 20 120Q19 67 47.5 36.5Q76 6 115.0 -4.0Q154 -14 184 -8Q222 0 248.0 17.5Q274 35 300 61Q316 76 324.5 82.0Q333 88 341 87Q355 84 356.0 65.0Q357 46 351.5 23.0Q346 0 346 0H431Q431 0 435.5 34.5Q440 69 436.5 105.0Q433 141 413.0 163.5Q393 186 351 176Q336 173 321.5 161.5Q307 150 285 129Q256 101 234.0 85.5Q212 70 185 68Q145 65 129.5 86.0Q114 107 117 130Z"},{"ch":"s","advance":446,"d":"M330 131Q324 151 298.0 161.5Q272 172 219 185Q162 199 125.0 212.5Q88 226 60.0 252.0Q32 278 28 321Q24 382 80.0 419.0Q136 456 232 449Q280 447 316.0 433.0Q352 419 375.0 402.5Q398 386 410.5 371.5Q423 357 423 357L367 315Q367 315 351.0 331.5Q335 348 305.0 363.0Q275 378 233 381Q187 385 154.0 372.0Q121 359 124 331Q126 309 152.5 297.0Q179 285 236 270Q293 255 330.0 241.0Q367 227 395.0 200.5Q423 174 426 131Q431 59 370.5 23.0Q310 -13 219 -7Q169 -4 130.5 10.5Q92 25 68.5 42.5Q45 60 32.5 75.5Q20 91 20 91L80 130Q80 130 88.0 120.5Q96 111 112.0 99.5Q128 88 154.0 78.0Q180 68 215 65Q281 58 309.5 79.5Q338 101 330 131Z"},{"ch":"h","advance":492,"d":"M317 365Q339 363 349.0 333.0Q359 303 360.5 267.0Q362 231 362 231V0H452Q452 0 452 238Q452 433 347 449Q292 457 250.0 424.0Q208 391 182.0 343.0Q156 295 142.5 249.5Q129 204 129 204V615H40V0H129Q129 0 145.0 64.5Q161 129 186.0 198.5Q211 268 245.0 318.5Q279 369 317 365Z"},{"ch":"c","advance":490,"d":"M393 166Q377 122 339.5 94.0Q302 66 256 66Q195 66 152.0 111.0Q109 156 109 219Q109 283 152.0 328.0Q195 373 256 373Q301 373 338.5 346.0Q376 319 392 276H470Q450 352 392.5 400.0Q335 448 256 448Q192 448 137.5 417.5Q83 387 51.5 334.5Q20 282 20 219Q20 157 51.5 104.5Q83 52 137.5 21.0Q192 -10 256 -10Q336 -10 393.5 39.0Q451 88 470 166Z"},{"ch":"u","advance":492,"d":"M174 77Q152 79 142.0 109.0Q132 139 130.5 175.0Q129 211 129 211V442H40Q40 442 40 205Q40 9 145 -6Q200 -15 242.0 18.0Q284 51 309.5 99.0Q335 147 348.5 192.5Q362 238 362 238V1H452V442H362Q362 442 346.5 377.5Q331 313 306.0 243.5Q281 174 246.5 123.5Q212 73 174 77Z"},{"ch":"t","advance":382,"d":"M321 307V394Q296 418 255.5 428.5Q215 439 177.5 440.0Q140 441 140 441Q184 470 212.5 525.5Q241 581 241 660H161Q161 660 159.5 632.5Q158 605 146.0 570.0Q134 535 103.5 499.5Q73 464 20 441V366Q20 366 41.0 369.5Q62 373 90.5 374.0Q119 375 147 371V130Q147 60 195 24Q238 -8 307 -8Q321 -8 342 -6L362 -3V75L334 70Q326 68 307 68Q273 68 254 79Q235 94 235 130V354Q235 354 249.0 350.0Q263 346 282.5 335.5Q302 325 321 307Z"},{"ch":"s","advance":446,"d":"M330 131Q324 151 298.0 161.5Q272 172 219 185Q162 199 125.0 212.5Q88 226 60.0 252.0Q32 278 28 321Q24 382 80.0 419.0Q136 456 232 449Q280 447 316.0 433.0Q352 419 375.0 402.5Q398 386 410.5 371.5Q423 357 423 357L367 315Q367 315 351.0 331.5Q335 348 305.0 363.0Q275 378 233 381Q187 385 154.0 372.0Q121 359 124 331Q126 309 152.5 297.0Q179 285 236 270Q293 255 330.0 241.0Q367 227 395.0 200.5Q423 174 426 131Q431 59 370.5 23.0Q310 -13 219 -7Q169 -4 130.5 10.5Q92 25 68.5 42.5Q45 60 32.5 75.5Q20 91 20 91L80 130Q80 130 88.0 120.5Q96 111 112.0 99.5Q128 88 154.0 78.0Q180 68 215 65Q281 58 309.5 79.5Q338 101 330 131Z"}];
const HERO_BRAND_VIEW_HEIGHT = 680;
const HERO_BRAND_TOTAL_ADVANCE = 3798;

// Widened reveal window for a slow, deliberately dragged-out trace. Writing is
// separate from the upward shrink: 24–71 = handwriting only; 71–80 = logo handoff.
// Each character gets an equal share of the reveal window, with no artificial
// gaps between letters.
const HERO_BRAND_TRACE_START_FRAME = 24;
const HERO_BRAND_TRACE_END_FRAME = 71;

/* One broad invisible "brush" path per character. These are used only inside
   an SVG luminance mask. Their stroke is never rendered to the page. The
   visible layer underneath is the untouched, filled Gebuk wordmark. */
const HERO_BRAND_HANDWRITING = [
  { width: 108, d: "M86 615L86 30M88 548C190 548 335 546 414 500C477 463 482 395 445 345C404 292 318 264 195 230M206 230L520 8" },
  { width: 100, d: "M346 435L346 28M347 170C307 231 234 258 167 246C103 235 64 199 67 151C70 99 125 72 205 76C276 79 326 110 347 170" },
  { width: 96, d: "M390 74C337 27 257 23 177 43C104 61 61 102 74 148C88 199 146 214 227 232C314 251 374 276 376 329C378 386 317 426 234 430C149 435 84 410 42 365" },
  { width: 100, d: "M84 615L84 22M87 326C131 403 213 444 291 433C366 423 398 369 400 292L400 36" },
  { width: 96, d: "M405 155C374 82 316 43 251 43C155 43 82 116 82 216C82 313 150 391 252 391C322 391 377 355 408 286" },
  { width: 100, d: "M88 440L88 206C88 102 125 44 179 44C254 44 313 124 358 240L358 14" },
  { width: 88, d: "M75 391L334 391M192 391L192 119C192 49 232 14 305 17" },
  { width: 96, d: "M390 74C337 27 257 23 177 43C104 61 61 102 74 148C88 199 146 214 227 232C314 251 374 276 376 329C378 386 317 426 234 430C149 435 84 410 42 365" }
];

let heroBrandPaths = [];
let heroBrandMaskPaths = [];

function setupHeroBrandTracing() {
  if (!heroBrand || heroBrand.dataset.traced === "true") return;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.classList.add("hero-brand__svg");
  svg.setAttribute("viewBox", `0 0 ${HERO_BRAND_TOTAL_ADVANCE} ${HERO_BRAND_VIEW_HEIGHT}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("aria-hidden", "true");

  const defs = document.createElementNS(svgNS, "defs");
  const mask = document.createElementNS(svgNS, "mask");
  const maskId = `heroBrandMask-${Date.now()}`;
  mask.id = maskId;
  mask.setAttribute("maskUnits", "userSpaceOnUse");
  mask.setAttribute("maskContentUnits", "userSpaceOnUse");
  mask.setAttribute("x", "0");
  mask.setAttribute("y", "0");
  mask.setAttribute("width", String(HERO_BRAND_TOTAL_ADVANCE));
  mask.setAttribute("height", String(HERO_BRAND_VIEW_HEIGHT));
  mask.setAttribute("mask-type", "luminance");

  const black = document.createElementNS(svgNS, "rect");
  black.setAttribute("x", "0");
  black.setAttribute("y", "0");
  black.setAttribute("width", String(HERO_BRAND_TOTAL_ADVANCE));
  black.setAttribute("height", String(HERO_BRAND_VIEW_HEIGHT));
  black.setAttribute("fill", "black");
  mask.appendChild(black);

  // NOTE: no transform here. This group is only ever seen through
  // fillGroup's `mask="url(...)"` reference below, and per the SVG spec a
  // mask's content is evaluated in the coordinate system already in place
  // for the element that references it — i.e. fillGroup's own
  // "translate(0 660) scale(1 -1)" flip is applied to this group
  // automatically. Adding the same flip here a second time cancelled it
  // back out and left the pen strokes rendering upside-down relative to
  // the glyph fill, which is why the handwriting reveal never lined up
  // with the letters.
  const maskGroup = document.createElementNS(svgNS, "g");
  let cursor = 0;

  heroBrandMaskPaths = HERO_BRAND_HANDWRITING.map((brush, index) => {
    const glyph = HERO_BRAND_GLYPHS[index];
    const clip = document.createElementNS(svgNS, "clipPath");
    clip.setAttribute("id", `${maskId}-clip-${index}`);
    clip.setAttribute("clipPathUnits", "userSpaceOnUse");

    const clipShape = document.createElementNS(svgNS, "path");
    clipShape.setAttribute("d", glyph.d);
    // NOTE: no transform here either, for the same reason as maskGroup
    // above. A clip-path is evaluated in the coordinate system already in
    // place for the element it clips (the pen-stroke path below, which
    // gets its own "translate(cursor 0)"), so this clip shape only needs
    // the glyph's raw outline — the cursor offset it used to duplicate
    // here was clipping each letter's brush stroke against a shifted,
    // mirrored copy of the glyph instead of the glyph itself.
    clip.appendChild(clipShape);
    defs.appendChild(clip);

    const path = document.createElementNS(svgNS, "path");
    path.classList.add("hero-brand__mask-pen");
    path.setAttribute("d", brush.d);
    path.setAttribute("transform", `translate(${cursor} 0)`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "white");
    path.setAttribute("stroke-width", String(brush.width));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("clip-path", `url(#${maskId}-clip-${index})`);
    path.dataset.index = String(index);
    maskGroup.appendChild(path);
    cursor += glyph.advance;
    return path;
  });

  mask.appendChild(maskGroup);
  defs.appendChild(mask);
  svg.appendChild(defs);

  // Exact Gebuk fill — no visible stroke, ever.
  const fillGroup = document.createElementNS(svgNS, "g");
  fillGroup.classList.add("hero-brand__fill-group");
  fillGroup.setAttribute("transform", "translate(0 660) scale(1 -1)");
  cursor = 0;

  heroBrandPaths = HERO_BRAND_GLYPHS.map((glyph) => {
    const path = document.createElementNS(svgNS, "path");
    path.classList.add("hero-brand__fill");
    path.setAttribute("d", glyph.d);
    path.setAttribute("transform", `translate(${cursor} 0)`);
    path.setAttribute("fill", "white");
    path.setAttribute("stroke", "none");
    fillGroup.appendChild(path);
    cursor += glyph.advance;
    return path;
  });

  fillGroup.setAttribute("mask", `url(#${maskId})`);
  svg.appendChild(fillGroup);
  heroBrand.replaceChildren(svg);
  heroBrand.dataset.traced = "true";

  const measurePaths = () => {
    heroBrandMaskPaths.forEach((path) => {
      const length = Math.max(1, path.getTotalLength());
      path.dataset.length = String(length);
      path.style.strokeDasharray = `${length} ${length}`;
      path.style.strokeDashoffset = String(length);
    });
    setHeroBrandTrace(0);
  };

  requestAnimationFrame(measurePaths);
}

function setHeroBrandTrace(progress) {
  if (!heroBrandMaskPaths.length) return;

  const p = gsap.utils.clamp(0, 1, progress);
  const count = heroBrandMaskPaths.length;

  // The reveal uses the same simple timing model as the accepted V57 build:
  // one continuous 58→70 window, one character after another, no gaps.
  heroBrandMaskPaths.forEach((path, index) => {
    const length = Number(path.dataset.length || 1);
    const start = index / count;
    const end = (index + 1) / count;
    const local = gsap.utils.clamp(
      0,
      1,
      (p - start) / Math.max(0.0001, end - start)
    );

    // Smooth, deliberately restrained draw speed while remaining fully
    // scroll-scrubbed. The mask is invisible; only the normal filled glyph is
    // ever visible.
    const eased = gsap.parseEase("power2.inOut")(local);
    path.style.strokeDashoffset = String(length * (1 - eased));
  });
}

function setHeroEditorialCopy(frame) {
  if (!heroEditorialCopy.length) return;

  const revealWindow = (value, fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd) => {
    if (value <= fadeInStart || value >= fadeOutEnd) return 0;
    if (value < fadeInEnd) return gsap.utils.mapRange(fadeInStart, fadeInEnd, 0, 1, value);
    if (value > fadeOutStart) return gsap.utils.mapRange(fadeOutStart, fadeOutEnd, 1, 0, value);
    return 1;
  };

  const leftProgress = gsap.parseEase("power2.out")(
    revealWindow(frame, 27, 36, 53, 61)
  );
  const rightProgress = gsap.parseEase("power2.out")(
    revealWindow(frame, 43, 52, 69, 78)
  );

  const states = [leftProgress, rightProgress];
  heroEditorialCopy.forEach((item, index) => {
    const progress = states[index] ?? 0;
    const isLeft = item.classList.contains("hero-editorial-copy__item--left");
    const x = isLeft ? -18 + (18 * progress) : 18 - (18 * progress);
    const y = window.innerWidth <= 700
      ? (isLeft ? -4 + (4 * progress) : 4 - (4 * progress))
      : 0;
    const rotate = window.innerWidth <= 700
      ? (isLeft ? -1.5 + (1.5 * progress) : 1.5 - (1.5 * progress))
      : 0;

    gsap.set(item, {
      autoAlpha: progress,
      x,
      y,
      rotate
    });
  });
}

function setLogoState(frame) {
  const logoProgress = gsap.utils.clamp(
    0,
    1,
    (frame - HERO_BRAND_TRACE_END_FRAME) /
      (FRAME_COUNT - HERO_BRAND_TRACE_END_FRAME)
  );
  const active = frame >= HERO_BRAND_TRACE_START_FRAME;
  const isMobile = window.innerWidth <= 700;
  const navTop = isMobile ? 14 : 22;
  const navHeight = 44;
  const navCenterY = navTop + navHeight / 2;
  const heroFontPx = isMobile
    ? Math.min(window.innerWidth * 0.19, 92)
    : Math.min(window.innerWidth * 0.12, 176);
  const navFontPx = isMobile ? 30 : 42;
  const navScale = navFontPx / heroFontPx;

  setHeroBrandTrace(
    gsap.utils.clamp(
      0,
      1,
      (frame - HERO_BRAND_TRACE_START_FRAME) /
        (HERO_BRAND_TRACE_END_FRAME - HERO_BRAND_TRACE_START_FRAME)
    )
  );

  // The wordmark sits completely still at the bottom-center for the entire
  // handwriting phase. Use the actual wordmark height so its lower edge stays
  // consistently near the bottom on both desktop and mobile.
  const wordmarkHeight = heroFontPx * 0.68;
  const bottomMargin = isMobile ? 42 : 54;
  const revealBottomCenterY =
    window.innerHeight - (wordmarkHeight / 2) - bottomMargin;
  const revealY = logoProgress > 0
    ? gsap.utils.interpolate(revealBottomCenterY, navCenterY, logoProgress)
    : revealBottomCenterY;

  heroBrand.classList.toggle("is-nav-logo", logoProgress >= 1);

  gsap.set(heroBrand, {
    autoAlpha: active ? 1 : 0,
    left: "50%",
    top: active ? `${revealY}px` : "50%",
    xPercent: -50,
    x: isMobile && logoProgress >= 1 ? -5 : 0,
    yPercent: -50,
    scale: active
      ? gsap.utils.interpolate(1, navScale, logoProgress)
      : 1,
    transformOrigin: "50% 50%"
  });
}
function hideNavControls() {
  siteNav.classList.remove("is-visible");
  siteNav.setAttribute("aria-hidden", "true");
}

function showNavControls() {
  siteNav.classList.add("is-visible");
  siteNav.setAttribute("aria-hidden", "false");
}

function setupHero() {
  setupHeroBrandTracing();
  hideNavControls();
  setHeroEditorialCopy(0);
  gsap.set(heroBrand, {
    autoAlpha: 0, left: "50%", top: "50%", xPercent: -50, yPercent: -50,
    scale: 1, transformOrigin: "50% 50%"
  });
  gsap.set(navMenu, { x: -90, opacity: 0 });
  gsap.set(navCall, { x: 90, opacity: 0 });

  gsap.to(state, {
    frame: FRAME_COUNT - 1,
    ease: "none",
    snap: { frame: 1 },
    scrollTrigger: {
      trigger: hero,
      start: "top top",
      end: "bottom bottom",
      scrub: 0.56,
      invalidateOnRefresh: true,
      onEnterBack: hideNavControls,
      onUpdate: (self) => {
        const frame = self.progress * (FRAME_COUNT - 1) + 1;
        renderFrame(state.frame);
        setLogoState(frame);
        setHeroEditorialCopy(frame);

        if (frame >= 79.5) {
          showNavControls();
          gsap.to(navMenu, { x: 0, opacity: 1, duration: 0.42, ease: "power3.out", overwrite: true });
          gsap.to(navCall, { x: 0, opacity: 1, duration: 0.42, ease: "power3.out", overwrite: true });
        } else {
          hideNavControls();
          gsap.set(navMenu, { x: -90, opacity: 0 });
          gsap.set(navCall, { x: 90, opacity: 0 });
        }
      },
      onLeave: () => {
        setHeroBrandTrace(1);
        setLogoState(FRAME_COUNT);
        setHeroEditorialCopy(FRAME_COUNT);
        showNavControls();
        gsap.set(navMenu, { x: 0, opacity: 1 });
        gsap.set(navCall, { x: 0, opacity: 1 });
      },
      onLeaveBack: () => {
        setHeroBrandTrace(0);
        setHeroEditorialCopy(0);
        hideNavControls();
        gsap.set(navMenu, { x: -90, opacity: 0 });
        gsap.set(navCall, { x: 90, opacity: 0 });
        gsap.set(heroBrand, { autoAlpha: 0 });
      }
    },
    onUpdate: () => renderFrame(state.frame)
  });
}

let lenisInstance = null;

function setupLenis() {
  if (!window.Lenis) return;
  lenisInstance = new Lenis({
    autoRaf: false,
    lerp: 0.09,
    smoothWheel: true,
    syncTouch: true,
    wheelMultiplier: 0.95
  });
  lenisInstance.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenisInstance.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

function createArchetypeSection(archetype) {
  const section = document.createElement("section");
  section.className = "archetype";
  section.dataset.archetype = archetype.id;
  section.setAttribute("aria-labelledby", `${archetype.id}-title`);

  const head = document.createElement("div");
  head.className = "archetype__head";
  head.innerHTML = `
    <div>
      <span class="archetype__index">${archetype.index} / ARCHETYPE</span>
      <h2 class="archetype__title" id="${archetype.id}-title">${archetype.label}</h2>
    </div>
    <p class="archetype__note">${archetype.note}</p>
  `;
  section.appendChild(head);

  const row = document.createElement("div");
  row.className = "look-row";
  row.setAttribute("role", "list");

  archetype.looks.forEach((look, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `look-card${index === 0 ? " is-active" : ""}`;
    card.setAttribute("role", "listitem");
    card.setAttribute("aria-expanded", index === 0 ? "true" : "false");
    card.setAttribute("aria-label", `${look.title} — ${look.service || archetype.label}`);
    card.innerHTML = `
      <span class="look-card__image"><img src="./assets/archetypes/${look.image}?v=77" alt="${look.alt}" data-service="${look.service || archetype.label}" loading="lazy" fetchpriority="low" decoding="async"></span>
      <span class="look-card__strip" aria-hidden="true"><span class="look-card__number">0${index + 1}</span></span>
      <span class="look-card__content">
        <span class="look-card__meta">
          <span class="look-card__tag">${look.tag}</span>
          <span class="look-card__title">${look.title}</span>
        </span>
        <span class="look-card__description">${look.description}</span>
      </span>
    `;
    row.appendChild(card);
  });

  section.appendChild(row);
  archetypesRoot.appendChild(section);
  setupLookRow(row);
}

function setupLookRow(row) {
  const cards = [...row.querySelectorAll(".look-card")];
  let lockedIndex = 0;

  const activate = (index) => {
    cards.forEach((card, i) => {
      const active = i === index;
      card.classList.toggle("is-active", active);
      card.setAttribute("aria-expanded", String(active));
    });
  };

  cards.forEach((card, index) => {
    // Tap/click permanently selects the card.
    card.addEventListener("click", () => {
      lockedIndex = index;
      activate(index);
    });

    // Desktop hover is only a preview. The locked choice returns on exit.
    card.addEventListener("mouseenter", () => {
      if (window.matchMedia("(hover: hover)").matches) activate(index);
    });
  });

  row.addEventListener("mouseleave", () => activate(lockedIndex));
  activate(lockedIndex);
}


function updateExperienceMetrics() {
  if (!experience || !experiencePin || !experienceTrack) return;

  const isMobile = window.matchMedia("(max-width: 700px)").matches;
  const isPortraitTablet = window.matchMedia("(min-width: 701px) and (max-width: 1280px) and (orientation: portrait)").matches;
  const viewportWidth = experiencePin.clientWidth || window.innerWidth;
  const panelWidth = isMobile
    ? Math.max(0, viewportWidth - 28)
    : isPortraitTablet
      ? Math.max(320, viewportWidth * 0.80)
      : Math.max(320, viewportWidth * 0.40);
  experience.style.setProperty("--panel-width", `${panelWidth}px`);

  const trackRect = experienceTrack.getBoundingClientRect();
  const pinRect = experiencePin.getBoundingClientRect();
  // Always calculate the full physical width of the track. On mobile the
  // final invisible tail is deliberately part of that width, giving the real
  // sixth card a complete, interactive stop before the section can release.
  const travel = Math.max(0, trackRect.width - pinRect.width);

  const intro = experience.querySelector(".experience__intro");
  const introMarginBottom = intro ? (parseFloat(getComputedStyle(intro).marginBottom) || 0) : 0;
  const introHeight = intro ? intro.offsetTop + intro.offsetHeight + introMarginBottom : 0;
  const viewportHeight = experiencePin.offsetHeight || window.innerHeight;

  // Keep the mobile pin alive after card 06 reaches its exact fully-visible
  // position. Including the intro's bottom margin in the geometry prevents
  // sticky from releasing early and exposing Section 04 underneath.
  const releaseGuard = isMobile ? Math.max(120, Math.min(180, viewportHeight * 0.18)) : 0;
  experience.style.height = `${introHeight + travel + releaseGuard + viewportHeight}px`;
  return { travel, viewportHeight, releaseGuard, introHeight };
}


function setupExperience() {
  if (!experience || !experiencePin || !experienceTrack) return;

  const build = () => {
    ScrollTrigger.getById("experienceScroll")?.kill();

    const metrics = updateExperienceMetrics();
    if (!metrics) return;

    const isMobile = window.matchMedia("(max-width: 700px)").matches;
    const horizontalDistance = metrics.travel;
    const totalDistance = horizontalDistance + metrics.releaseGuard;

    gsap.set(experienceTrack, { x: 0 });
    gsap.set(experienceProgress, { scaleX: 0 });

    ScrollTrigger.create({
      id: "experienceScroll",
      trigger: experience,
      start: () => `top+=${metrics.introHeight} top`,
      end: () => `+=${totalDistance}`,
      scrub: 0.55,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        // On mobile the last slice of the scroll is deliberately held on the
        // completed final card. That makes the release into Section 04 a hard
        // stop instead of letting the next section peek through early.
        const horizontalProgress = isMobile && horizontalDistance > 0
          ? Math.min(1, self.progress * totalDistance / horizontalDistance)
          : self.progress;
        gsap.set(experienceTrack, { x: -horizontalDistance * horizontalProgress });

        const progress = horizontalProgress;
        gsap.set(experienceProgress, { scaleX: progress });

        const activeIndex = Math.min(
          experiencePanels.length - 1,
          Math.floor(progress * experiencePanels.length)
        );
        experiencePanels.forEach((panel, index) => {
          panel.classList.toggle("is-active", index === activeIndex);
        });
        if (experienceCount) {
          experienceCount.textContent = `${String(activeIndex + 1).padStart(2, "0")} / 06`;
        }
      }
    });

    ScrollTrigger.refresh();
  };

  build();
}

async function loadInitialHeroFrame() {
  const first = await requestFrame(0, 0);
  if (first) drawFrame(0);
  warmHeroFrames(0, 1);
}

function prepareTextForFade(element) {
  // Keep section copy as normal text. The previous character-by-character
  // splitting could break wrapping and make individual glyphs stack on narrow
  // layouts. The copy now uses one simple fade-in as a whole.
  if (!element || element.dataset.textAnimateReady === "true") return;
  element.dataset.textAnimateReady = "true";
  element.classList.add("text-animate-target");
}

function setupSectionTextAnimations() {
  // Section titles stay as normal text nodes: no character splitting here.
  // The previous split treatment on the Section 02 title could collapse each
  // glyph into its own line on narrow layouts. Titles now use a simple fade.
  const headingTargets = [...document.querySelectorAll("section h1, section h2")].filter((element) => {
    if (element.closest(".hero")) return false;
    if (element.closest(".experience-panel")) return false;
    return !element.dataset.h2FadeReady;
  });

  const slideTargets = [
    ...document.querySelectorAll('section .section-kicker, section .section-lede, section .archetype__note, section [class$="__lede"], section .private-session__intro > p')
  ].filter((element) => {
    if (element.closest(".hero")) return false;
    if (element.closest(".experience-panel")) return false;
    return !element.dataset.textAnimateReady;
  });

  headingTargets.forEach((element) => {
    element.dataset.h2FadeReady = "true";
    element.classList.add("section-h2-fade");
  });
  slideTargets.forEach(prepareTextForFade);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    headingTargets.forEach((element) => element.classList.add("is-h2-faded"));
    slideTargets.forEach((element) => element.classList.add("is-text-animated"));
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      if (entry.target.classList.contains("section-h2-fade")) {
        entry.target.classList.add("is-h2-faded");
      } else {
        entry.target.classList.add("is-text-animated");
      }
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -7% 0px" });

  [...headingTargets, ...slideTargets].forEach((element) => observer.observe(element));
}

async function init() {
  gsap.set(heroBrand, { autoAlpha: 0 });
  resizeCanvas();

  archetypes.forEach(createArchetypeSection);
  setupSectionTextAnimations();

  await loadInitialHeroFrame();
  resizeCanvas();

  setupLenis();
  setupHero();
  setupExperience();
  setupBookingSystem();
  ScrollTrigger.refresh();

  window.dispatchEvent(new Event("rashcuts:ready"));

  // The service worker is intentionally registered after the first-view work is
  // ready, so install/update traffic never competes with the hero's first paint.
  const registerRashcutsServiceWorker = () => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`./sw.js?v=${SITE_ASSET_VERSION}`, { scope: "./" }).catch(() => {});
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(registerRashcutsServiceWorker, { timeout: 3500 });
  } else {
    window.setTimeout(registerRashcutsServiceWorker, 1200);
  }

}

let resizeTimer;
window.addEventListener("resize", () => {
  resizeCanvas();
  setLogoState(state.frame + 1);
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    updateExperienceMetrics();
    ScrollTrigger.refresh();
  }, 120);
});
window.addEventListener("orientationchange", () => {
  window.setTimeout(() => {
    resizeCanvas();
    ScrollTrigger.refresh();
  }, 120);
});

init();


/* =========================================================
   SECTION 04 — SERVICE DISCOVERY / PRIVATE SESSION / RECEIPT
   ========================================================= */
const bookingState = {
  services: [],
  privateSession: {
    enabled: false,
    service: "",
    tools: "",
    transportation: "",
    state: "",
    lga: "",
    address: "",
    date: "",
    time: "",
    price: 0
  },
  date: "",
  time: ""
};

const bookingTracker = (() => {
  const storageKey = "rashcuts.booking.visitor";
  let cachedKey = "";
  function visitorKey() {
    if (cachedKey) return cachedKey;
    try {
      cachedKey = localStorage.getItem(storageKey) || "";
      if (!cachedKey) {
        cachedKey = (crypto?.randomUUID?.() || `rc-${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(0, 80);
        localStorage.setItem(storageKey, cachedKey);
      }
    } catch (_) {
      cachedKey = `rc-${Date.now()}-${Math.random().toString(16).slice(2)}`.slice(0, 80);
    }
    return cachedKey;
  }

  function payload(stage, channel = "") {
    const privateSession = bookingState.privateSession;
    const services = bookingState.services.map((id) => serviceMap.get(id)).filter(Boolean);
    const summary = services.map((service) => service.name).join(", ") || privateSession.service || "Booking request";
    const date = privateSession.enabled ? privateSession.date : bookingState.date;
    const time = privateSession.enabled ? privateSession.time : bookingState.time;
    const estimated = standardTotal() + (privateSession.enabled ? privateSession.price : 0);
    return {
      stage, channel, visitor_key: visitorKey(), service_summary: summary, service_count: services.length,
      appointment_date: date || "", appointment_time: time || "", private_session: Boolean(privateSession.enabled), estimated_total: estimated
    };
  }

  function send(stage, channel = "") {
    const payloadData = payload(stage, channel);
    const endpoint = `${String(window.RashcutsPublicConfig?.apiBaseUrl || "").replace(/\/$/, "")}/api/booking/attempt`;
    try {
      if (navigator.sendBeacon) {
        const body = new Blob([JSON.stringify(payloadData)], { type: "application/json" });
        navigator.sendBeacon(endpoint, body);
        return;
      }
    } catch (_) {}
    fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payloadData), keepalive: true }).catch(() => {});
  }

  return { send };
})();

const serviceCatalog = {
  cuts: [
    { id: "classic-cut", name: "Classic Cut", price: 12000, description: "A clean, considered cut shaped around your features, routine and preferred finish.", imageName: "service-classic-cut.webp", imageAlt: "Classic haircut service \u2014 clean, considered cut at Rashcuts" },
    { id: "fade", name: "Fade", price: 15000, description: "Clean tapering and fading tailored to your hair, texture and preferred finish.", imageName: "service-fade.webp", imageAlt: "Fade haircut service \u2014 tailored fade finish at Rashcuts" },
    { id: "taper", name: "Low / Mid / High Taper", price: 15000, description: "A controlled taper that keeps the silhouette sharp without losing your natural shape.", imageName: "service-taper.webp", imageAlt: "Low, mid or high taper haircut service at Rashcuts" },
    { id: "skin-fade", name: "Skin Fade", price: 17000, description: "A close, precise fade that moves cleanly from skin into the shape above.", imageName: "service-skin-fade.webp", imageAlt: "Skin fade haircut service \u2014 close, precise fade at Rashcuts" },
    { id: "shape-up", name: "Shape-Up / Line-Up", price: 9000, description: "Crisp edges, cleaned lines and a sharper frame around the style you already wear.", imageName: "service-shape-up.webp", imageAlt: "Shape-up and line-up service \u2014 crisp finished edges at Rashcuts" }
  ],
  texture: [
    { id: "braids", name: "Braids", price: 25000, description: "Structured braid styling with attention to neat sections, tension and the finished silhouette.", imageName: "service-braids.webp", imageAlt: "Braids styling service \u2014 structured braided hairstyle at Rashcuts" },
    { id: "hair-colour", name: "Hair Dye / Colour", price: 30000, description: "Colour work planned around the look you want, with the finish kept intentional and wearable.", imageName: "service-hair-colour.webp", imageAlt: "Hair colour service \u2014 dye and colour work at Rashcuts" },
    { id: "relaxing", name: "Relaxing / Texturizing", price: 22000, description: "Texture adjustment with a considered finish that still feels like you.", imageName: "service-relaxing.webp", imageAlt: "Relaxing and texturizing service \u2014 controlled texture finish at Rashcuts" },
    { id: "locs-twist", name: "Locs / Twist Styling", price: 28000, description: "Defined loc or twist styling with clean sections, balanced shape and a finish built to last.", imageName: "service-locs-twist.webp", imageAlt: "Locs and twist styling service at Rashcuts" },
    { id: "hair-treatment", name: "Hair Treatment", price: 15000, description: "A focused treatment for healthier-feeling hair, scalp care and a cleaner finished texture.", imageName: "service-hair-treatment.webp", imageAlt: "Hair and scalp treatment service at Rashcuts" }
  ],
  grooming: [
    { id: "beard-grooming", name: "Beard Grooming", price: 9000, description: "Shape, clean-up and finish for a beard that looks deliberate without looking overworked.", imageName: "service-beard-grooming.webp", imageAlt: "Beard grooming service \u2014 shape and clean-up at Rashcuts" },
    { id: "beard-shave", name: "Beard Shave", price: 8000, description: "A close, clean shave with careful prep and a refined finish.", imageName: "service-beard-shave.webp", imageAlt: "Beard shave service \u2014 close, clean finish at Rashcuts" },
    { id: "hair-beard", name: "Hair + Beard Combo", price: 21000, description: "A coordinated haircut and beard finish handled as one complete look.", imageName: "service-hair-beard-combo.webp", imageAlt: "Haircut and beard combo service at Rashcuts" },
    { id: "full-grooming", name: "Full Grooming Session", price: 30000, description: "A complete grooming reset combining the details that make the whole look work.", imageName: "service-full-grooming.webp", imageAlt: "Full grooming session \u2014 coordinated haircut and finish at Rashcuts" },
    { id: "hot-towel-facial", name: "Hot Towel Facial", price: 12000, description: "A warm, refreshing facial reset with focused cleansing and a clean, finished feel.", imageName: "service-hot-towel-facial.webp", imageAlt: "Hot towel facial grooming service at Rashcuts" }
  ]
};

const allServices = Object.values(serviceCatalog).flat();
const serviceMap = new Map(allServices.map((service) => [service.id, service]));
const money = (value) => `₦${Number(value || 0).toLocaleString("en-NG")}`;
const getServiceImageSrc = (service) => {
  if (service?.imageUrl) return String(service.imageUrl);
  if (service?.image_url) return String(service.image_url);
  const imageName = service?.imageName || `service-${service?.id || "image"}.webp`;
  return assetUrl(`./assets/services/${imageName}`);
};

const serviceModal = document.querySelector("#serviceModal");
const serviceModalImage = document.querySelector("#serviceModalImage");
const serviceModalIndex = document.querySelector("#serviceModalIndex");
const serviceModalTitle = document.querySelector("#serviceModalTitle");
const serviceModalText = document.querySelector("#serviceModalText");
const serviceModalPrice = document.querySelector("#serviceModalPrice");
const serviceModalSelect = document.querySelector("#serviceModalSelect");
const serviceModalClose = document.querySelector("#serviceModalClose");

let activeServiceId = null;
let receiptFrame = null;

// Warm service artwork before a client asks for a modal. The modal should be
// an interaction, not the moment the browser discovers the image. Images are
// decoded in the background and kept in a tiny in-memory cache so opening a
// tile can use an already-ready resource without delaying the modal motion.
const serviceImageCache = new Map();

function warmServiceImage(service, priority = "low") {
  if (!service) return Promise.resolve(null);
  const imageName = service.imageName || `service-${service.id}.webp`;
  const src = getServiceImageSrc({ ...service, imageName });
  const cached = serviceImageCache.get(src);
  if (cached) return cached.promise;

  const image = new Image();
  image.decoding = "async";
  image.fetchPriority = priority;

  const promise = new Promise((resolve) => {
    image.onload = async () => {
      try {
        if (typeof image.decode === "function") await image.decode();
      } catch (_) {
        // The resource is still usable if decode() is unavailable or rejects.
      }
      resolve(image);
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });

  serviceImageCache.set(src, { image, promise });
  return promise;
}

function setupServiceImageWarmup() {
  const section = document.querySelector("#services");
  if (!section) return;

  const warmAll = () => allServices.forEach((service) => warmServiceImage(service));

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      warmAll();
      obs.disconnect();
    }, { rootMargin: "700px 0px" });
    observer.observe(section);
  } else {
    warmAll();
  }

  // Also warm during idle time when supported. This makes the first modal
  // fast even if the client jumps directly to a service tile.
  const idleWarm = () => allServices.forEach((service) => warmServiceImage(service));
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(idleWarm, { timeout: 2500 });
  } else {
    window.setTimeout(idleWarm, 1800);
  }
}

function renderServiceTiles() {
  const roots = {
    cuts: document.querySelector("#servicesCuts"),
    texture: document.querySelector("#servicesTexture"),
    grooming: document.querySelector("#servicesGrooming")
  };

  Object.entries(serviceCatalog).forEach(([category, services]) => {
    if (!roots[category]) return;
    roots[category].innerHTML = services.map((service, index) => `
      <button class="service-tile" type="button" data-service-id="${service.id}" aria-pressed="false" aria-haspopup="dialog">
        <span class="service-tile__number">0${index + 1}</span>
        <span class="service-tile__name">${service.name}</span>
        <span class="service-tile__price">${money(service.price)}</span>
        <span class="service-tile__check" aria-hidden="true">+</span>
      </button>
    `).join("");
  });

  // Click handling is delegated from the stable section roots. The public
  // site can re-render these tiles after MySQL hydration; direct listeners
  // on the old buttons would then disappear, which caused the first-open
  // service modal bug until a hard refresh.
}

function syncServiceTiles() {
  const selected = new Set(bookingState.services);
  document.querySelectorAll(".service-tile").forEach((tile) => {
    const isSelected = selected.has(tile.dataset.serviceId);
    tile.classList.toggle("is-selected", isSelected);
    tile.setAttribute("aria-pressed", String(isSelected));
    const check = tile.querySelector(".service-tile__check");
    if (check) check.textContent = isSelected ? "✓" : "+";
  });
  const stateLabel = document.querySelector("#bookingState");
  if (stateLabel) stateLabel.textContent = `${String(bookingState.services.length).padStart(2, "0")} SELECTED`;
}

function toggleService(id) {
  const index = bookingState.services.indexOf(id);
  if (index >= 0) {
    bookingState.services.splice(index, 1);
  } else {
    bookingState.services.push(id);
  }
  syncServiceTiles();
  renderReceipt();
  if (activeServiceId === id) updateServiceModalSelection();
}

async function openServiceModal(id) {
  const service = serviceMap.get(id);
  if (!service || !serviceModal) return;
  activeServiceId = id;
  const number = String(allServices.findIndex((item) => item.id === id) + 1).padStart(2, "0");
  const imageSrc = getServiceImageSrc(service);
  const serviceModalMedia = document.querySelector("#serviceModalMedia");
  const imageName = service.imageName || `service-${service.id}.webp`;

  // Never reuse the previous service image while the next one is loading.
  serviceModal.classList.remove("is-ready");
  if (serviceModalImage) {
    serviceModalImage.classList.remove("is-loaded");
    serviceModalImage.removeAttribute("src");
    serviceModalImage.alt = service.imageAlt || `${service.name} service at Rashcuts`;
    serviceModalImage.dataset.service = service.name;
    serviceModalImage.decoding = "async";
    serviceModalImage.fetchPriority = "high";
  }

  // Wait for the actual image resource to be ready before opening the modal.
  // This removes the visible sequence of shell → old image → new image → blur.
  const cached = serviceImageCache.get(imageSrc);
  let readyImage = cached?.image?.complete && cached.image.naturalWidth ? cached.image : null;
  if (!readyImage) readyImage = await warmServiceImage(service, "high");

  if (activeServiceId !== id) return;
  if (serviceModalImage && readyImage) {
    serviceModalImage.src = readyImage.currentSrc || imageSrc;
    serviceModalImage.classList.add("is-loaded");
  } else if (serviceModalImage) {
    serviceModalImage.src = imageSrc;
  }
  if (serviceModalMedia) {
    serviceModalMedia.dataset.service = service.name;
    serviceModalMedia.dataset.imageAlt = service.imageAlt || `${service.name} service at Rashcuts`;
    serviceModalMedia.setAttribute("aria-label", service.imageAlt || `${service.name} service at Rashcuts`);
  }
  const imageNameEl = document.querySelector("#serviceModalImageName");
  if (imageNameEl) imageNameEl.textContent = service.imageUrl || service.image_url ? "Managed image" : imageName;
  serviceModalIndex.textContent = `${number} / SERVICE`;
  serviceModalTitle.textContent = service.name;
  serviceModalText.textContent = service.description;
  serviceModalPrice.textContent = money(service.price);
  updateServiceModalSelection();
  serviceModal.classList.add("is-ready", "is-open");
  serviceModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("booking-modal-open");
  if (lenisInstance) lenisInstance.stop();
  requestAnimationFrame(() => {
    fitServiceModalTitle();
    serviceModalClose?.focus();
  });
}

function closeServiceModal() {
  serviceModal?.classList.remove("is-open");
  serviceModal?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("booking-modal-open");
  if (lenisInstance) lenisInstance.start();
  activeServiceId = null;
}

function fitServiceModalTitle() {
  if (!serviceModalTitle) return;

  const isLargeScreen = window.innerWidth >= 768;
  serviceModalTitle.style.fontSize = isLargeScreen ? "" : "clamp(1.12rem, 5vw, 2rem)";
  serviceModalTitle.style.whiteSpace = isLargeScreen ? "normal" : "nowrap";
  serviceModalTitle.style.overflow = isLargeScreen ? "visible" : "hidden";
  serviceModalTitle.style.textOverflow = isLargeScreen ? "unset" : "clip";

  if (isLargeScreen) {
    let size = parseFloat(getComputedStyle(serviceModalTitle).fontSize) || 48;
    const minSize = 24;
    const step = 0.5;
    let lineHeight = parseFloat(getComputedStyle(serviceModalTitle).lineHeight) || (size * .86);
    let lines = Math.max(1, Math.round(serviceModalTitle.getBoundingClientRect().height / lineHeight));

    while (lines > 2 && size > minSize) {
      size -= step;
      serviceModalTitle.style.setProperty("font-size", `${size}px`, "important");
      const computed = getComputedStyle(serviceModalTitle);
      lineHeight = parseFloat(computed.lineHeight) || (size * .86);
      lines = Math.max(1, Math.round(serviceModalTitle.getBoundingClientRect().height / lineHeight));
    }
    return;
  }

  const available = serviceModalTitle.clientWidth;
  if (!available) return;

  const computed = getComputedStyle(serviceModalTitle);
  let size = parseFloat(computed.fontSize) || 24;
  const minSize = 15;
  const step = 0.5;

  while (serviceModalTitle.scrollWidth > available && size > minSize) {
    size -= step;
    serviceModalTitle.style.fontSize = `${size}px`;
  }
}

function updateServiceModalSelection() {
  if (!serviceModalSelect || !activeServiceId) return;
  const selected = bookingState.services.includes(activeServiceId);
  serviceModalSelect.textContent = selected ? "Remove service" : "Add service";
}

function setupServiceModal() {
  [document.querySelector("#servicesCuts"), document.querySelector("#servicesTexture"), document.querySelector("#servicesGrooming")]
    .filter(Boolean)
    .forEach((root) => {
      if (root.dataset.serviceDelegationReady === "true") return;
      root.dataset.serviceDelegationReady = "true";
      root.addEventListener("click", (event) => {
        const tile = event.target.closest(".service-tile");
        if (!tile || !root.contains(tile)) return;
        const id = tile.dataset.serviceId;
        if (event.target.closest(".service-tile__check")) {
          toggleService(id);
          return;
        }
        openServiceModal(id);
      });
      root.addEventListener("contextmenu", (event) => {
        if (event.target.closest(".service-tile")) event.preventDefault();
      });
    });

  serviceModalSelect?.addEventListener("click", () => {
    if (!activeServiceId) return;
    toggleService(activeServiceId);
    updateServiceModalSelection();
  });
  serviceModalClose?.addEventListener("click", closeServiceModal);
  serviceModal?.addEventListener("click", (event) => {
    if (event.target === serviceModal || event.target.classList.contains("service-modal__backdrop")) closeServiceModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && serviceModal?.classList.contains("is-open")) closeServiceModal();
  });
}

const privateSteps = [
  {
    key: "service",
    title: "WHAT DO YOU WANT?",
    type: "options",
    options: [
      ["Haircut", "A focused cut and finish."],
      ["Beard", "Shape, clean-up or shave."],
      ["Full Grooming", "The complete reset."],
      ["Styling", "A styling-led session."],
      ["Colour", "Colour work on location."],
      ["Combination", "More than one thing."],
      ["Something Else", "Tell us what you have in mind."]
    ]
  },
  {
    key: "tools",
    title: "WHO'S BRINGING THE TOOLS?",
    type: "options",
    options: [
      ["I've got everything.", "Use the tools already at your space."],
      ["I've got some of the tools.", "We'll fill the gaps."],
      ["Bring everything.", "The barber arrives fully equipped."]
    ]
  },
  {
    key: "transportation",
    title: "WHAT ABOUT TRANSPORT?",
    type: "options",
    options: [
      ["I'll handle transportation.", "No transport charge added."],
      ["Include transportation.", "We'll include a transport allowance."]
    ]
  },
  {
    key: "state",
    title: "WHICH STATE ARE WE IN?",
    type: "state"
  },
  {
    key: "lga",
    title: "WHICH LGA?",
    type: "select"
  },
  {
    key: "address",
    title: "WHAT'S THE ADDRESS?",
    type: "input"
  },
  {
    key: "schedule",
    title: "WHEN?",
    type: "schedule"
  }
];

const stateLgas = {
  "Niger": ["Agaie", "Agwara", "Bida", "Borgu", "Bosso", "Chanchaga", "Edati", "Gbako", "Gurara", "Katcha", "Kontagora", "Lapai", "Lavun", "Magama", "Mariga", "Mashegu", "Mokwa", "Munya", "Paikoro", "Rafi", "Rijau", "Shiroro", "Suleja", "Tafa", "Wushishi"],
  "Lagos": ["Agege", "Ajeromi-Ifelodun", "Alimosho", "Amuwo-Odofin", "Apapa", "Badagry", "Epe", "Ibeju-Lekki", "Ifako-Ijaiye", "Ikeja", "Ikorodu", "Kosofe", "Lagos Island", "Lagos Mainland", "Mushin", "Ojo", "Oshodi-Isolo", "Shomolu", "Surulere", "Eti-Osa"],
  "Abuja": ["Abaji", "Bwari", "Gwagwalada", "Kuje", "Kwali", "AMAC"],
  "Kaduna": ["Birnin Gwari", "Chikun", "Giwa", "Igabi", "Ikara", "Jaba", "Jema'a", "Kachia", "Kaduna North", "Kaduna South", "Kagarko", "Kajuru", "Kaura", "Kauru", "Kubau", "Kudan", "Lere", "Makarfi", "Sabon Gari", "Sanga", "Soba", "Zangon Kataf", "Zaria"],
  "Kano": ["Ajingi", "Albasu", "Bagwai", "Bebeji", "Bichi", "Bunkure", "Dala", "Dambatta", "Dawakin Kudu", "Dawakin Tofa", "Doguwa", "Fagge", "Gabasawa", "Garko", "Garun Mallam", "Gaya", "Gezawa", "Gwale", "Gwarzo", "Kabo", "Kano Municipal", "Karaye", "Kibiya", "Kiru", "Kumbotso", "Kunchi", "Kura", "Madobi", "Makoda", "Minjibir", "Nassarawa", "Rano", "Rimin Gado", "Rogo", "Shanono", "Sumaila", "Takai", "Tarauni", "Tofa", "Tsanyawa", "Tudun Wada", "Ungogo", "Warawa", "Wudil"],
  "Rivers": ["Abua-Odual", "Ahoada East", "Ahoada West", "Akuku-Toru", "Andoni", "Asari-Toru", "Bonny", "Degema", "Eleme", "Emohua", "Etche", "Gokana", "Ikwerre", "Khana", "Obio-Akpor", "Ogba-Egbema-Ndoni", "Ogu-Bolo", "Okrika", "Omuma", "Opobo-Nkoro", "Oyigbo", "Port Harcourt", "Tai"]
};

let privateStepIndex = 0;

function privatePrice() {
  const base = {
    "Haircut": 18000,
    "Beard": 15000,
    "Full Grooming": 28000,
    "Styling": 20000,
    "Colour": 30000,
    "Combination": 35000,
    "Something Else": 25000
  }[bookingState.privateSession.service] || 0;
  const tools = {
    "I've got everything.": 0,
    "I've got some of the tools.": 3000,
    "Bring everything.": 6000
  }[bookingState.privateSession.tools] || 0;
  const transport = bookingState.privateSession.transportation === "Include transportation." ? 7000 : 0;
  return base + tools + transport;
}

function renderPrivateStep() {
  if (typeof closeAllLiquidDropdowns === "function") closeAllLiquidDropdowns();
  const root = document.querySelector("#privateStep");
  const step = privateSteps[privateStepIndex];
  if (!root || !step) return;

  const current = bookingState.privateSession[step.key] || "";
  const indexLabel = `${String(privateStepIndex + 1).padStart(2, "0")} / ${String(privateSteps.length).padStart(2, "0")}`;

  let body = "";
  if (step.type === "options") {
    body = `<div class="private-step__options">${step.options.map(([value, note]) => `
      <button class="private-option${current === value ? " is-selected" : ""}" type="button" data-private-value="${escapeHtml(value)}">
        <strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small>
      </button>
    `).join("")}</div>`;
  } else if (step.type === "state") {
    const states = Object.keys(stateLgas);
    body = `
      <div class="private-field">
        <label for="privateStateInput">STATE</label>
        <select id="privateStateInput">
          <option value="">Choose a state</option>
          ${states.map((value) => `<option value="${escapeHtml(value)}" ${current === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}
        </select>
        <p class="private-location-note">For now, choose from the studio's supported locations.</p>
      </div>
    `;
  } else if (step.type === "select") {
    const options = stateLgas[bookingState.privateSession.state] || [];
    body = `
      <div class="private-field">
        <label for="privateLgaInput">LGA</label>
        <select id="privateLgaInput" ${options.length ? "" : "disabled"}>
          <option value="">${options.length ? "Choose LGA" : "Choose a state first"}</option>
          ${options.map((value) => `<option value="${escapeHtml(value)}" ${current === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}
        </select>
      </div>
    `;
  } else if (step.type === "input") {
    body = `
      <div class="private-field">
        <label for="privateAddressInput">ADDRESS</label>
        <input id="privateAddressInput" type="text" autocomplete="street-address" placeholder="House, street, landmark..." value="${escapeHtml(current)}">
      </div>
    `;
  } else if (step.type === "schedule") {
    const selectedDate = current ? current.split("|")[0] : "";
    const selectedTime = current ? current.split("|")[1] || "" : "";
    body = `
      <div class="private-schedule-grid">
        <div class="private-field date-picker" data-picker="private-date">
          <label>PREFERRED DATE</label>
          <button class="picker-trigger" id="privateDateTrigger" type="button" aria-haspopup="dialog" aria-expanded="false"><strong id="privateDateLabel">${selectedDate ? formatDate(selectedDate) : "Choose a date"}</strong><span class="picker-chevron">⌄</span></button>
          <input id="privateDateInput" type="hidden" value="${escapeHtml(selectedDate)}">
          <div class="picker-popover" id="privateDatePopover" hidden></div>
        </div>
        <div class="private-field time-picker" data-picker="private-time">
          <label>PREFERRED TIME</label>
          <button class="picker-trigger" id="privateTimeTrigger" type="button" aria-haspopup="listbox" aria-expanded="false"><strong id="privateTimeLabel">${selectedTime || "Choose a time"}</strong><span class="picker-chevron">⌄</span></button>
          <input id="privateTimeInput" type="hidden" value="${escapeHtml(selectedTime)}">
          <div class="time-menu" id="privateTimeMenu" role="listbox" data-lenis-prevent hidden>${["9:00 AM","10:00 AM","11:00 AM","12:00 PM","1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM","6:00 PM","7:00 PM"].map((value) => `<button type="button" data-time="${value}" role="option">${value}</button>`).join("")}</div>
        </div>
      </div>
    `;
  }

  root.classList.remove("is-entering");
  root.innerHTML = `
    <div class="private-step__inner">
      <span class="private-step__index">${indexLabel}</span>
      <h3>${step.title}</h3>
      ${body}
    </div>
  `;

  document.querySelector("#privateProgress").textContent = indexLabel;
  document.querySelector("#privateBackHint").textContent = privateStepIndex ? "EDITABLE" : "PRIVATE SESSION";
  renderPrivateStepJump();
  const back = document.querySelector("#privateBack");
  const next = document.querySelector("#privateNext");
  if (back) back.disabled = privateStepIndex === 0;
  if (next) {
    const label = next.querySelector(".press-label");
    if (label) {
      label.innerHTML = (privateStepIndex === privateSteps.length - 1 ? "Review" : "Next");
    } else {
      next.textContent = privateStepIndex === privateSteps.length - 1 ? "Review" : "Next";
    }
  }

  root.querySelectorAll("[data-private-value]").forEach((button) => {
    button.addEventListener("click", () => {
      bookingState.privateSession[step.key] = button.dataset.privateValue;
      root.querySelectorAll(".private-option").forEach((item) => item.classList.remove("is-selected"));
      button.classList.add("is-selected");
      if (step.key === "service" || step.key === "tools" || step.key === "transportation") {
        bookingState.privateSession.price = privatePrice();
        renderReceipt();
      }
    });
  });

  setupPrivateFields(step);
  requestAnimationFrame(() => {
    root.classList.add("is-entering");
  });
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[char]));
}

function setupPrivateFields(step) {
  const stateInput = document.querySelector("#privateStateInput");
  if (stateInput) {
    stateInput.addEventListener("change", () => {
      bookingState.privateSession.state = stateInput.value;
      bookingState.privateSession.lga = "";
      renderReceipt();
      renderPrivateStepJump();
      if (privateStepIndex === 3) return;
    });
  }

  const lga = document.querySelector("#privateLgaInput");
  if (lga) {
    lga.addEventListener("change", () => {
      bookingState.privateSession.lga = lga.value;
      renderReceipt();
    });
  }

  const address = document.querySelector("#privateAddressInput");
  if (address) {
    address.addEventListener("input", () => {
      bookingState.privateSession.address = address.value;
      renderReceipt();
    });
  }

  if (step.type === "schedule") {
    setupDatePicker({
      trigger: "#privateDateTrigger",
      label: "#privateDateLabel",
      input: "#privateDateInput",
      popover: "#privateDatePopover",
      onSelect: syncPrivateSchedule
    });
    setupTimePicker({
      trigger: "#privateTimeTrigger",
      label: "#privateTimeLabel",
      input: "#privateTimeInput",
      menu: "#privateTimeMenu",
      onSelect: syncPrivateSchedule
    });
  }
}

function syncPrivateSchedule() {
  const dateValue = document.querySelector("#privateDateInput")?.value || "";
  const timeValue = document.querySelector("#privateTimeInput")?.value || "";
  bookingState.privateSession.date = dateValue;
  bookingState.privateSession.time = timeValue;
  bookingState.privateSession.schedule = `${dateValue}|${timeValue}`;
  renderReceipt();
}

function monthLabel(date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}


function setupDatePicker({ trigger, label, input, popover, onSelect }) {
  const triggerEl = document.querySelector(trigger);
  const labelEl = document.querySelector(label);
  const inputEl = document.querySelector(input);
  const popoverEl = document.querySelector(popover);
  if (!triggerEl || !labelEl || !inputEl || !popoverEl) return;

  popoverEl.classList.add("picker-liquid");
  popoverEl.addEventListener("pointermove", (event) => {
    const rect = popoverEl.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100;
    const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100;
    popoverEl.style.setProperty("--picker-x", `${x}%`);
    popoverEl.style.setProperty("--picker-y", `${y}%`);
  }, { passive: true });

  let viewDate = inputEl.value ? new Date(`${inputEl.value}T12:00:00`) : new Date();
  const minDate = new Date(); minDate.setHours(0, 0, 0, 0);

  const render = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const first = new Date(year, month, 1);
    const start = (first.getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const selected = inputEl.value;
    const cells = [];
    for (let i = 0; i < start; i++) cells.push(`<span class="calendar-day is-empty"></span>`);
    for (let day = 1; day <= days; day++) {
      const date = new Date(year, month, day);
      const value = isoDate(date);
      const disabled = date < minDate;
      cells.push(`<button type="button" class="calendar-day${value === selected ? " is-selected" : ""}" data-date="${value}" ${disabled ? "disabled" : ""}>${day}</button>`);
    }
    popoverEl.innerHTML = `
      <div class="calendar-head"><button type="button" data-month="prev" aria-label="Previous month">‹</button><strong>${monthLabel(viewDate)}</strong><button type="button" data-month="next" aria-label="Next month">›</button></div>
      <div class="calendar-week">${["M","T","W","T","F","S","S"].map(d => `<span>${d}</span>`).join("")}</div>
      <div class="calendar-grid">${cells.join("")}</div>`;
  };

  const open = () => {
    document.querySelectorAll(".picker-popover:not([hidden]), .time-menu:not([hidden])").forEach(el => { if (el !== popoverEl) el.hidden = true; });
    popoverEl.hidden = false;
    triggerEl.setAttribute("aria-expanded", "true");
    render();
  };
  const close = () => { popoverEl.hidden = true; triggerEl.setAttribute("aria-expanded", "false"); };
  triggerEl.addEventListener("click", () => popoverEl.hidden ? open() : close());
  popoverEl.addEventListener("click", (event) => {
    const month = event.target.closest("[data-month]");
    if (month) {
      viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + (month.dataset.month === "next" ? 1 : -1), 1);
      render(); return;
    }
    const day = event.target.closest("[data-date]");
    if (!day || day.disabled) return;
    inputEl.value = day.dataset.date;
    labelEl.textContent = formatDate(day.dataset.date);
    close();
    onSelect?.(day.dataset.date);
  });
  document.addEventListener("click", (event) => {
    if (!popoverEl.hidden && !popoverEl.contains(event.target) && !triggerEl.contains(event.target)) close();
  });
}

function setupTimePicker({ trigger, label, input, menu, onSelect }) {
  const triggerEl = document.querySelector(trigger);
  const labelEl = document.querySelector(label);
  const inputEl = document.querySelector(input);
  const menuEl = document.querySelector(menu);
  if (!triggerEl || !labelEl || !inputEl || !menuEl) return;

  menuEl.classList.add("picker-liquid");
  menuEl.addEventListener("pointermove", (event) => {
    const rect = menuEl.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100;
    const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100;
    menuEl.style.setProperty("--picker-x", `${x}%`);
    menuEl.style.setProperty("--picker-y", `${y}%`);
  }, { passive: true });

  triggerEl.addEventListener("click", () => {
    document.querySelectorAll(".picker-popover:not([hidden]), .time-menu:not([hidden])").forEach(el => { if (el !== menuEl) el.hidden = true; });
    menuEl.hidden = !menuEl.hidden;
    triggerEl.setAttribute("aria-expanded", String(!menuEl.hidden));
  });
  menuEl.addEventListener("wheel", (event) => {
    if (menuEl.scrollHeight <= menuEl.clientHeight) return;
    event.preventDefault();
    event.stopPropagation();
    menuEl.scrollTop += event.deltaY;
  }, { passive: false });
  menuEl.addEventListener("touchmove", (event) => {
    event.stopPropagation();
  }, { passive: true });
  menuEl.setAttribute("data-lenis-prevent", "");

  menuEl.addEventListener("click", (event) => {
    const option = event.target.closest("[data-time]");
    if (!option) return;
    inputEl.value = option.dataset.time;
    labelEl.textContent = option.dataset.time;
    menuEl.querySelectorAll("[data-time]").forEach(item => item.classList.toggle("is-selected", item === option));
    menuEl.hidden = true;
    triggerEl.setAttribute("aria-expanded", "false");
    onSelect?.(option.dataset.time);
  });
  document.addEventListener("click", (event) => {
    if (!menuEl.hidden && !menuEl.contains(event.target) && !triggerEl.contains(event.target)) {
      menuEl.hidden = true;
      triggerEl.setAttribute("aria-expanded", "false");
    }
  });
}

function renderPrivateStepJump() {
  const root = document.querySelector("#privateStepJump");
  if (!root) return;
  root.innerHTML = privateSteps.map((step, index) => `<button type="button" class="private-step-dot${index === privateStepIndex ? " is-current" : ""}${index < privateStepIndex ? " is-complete" : ""}" data-step-index="${index}" aria-label="Go to step ${index + 1}">${String(index + 1).padStart(2,"0")}</button>`).join("");
  root.querySelectorAll("[data-step-index]").forEach(button => {
    button.addEventListener("click", () => {
      if (bookingState.privateSession.enabled) {
        bookingState.privateSession.enabled = false;
        document.querySelector("#privateSummary").hidden = true;
        document.querySelector("#privateStepper").hidden = false;
      }
      privateStepIndex = Number(button.dataset.stepIndex);
      renderPrivateStep();
    });
  });
}

function validatePrivateStep() {
  const step = privateSteps[privateStepIndex];
  const value = bookingState.privateSession[step.key] || "";
  if (step.key === "state") return Boolean(bookingState.privateSession.state);
  if (step.key === "lga") return Boolean(bookingState.privateSession.lga);
  if (step.key === "address") return Boolean(bookingState.privateSession.address.trim());
  if (step.key === "schedule") return Boolean(bookingState.privateSession.date && bookingState.privateSession.time);
  return Boolean(value);
}

function privateSummaryHtml() {
  const p = bookingState.privateSession;
  return `
    <div class="private-summary__head">
      <div>
        <span class="section-kicker">PRIVATE SESSION / SUMMARY</span>
        <h3>Your setup, sorted.</h3>
      </div>
      <strong class="private-summary__price">EST. ${money(p.price)}</strong>
    </div>
    <div class="private-summary__grid">
      ${[
        ["SERVICE", p.service],
        ["TOOLS", p.tools],
        ["TRANSPORTATION", p.transportation],
        ["STATE", p.state],
        ["LGA", p.lga],
        ["ADDRESS", p.address],
        ["DATE", formatDate(p.date)],
        ["TIME", p.time]
      ].map(([label, value]) => `<div class="private-summary__item"><span>${label}</span><strong>${escapeHtml(value || "—")}</strong></div>`).join("")}
    </div>
    <div class="private-summary__actions">
      <button class="ui-button ui-button--ghost private-summary__edit" id="privateEdit" type="button">I want to change some things</button>
      <button class="ui-button private-summary__continue" id="privateContinue" type="button">Continue to booking</button>
    </div>
  `;
}

function showPrivateSummary() {
  const summary = document.querySelector("#privateSummary");
  const stepper = document.querySelector("#privateStepper");
  if (!summary || !stepper) return;
  bookingState.privateSession.price = privatePrice();
  summary.innerHTML = privateSummaryHtml();
  summary.hidden = false;
  stepper.hidden = true;
  bookingState.privateSession.enabled = true;
  renderReceipt();
  document.querySelector("#privateContinue")?.addEventListener("click", scrollToReceipt);
  document.querySelector("#privateEdit")?.addEventListener("click", () => {
    bookingState.privateSession.enabled = false;
    summary.hidden = true;
    stepper.hidden = false;
    privateStepIndex = privateSteps.length - 1;
    renderPrivateStep();
  });
}

function nextPrivateStep() {
  if (!validatePrivateStep()) {
    const root = document.querySelector("#privateStep");
    root?.animate?.([{ transform: "translateX(0)" }, { transform: "translateX(-5px)" }, { transform: "translateX(5px)" }, { transform: "translateX(0)" }], { duration: 260 });
    return;
  }
  if (privateStepIndex < privateSteps.length - 1) {
    privateStepIndex += 1;
    renderPrivateStep();
  } else {
    showPrivateSummary();
  }
}

function previousPrivateStep() {
  if (privateStepIndex === 0) return;
  privateStepIndex -= 1;
  renderPrivateStep();
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
}

function standardTotal() {
  return bookingState.services.reduce((total, id) => total + (serviceMap.get(id)?.price || 0), 0);
}

function renderReceipt() {
  const body = document.querySelector("#receiptBody");
  const total = document.querySelector("#receiptTotal");
  const note = document.querySelector("#receiptNote");
  const totalLabel = document.querySelector("#receiptTotalLabel");
  if (!body || !total || !note) return;

  const selectedServices = bookingState.services.map((id) => serviceMap.get(id)).filter(Boolean);
  const lines = [];

  if (selectedServices.length) {
    lines.push(`<div class="receipt-section-label">SERVICES</div>`);
    selectedServices.forEach((service) => {
      lines.push(`<div class="receipt-line"><span>${escapeHtml(service.name)}</span><strong>${money(service.price)}</strong></div>`);
    });
  }

  const p = bookingState.privateSession;
  if (p.enabled) {
    lines.push(`<div class="receipt-section-label">PRIVATE SESSION</div>`);
    lines.push(`<div class="receipt-line"><span>${escapeHtml(p.service)}</span><strong>${money(p.price)}</strong></div>`);
    lines.push(`<div class="receipt-line"><span>Tools</span><strong>${escapeHtml(shortPrivateValue(p.tools))}</strong></div>`);
    lines.push(`<div class="receipt-line"><span>Transport</span><strong>${escapeHtml(shortPrivateValue(p.transportation))}</strong></div>`);
    lines.push(`<div class="receipt-line"><span>State</span><strong>${escapeHtml(p.state || "—")}</strong></div>`);
    lines.push(`<div class="receipt-line"><span>LGA</span><strong>${escapeHtml(p.lga || "—")}</strong></div>`);
    lines.push(`<div class="receipt-line"><span>Address</span><strong>${escapeHtml(p.address || "—")}</strong></div>`);
    lines.push(`<div class="receipt-line"><span>Date</span><strong>${escapeHtml(formatDate(p.date))}</strong></div>`);
    lines.push(`<div class="receipt-line"><span>Time</span><strong>${escapeHtml(p.time || "—")}</strong></div>`);
  } else if (bookingState.date || bookingState.time) {
    lines.push(`<div class="receipt-section-label">APPOINTMENT</div>`);
    lines.push(`<div class="receipt-line"><span>Date</span><strong>${escapeHtml(formatDate(bookingState.date))}</strong></div>`);
    lines.push(`<div class="receipt-line"><span>Time</span><strong>${escapeHtml(bookingState.time || "—")}</strong></div>`);
  }

  body.innerHTML = lines.length ? lines.join("") : `<div class="receipt-empty">Nothing picked yet.<br>Start above and watch this receipt build.</div>`;
  const combined = standardTotal() + (p.enabled ? p.price : 0);
  total.textContent = money(combined);
  totalLabel.textContent = p.enabled ? "ESTIMATED TOTAL" : "TOTAL";
  note.textContent = selectedServices.length || p.enabled
    ? "Review the details, then choose how you want to make it happen."
    : "Select a service above to start building your visit.";

  updateContactActions();
}

function showBookingServiceToast(message = "Pick a service first — then we can take it to WhatsApp.") {
  let toast = document.querySelector("#rashcutsBookingToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "rashcutsBookingToast";
    toast.className = "rashcuts-booking-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.innerHTML = '<span class="rashcuts-booking-toast__dot" aria-hidden="true"></span><span class="rashcuts-booking-toast__message"></span>';
    document.body.appendChild(toast);
  }

  const messageNode = toast.querySelector(".rashcuts-booking-toast__message");
  if (messageNode) messageNode.textContent = message;
  window.clearTimeout(showBookingServiceToast._timer);
  toast.classList.add("is-visible");
  showBookingServiceToast._timer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 3200);
}

function getBookingContactMessage() {
  const p = bookingState.privateSession;
  const services = bookingState.services.map((id) => serviceMap.get(id)).filter(Boolean);
  const standard = services.map((service) => `${service.name} — ${money(service.price)}`).join("\n");
  const privateLines = p.enabled ? [
    `Private session: ${p.service}`,
    `Tools: ${p.tools}`,
    `Transportation: ${p.transportation}`,
    `State: ${p.state}`,
    `LGA: ${p.lga}`,
    `Address: ${p.address}`,
    `Date: ${formatDate(p.date)}`,
    `Time: ${p.time}`,
    `Estimated private session: ${money(p.price)}`
  ].join("\n") : "";
  const total = standardTotal() + (p.enabled ? p.price : 0);
  const date = p.enabled ? p.date : bookingState.date;
  const time = p.enabled ? p.time : bookingState.time;
  return [
    "Hi Rashcuts, I'd like to book.",
    "",
    standard ? `Services:\n${standard}` : "",
    privateLines,
    !p.enabled && (date || time) ? `Preferred date: ${formatDate(date)}\nPreferred time: ${time || "—"}` : "",
    "",
    `Total${p.enabled ? " / estimated" : ""}: ${money(total)}`
  ].filter(Boolean).join("\n");
}

function studioPhoneForContact() {
  return String(studioLocationConfig?.phone || "").trim();
}

function normalizePhoneForLink(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const compact = raw.replace(/[()\s-]/g, "");
  if (compact.startsWith("+")) return `+${compact.slice(1).replace(/\D/g, "")}`;
  if (compact.startsWith("234")) return `+${compact.replace(/\D/g, "")}`;
  if (compact.startsWith("0")) return `+234${compact.slice(1).replace(/\D/g, "")}`;
  return compact.replace(/\D/g, "");
}

function updateContactActions() {
  const message = getBookingContactMessage();
  const studioPhone = normalizePhoneForLink(studioPhoneForContact());
  const whatsappHref = studioPhone ? `https://wa.me/${studioPhone.replace(/^\+/, "")}?text=${encodeURIComponent(message)}` : "#";
  const callHref = studioPhone ? `tel:${studioPhone}` : "#";
  const whatsapp = document.querySelector("#bookingWhatsappContinue");
  const footerWhatsapp = document.querySelector("#footerWhatsappAction");
  const navCall = document.querySelector(".nav-call, #navCall");
  if (whatsapp) {
    whatsapp.href = whatsappHref;
    whatsapp.classList.toggle("is-disabled", !studioPhone);
  }
  if (footerWhatsapp) {
    const footerMessage = "Hi Rashcuts, I'd like to book.";
    footerWhatsapp.href = studioPhone ? `https://wa.me/${studioPhone.replace(/^\+/, "")}?text=${encodeURIComponent(footerMessage)}` : "#";
    footerWhatsapp.classList.toggle("is-disabled", !studioPhone);
  }
  if (navCall) {
    navCall.href = callHref;
    navCall.classList.toggle("is-disabled", !studioPhone);
  }
  return { studioPhone, message, whatsappHref, callHref };
}

function closeBookingIntentModal() {
  const modal = document.querySelector("#bookingIntentModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.documentElement.classList.remove("booking-modal-open");
}

function openBookingIntentModal() {
  if (!bookingState.services.length && !bookingState.privateSession.enabled) {
    showBookingServiceToast();
    return;
  }
  const modal = document.querySelector("#bookingIntentModal");
  if (!modal) return;
  const summary = document.querySelector("#bookingIntentSummary");
  const services = bookingState.services.map((id) => serviceMap.get(id)).filter(Boolean);
  const p = bookingState.privateSession;
  if (summary) {
    const lines = [
      services.length ? services.map((service) => `${service.name} · ${money(service.price)}`).join("\n") : "Private session",
      p.enabled ? `${formatDate(p.date)} · ${p.time || "No time selected"}` : `${formatDate(bookingState.date)} · ${bookingState.time || "No time selected"}`
    ];
    summary.textContent = lines.join("\n");
  }
  const { studioPhone } = updateContactActions();
  const whatsapp = document.querySelector("#bookingWhatsappContinue");
  if (whatsapp) whatsapp.textContent = studioPhone ? "Continue on WhatsApp ↗" : "WhatsApp number not set";
  bookingTracker.send("started");
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.documentElement.classList.add("booking-modal-open");
  window.requestAnimationFrame(() => whatsapp?.focus?.());
}

function ensureBookingIntentModal() {
  const modal = document.querySelector("#bookingIntentModal");
  if (!modal || modal.dataset.ready === "true") return;
  modal.dataset.ready = "true";
  modal.querySelectorAll("[data-booking-modal-close]").forEach((el) => el.addEventListener("click", closeBookingIntentModal));
  document.querySelector("#bookingStay")?.addEventListener("click", closeBookingIntentModal);
  document.querySelector("#bookingWhatsappContinue")?.addEventListener("click", (event) => {
    if (!normalizePhoneForLink(studioPhoneForContact())) {
      event.preventDefault();
      showBookingServiceToast("Rashcuts has not set a WhatsApp number yet.");
      return;
    }
    bookingTracker.send("contact", "whatsapp");
    closeBookingIntentModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) closeBookingIntentModal();
  });
}

function setupBookingWhatsappGuard() {
  ensureBookingIntentModal();
  const trigger = document.querySelector("#bookingPrimaryAction");
  if (trigger && trigger.dataset.bookingHandoffReady !== "true") {
    trigger.dataset.bookingHandoffReady = "true";
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      openBookingIntentModal();
    });
  }
}

function shortPrivateValue(value) {
  if (!value) return "—";
  if (value.startsWith("I've got")) return value.replace("I've got ", "");
  if (value.startsWith("Bring")) return "Bring everything";
  if (value.startsWith("I'll handle")) return "Client";
  if (value.startsWith("Include")) return "Included";
  return value;
}

function setupBookingDetails() {
  setupDatePicker({
    trigger: "#bookingDateTrigger",
    label: "#bookingDateLabel",
    input: "#bookingDate",
    popover: "#bookingDatePopover",
    onSelect: () => { bookingState.date = document.querySelector("#bookingDate")?.value || ""; renderReceipt(); }
  });
  setupTimePicker({
    trigger: "#bookingTimeTrigger",
    label: "#bookingTimeLabel",
    input: "#bookingTime",
    menu: "#bookingTimeMenu",
    onSelect: () => { bookingState.time = document.querySelector("#bookingTime")?.value || ""; renderReceipt(); }
  });
  document.querySelector("#studioContinue")?.addEventListener("click", () => {
    if (!bookingState.date || !bookingState.time) {
      document.querySelector("#bookingDetails")?.animate?.([{transform:"translateX(0)"},{transform:"translateX(-5px)"},{transform:"translateX(5px)"},{transform:"translateX(0)"}], {duration:260});
      return;
    }
    scrollToReceipt();
  });
}

function scrollToReceipt() {
  const stage = document.querySelector("#receiptStage");
  if (!stage) return;
  stage.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => updateReceiptScroll(), 450);
}


function updateReceiptScroll() {
  const stage = document.querySelector("#receiptStage");
  const sticky = stage?.querySelector(".receipt-stage__sticky");
  const intro = stage?.querySelector(".receipt-intro");
  const receipt = document.querySelector("#bookingReceipt");
  const windowEl = document.querySelector(".receipt-window");
  const printer = document.querySelector(".receipt-printer");
  const label = document.querySelector("#receiptProgressLabel");
  if (!stage || !sticky || !receipt || !windowEl || !printer) return;

  if (intro) {
    const headerHeight = Math.ceil(intro.getBoundingClientRect().height);
    stage.style.setProperty("--receipt-header-height", `${headerHeight}px`);
  }

  const stageTop = stage.getBoundingClientRect().top + window.scrollY;
  const stickyHeight = Math.max(1, sticky.offsetHeight || window.innerHeight);
  const scrollRange = Math.max(1, stage.offsetHeight - stickyHeight);
  const lockTop = parseFloat(getComputedStyle(stage).getPropertyValue("--receipt-lock-top")) || 64;
  const startScroll = stageTop - lockTop;
  const raw = Math.min(1, Math.max(0, (window.scrollY - startScroll) / scrollRange));

  const receiptHeight = Math.max(receipt.offsetHeight || 0, receipt.scrollHeight || 0, 700);
  windowEl.style.setProperty("--receipt-height", `${receiptHeight}px`);
  stage.style.setProperty("--receipt-visible-height", `${receipt.getBoundingClientRect().height}px`);

  /* A literal feed: at 0% the bottom edge is just hidden behind the slot;
     as progress increases, the sheet translates downward and exposes more of
     the receipt from the opening. There is intentionally no second transform,
     post-shift, or window movement while printing. */
  const feedPx = receiptHeight * raw;
  receipt.style.setProperty("--receipt-y", `${-receiptHeight + feedPx}px`);

  const printed = raw >= 0.995;
  stage.classList.toggle("is-printed", printed);

  if (label) {
    label.textContent = `${String(Math.round(raw * 100)).padStart(2, "0")}%`;
  }
}

function setupReceiptScroll() {
  const stage = document.querySelector("#receiptStage");
  if (!stage) return;
  let ticking = false;
  const requestReceiptUpdate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      updateReceiptScroll();
    });
  };
  window.addEventListener("scroll", requestReceiptUpdate, { passive: true });
  window.addEventListener("resize", () => {
    setupReceiptScroll._stageStart = null;
    requestReceiptUpdate();
  });
  if (lenisInstance) lenisInstance.on("scroll", requestReceiptUpdate);
  requestReceiptUpdate();
}

function setupPrivateSession() {
  renderPrivateStep();
  renderPrivateStepJump();
  document.querySelector("#privateNext")?.addEventListener("click", nextPrivateStep);
  document.querySelector("#privateBack")?.addEventListener("click", previousPrivateStep);
}

function setupBookingSystem() {
  renderServiceTiles();
  syncServiceTiles();
  setupServiceImageWarmup();
  setupServiceModal();
  setupBookingWhatsappGuard();
window.addEventListener("resize", () => {
  if (serviceModal?.classList.contains("is-open")) fitServiceModalTitle();
});
  setupPrivateSession();
  setupBookingDetails();
  renderReceipt();
  setupReceiptScroll();
  hydratePublicSiteData();
}

/* =========================================================
   V33 — SECTION 05 / EDITORIAL ROTATING GLOBE + LOCATION MODAL
   The globe is a real orthographic projection, not a decorative circle.
   Admin-ready location data feeds the marker, modal and directions URL.
   ========================================================= */
const defaultStudioLocation = {
  name: "Rashcuts",
  address: "Hill-Top GRA",
  area: "Hill-Top GRA",
  lga: "Chanchaga",
  city: "Minna",
  state: "Niger State",
  country: "Nigeria",
  latitude: 9.6100,
  longitude: 6.5500,
  placeId: "",
  directionsUrl: "",
  hours: "09:00 — 20:00",
  phone: "",
  // Temporary QA wallpaper: the existing barber image requested for testing.
  wallpaperUrl: "./assets/experience/baber.webp"
};

const locationStorageKey = "rashcuts:studio-location:v82";
let studioLocationConfig = { ...defaultStudioLocation };

try {
  const storedLocation = JSON.parse(localStorage.getItem(locationStorageKey) || "null");
  if (storedLocation && typeof storedLocation === "object") {
    studioLocationConfig = { ...studioLocationConfig, ...storedLocation };
  }
} catch (error) {
  console.warn("Rashcuts location settings could not be restored.", error);
}

function getStudioDirectionsUrl(location) {
  if (location.directionsUrl) return location.directionsUrl;
  const query = [location.address, location.area, location.lga, location.city, location.state, location.country]
    .filter(Boolean)
    .join(", ");
  const placeId = location.placeId || location.place_id || "";
  const placeParam = placeId ? `&destination_place_id=${encodeURIComponent(placeId)}` : "";
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}${placeParam}`;
}

function updateStudioLocationUI(location) {
  const title = document.querySelector("#locationModalTitle");
  const address = document.querySelector("#locationModalAddress");
  const meta = document.querySelector("#locationModalMeta");
  const directions = document.querySelector("#locationDirections");
  const pin = document.querySelector("#studioLocationPin");
  const pinLabel = document.querySelector("#studioLocationPinLabel");
  const coordinateLabel = document.querySelector("#studioLocationCoordinates");
  const footerLocationMeta = document.querySelector("#footerLocationMeta");
  const wallpaper = document.querySelector("#locationModalWallpaper");
  const hoursValue = document.querySelector("#locationModalHours .location-modal__hours-value");

  const cityLine = [location.city, location.state].filter(Boolean).join(", ");
  const addressLines = [location.address, location.area, location.lga, cityLine, location.country].filter(Boolean);

  if (title) title.textContent = location.address || location.area || location.city || "Studio";
  if (address) address.innerHTML = addressLines.slice(1).map(escapeHtml).join("<br>");
  if (meta) meta.textContent = [location.address, location.area, location.lga, location.city].filter(Boolean).join(" · ").toUpperCase();
  if (hoursValue) hoursValue.textContent = location.hours || "09:00 — 20:00";
  if (directions) {
    directions.href = getStudioDirectionsUrl(location);
    directions.setAttribute("aria-label", `Get directions to ${location.name || "Rashcuts"} in ${location.city || "Minna"}`);
  }
  if (pin) pin.setAttribute("aria-label", `Open ${location.name || "Rashcuts"} studio location in ${location.city || "Minna"}`);
  if (pinLabel) pinLabel.textContent = `${location.name || "RASHCUTS"} / ${(location.city || "MINNA").toUpperCase()}`;
  if (footerLocationMeta) footerLocationMeta.textContent = `${location.city || "Minna"} / ${location.state || "Niger State"} / Studio & Private Sessions`;
  if (coordinateLabel) {
    const lat = Number(location.latitude);
    const lng = Number(location.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng)) {
      const latText = `${Math.abs(lat).toFixed(2).replace(".00", "")}°${lat >= 0 ? "N" : "S"}`;
      const lngText = `${Math.abs(lng).toFixed(2).replace(".00", "")}°${lng >= 0 ? "E" : "W"}`;
      coordinateLabel.innerHTML = `${latText}&nbsp;&nbsp;${lngText}`;
    }
  }

  if (wallpaper) {
    wallpaper.style.backgroundImage = location.wallpaperUrl
      ? `url("${String(location.wallpaperUrl).replace(/"/g, '\\"')}")`
      : "none";
  }

  const schema = document.querySelector('script[type="application/ld+json"]');
  if (schema) {
    try {
      const data = JSON.parse(schema.textContent || "{}");
      data.name = location.name || data.name;
      data.address = {
        "@type": "PostalAddress",
        streetAddress: location.address || undefined,
        addressLocality: location.area || location.city || undefined,
        addressRegion: location.state || undefined,
        addressCountry: location.country || "NG"
      };
      data.areaServed = [location.address, location.area, location.lga, location.city, location.state, location.country].filter(Boolean);
      schema.textContent = JSON.stringify(data);
    } catch (error) {
      console.warn("Rashcuts location schema could not be updated.", error);
    }
  }
}

function setStudioLocation(nextLocation = {}) {
  studioLocationConfig = { ...studioLocationConfig, ...nextLocation };
  try {
    localStorage.setItem(locationStorageKey, JSON.stringify(studioLocationConfig));
  } catch (error) {
    console.warn("Rashcuts location settings could not be saved.", error);
  }
  updateStudioLocationUI(studioLocationConfig);
  window.RashcutsGlobe?.refresh?.();
  return studioLocationConfig;
}

window.RashcutsAdmin = window.RashcutsAdmin || {};
window.RashcutsAdmin.getStudioLocation = () => ({ ...studioLocationConfig });
window.RashcutsAdmin.setStudioLocation = setStudioLocation;

const publicSiteDataCacheKey = `rashcuts:public-data:v${SITE_ASSET_VERSION}`;
let publicSiteHydrationStarted = false;

function getPublicBackendConfig() {
  return window.RashcutsPublicConfig || {};
}

async function fetchPublicSiteData() {
  const config = getPublicBackendConfig();
  const endpoint = `${String(config.apiBaseUrl || "").replace(/\/$/, "")}${config.publicEndpoint || "/api/public/site-data"}`;
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Public data request failed (${response.status}).`);
  const payload = await response.json();
  return payload && typeof payload === "object" ? payload : {};
}

function applyPublicSiteData(payload) {
  if (!payload || typeof payload !== "object") return;

  if (Array.isArray(payload.services) && payload.services.length) {
    payload.services.forEach((row) => {
      const service = serviceMap.get(row.id);
      if (!service) return;
      if (row.name != null) service.name = row.name;
      if (row.price != null) service.price = Number(row.price) || 0;
      if (row.description != null) service.description = row.description;
      if (row.image_alt != null) service.imageAlt = row.image_alt;
      if (row.image_url != null) service.imageUrl = row.image_url;
    });
    renderServiceTiles();
    syncServiceTiles();
  }

  if (payload.location) {
    setStudioLocation({
      ...payload.location,
      placeId: payload.location.place_id ?? payload.location.placeId ?? studioLocationConfig.placeId,
      directionsUrl: payload.location.directions_url ?? payload.location.directionsUrl ?? studioLocationConfig.directionsUrl,
      wallpaperUrl: payload.location.wallpaper_url ?? payload.location.wallpaperUrl ?? studioLocationConfig.wallpaperUrl,
      phone: payload.location.phone ?? studioLocationConfig.phone ?? "",
      latitude: Number(payload.location.latitude ?? studioLocationConfig.latitude),
      longitude: Number(payload.location.longitude ?? studioLocationConfig.longitude)
    });
    updateContactActions();
    setupClosingContacts();
  }

  if (Array.isArray(payload.work)) {
    const dbRows = payload.work
      .filter((row) => row && (row.image_url || row.image))
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    const hiddenBuiltinImages = new Set(
      dbRows.filter((row) => row.active === false || row.active === 0).map((row) => row.image || row.image_name || "")
    );
    const dbByImage = new Map(dbRows.map((row) => [row.image || row.image_name || "", row]));
    const builtin = DEFAULT_WORK_GALLERY
      .filter((item) => !hiddenBuiltinImages.has(item.image))
      .map((item) => {
        const row = dbByImage.get(item.image);
        return row ? { ...item, id: row.id, imageUrl: row.image_url || "", alt: row.alt || item.alt, service: row.service || item.service, category: row.category || item.category } : item;
      });
    const custom = dbRows
      .filter((row) => row.active !== false && row.active !== 0 && !DEFAULT_WORK_GALLERY.some((item) => item.image === (row.image || row.image_name || "")))
      .map((row) => ({ id: row.id, image: row.image || row.image_name || "", imageUrl: row.image_url || row.imageUrl || "", alt: row.alt || "Rashcuts finished work", service: row.service || "Rashcuts", category: row.category || "Finished work" }));
    workGalleryItems = [...builtin, ...custom]
      .filter((row) => row && (row.imageUrl || row.image))
      .filter((row) => {
        const src = row.imageUrl || assetUrl(`./assets/our-work/${row.image}`);
        return Boolean(src);
      });
    window.RashcutsOurWork?.refresh?.(workGalleryItems);
  }
}

function readCachedPublicSiteData() {
  try {
    const cached = JSON.parse(localStorage.getItem(publicSiteDataCacheKey) || "null");
    const maxAge = Number(getPublicBackendConfig().publicCacheMs || 300000);
    if (cached?.savedAt && Date.now() - cached.savedAt <= maxAge && cached.data) return cached.data;
  } catch (_) {}
  return null;
}

async function hydratePublicSiteData() {
  if (publicSiteHydrationStarted) return;
  publicSiteHydrationStarted = true;

  const cached = readCachedPublicSiteData();
  if (cached) applyPublicSiteData(cached);

  try {
    const data = await fetchPublicSiteData();
    applyPublicSiteData(data);
    try { localStorage.setItem(publicSiteDataCacheKey, JSON.stringify({ savedAt: Date.now(), data })); } catch (_) {}
  } catch (error) {
    console.warn("Rashcuts public data could not be refreshed; local defaults remain active.", error);
  }
}

function getStudioCoordinates(location = studioLocationConfig) {
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  return [Number.isFinite(lng) ? lng : 6.55, Number.isFinite(lat) ? lat : 9.61];
}

function setupStudioLocationGlobe() {
  const root = document.querySelector("#studioGlobe");
  const canvas = document.querySelector("#studioGlobeCanvas");
  const pin = document.querySelector("#studioLocationPin");
  if (!root || !canvas || !window.d3) return;

  const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!context) return;

  const d3 = window.d3;
  const projection = d3.geoOrthographic().clipAngle(90);
  const path = d3.geoPath(projection, context);
  const graticule = d3.geoGraticule10();
  const locationPoint = getStudioCoordinates();
  const rotation = [-locationPoint[0], -locationPoint[1], 0];
  let landFeatures = null;
  let width = 0;
  let height = 0;
  let radius = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let dragging = false;
  let dragStart = null;
  let rotationStart = null;
  let raf = 0;
  let lastTime = performance.now();
  let autoRotate = true;

  function resize() {
    const rect = root.getBoundingClientRect();
    width = Math.max(240, Math.round(rect.width));
    height = Math.max(240, Math.round(rect.height));
    radius = Math.min(width, height) * 0.405;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    projection.scale(radius).translate([width / 2, height / 2]).rotate(rotation);
    render();
  }

  function drawAtmosphere() {
    const gradient = context.createRadialGradient(
      width * .42, height * .34, radius * .08,
      width * .5, height * .5, radius * 1.18
    );
    gradient.addColorStop(0, "rgba(255,255,255,.24)");
    gradient.addColorStop(.52, "rgba(255,255,255,.075)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.beginPath();
    context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
    context.fillStyle = gradient;
    context.fill();

    context.beginPath();
    context.arc(width / 2, height / 2, radius + 1, 0, Math.PI * 2);
    context.strokeStyle = "rgba(9,8,10,.13)";
    context.lineWidth = 1;
    context.stroke();
  }

  function render() {
    context.clearRect(0, 0, width, height);
    projection.rotate(rotation);

    // Quiet atmospheric sphere so the geography appears to sit inside the
    // existing Section 04 surface instead of introducing a new colour block.
    drawAtmosphere();

    context.beginPath();
    path(graticule);
    context.strokeStyle = "rgba(9,8,10,.075)";
    context.lineWidth = .65;
    context.stroke();

    if (landFeatures?.features) {
      context.beginPath();
      landFeatures.features.forEach((feature) => path(feature));
      context.fillStyle = "rgba(9,8,10,.105)";
      context.fill();
      context.strokeStyle = "rgba(9,8,10,.075)";
      context.lineWidth = .65;
      context.stroke();
    }

    // A restrained atmospheric rim keeps the sphere readable without turning
    // it into a hard-edged icon.
    context.beginPath();
    context.arc(width / 2, height / 2, radius + 5, 0, Math.PI * 2);
    context.strokeStyle = "rgba(255,255,255,.23)";
    context.lineWidth = 1.2;
    context.stroke();

    positionPin();
  }

  function positionPin() {
    if (!pin || !width || !height) return;
    const projected = projection(getStudioCoordinates());
    const center = projection.invert([width / 2, height / 2]);
    const currentPoint = getStudioCoordinates();
    const visible = projected && center && d3.geoDistance(currentPoint, center) < (Math.PI / 2 - .02);

    if (!projected || !visible) {
      pin.style.opacity = "0";
      pin.style.pointerEvents = "none";
      return;
    }

    pin.style.opacity = "1";
    pin.style.pointerEvents = "auto";
    pin.style.left = `${projected[0]}px`;
    pin.style.top = `${projected[1]}px`;
  }

  function tick(now) {
    const elapsed = Math.min(40, now - lastTime);
    lastTime = now;
    if (autoRotate && !dragging) {
      rotation[0] += elapsed * .0032;
      render();
    }
    raf = requestAnimationFrame(tick);
  }

  function onPointerDown(event) {
    dragging = true;
    autoRotate = false;
    dragStart = [event.clientX, event.clientY];
    rotationStart = [...rotation];
    canvas.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (!dragging || !dragStart || !rotationStart) return;
    const dx = event.clientX - dragStart[0];
    const dy = event.clientY - dragStart[1];
    rotation[0] = rotationStart[0] + dx * .22;
    rotation[1] = Math.max(-80, Math.min(80, rotationStart[1] - dy * .18));
    render();
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    dragStart = null;
    rotationStart = null;
    window.setTimeout(() => { autoRotate = true; }, 300);
  }

  async function loadLand() {
    try {
      const response = await fetch("https://raw.githubusercontent.com/martynafford/natural-earth-geojson/refs/heads/master/110m/physical/ne_110m_land.json", { cache: "force-cache" });
      if (!response.ok) throw new Error("World map data failed to load");
      landFeatures = await response.json();
      render();
    } catch (error) {
      // The sphere remains visible even if the optional geography payload is
      // unavailable. Do not block the rest of the site on map data.
      console.warn("Rashcuts globe geography could not be loaded.", error);
    }
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerUp);

  resize();
  loadLand();
  raf = requestAnimationFrame(tick);

  window.RashcutsGlobe = {
    refresh() {
      updateStudioLocationUI(studioLocationConfig);
      const [lng, lat] = getStudioCoordinates();
      rotation[0] = -lng;
      rotation[1] = -lat;
      render();
    }
  };

  window.addEventListener("beforeunload", () => {
    cancelAnimationFrame(raf);
    resizeObserver.disconnect();
  }, { once: true });
}

function setupStudioLocationModal() {
  const modal = document.querySelector("#locationModal");
  const pin = document.querySelector("#studioLocationPin");
  const backdrop = document.querySelector("[data-location-close]");
  const closeButton = document.querySelector("#locationModalClose");
  if (!modal || !pin) return;

  let previousActiveElement = null;
  let lockedScrollY = 0;

  const lockPageScroll = () => {
    lockedScrollY = window.scrollY || window.pageYOffset || 0;
    document.documentElement.classList.add("location-modal-open");
    document.body.classList.add("location-modal-open");
    document.body.style.position = "fixed";
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  };

  const unlockPageScroll = () => {
    document.documentElement.classList.remove("location-modal-open");
    document.body.classList.remove("location-modal-open");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo(0, lockedScrollY);
  };

  const open = () => {
    previousActiveElement = document.activeElement;
    updateStudioLocationUI(studioLocationConfig);
    lockPageScroll();
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    window.setTimeout(() => document.querySelector("#locationDirections")?.focus(), 50);
  };

  const dismiss = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    unlockPageScroll();
    if (previousActiveElement && typeof previousActiveElement.focus === "function") previousActiveElement.focus();
  };

  const preventBackgroundTouchScroll = (event) => {
    if (modal.classList.contains("is-open") && !event.target.closest(".location-modal__shell")) {
      event.preventDefault();
    }
  };

  pin.addEventListener("click", open);
  closeButton?.addEventListener("click", dismiss);
  backdrop?.addEventListener("click", dismiss);
  modal.addEventListener("touchmove", preventBackgroundTouchScroll, { passive: false });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) dismiss();
  });

  updateStudioLocationUI(studioLocationConfig);
}

function setupStudioLocation() {
  setupStudioLocationGlobe();
  setupStudioLocationModal();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupStudioLocation, { once: true });
} else {
  setupStudioLocation();
}


/* =========================================================
   SECTION 06 / OUR WORK — moving editorial masonry
   ========================================================= */
const DEFAULT_WORK_GALLERY = [
  { image: "blonde-taper.webp", alt: "Blonde taper haircut — finished look at Rashcuts", service: "Blonde Taper", category: "Finished work" },
  { image: "starter-locs.webp", alt: "Starter locs styling — defined finish at Rashcuts", service: "Starter Locs", category: "Texture" },
  { image: "two-strand-twists.webp", alt: "Two-strand twists — clean sectioned styling at Rashcuts", service: "Two-Strand Twists", category: "Texture" },
  { image: "360-waves.webp", alt: "360 waves — polished wave pattern at Rashcuts", service: "360 Waves", category: "Finished work" },
  { image: "waves.webp", alt: "Waves hairstyle — polished wave pattern at Rashcuts", service: "Waves", category: "Finished work" },
  { image: "service-locs-twist.webp", alt: "Locs and twist styling — clean finished look at Rashcuts", service: "Locs / Twist Styling", category: "Texture" },
  { image: "buzz-cut-line-up.webp", alt: "Buzz cut with line-up — crisp finished shape at Rashcuts", service: "Buzz Cut + Line-Up", category: "Finished work" },
  { image: "drop-fade.webp", alt: "Drop fade — clean finished fade at Rashcuts", service: "Drop Fade", category: "Fades" },
  { image: "high-taper-fade.webp", alt: "High taper fade — textured finished haircut at Rashcuts", service: "High Taper Fade", category: "Fades" },
  { image: "mid-taper-fade.webp", alt: "Mid taper fade — clean finished haircut at Rashcuts", service: "Mid Taper Fade", category: "Fades" },
  { image: "taper-beard.webp", alt: "Taper and beard grooming — finished service at Rashcuts", service: "Taper + Beard", category: "Grooming" },
  { image: "22-plus-black-mens-cuts.webp", alt: "Men's haircut inspiration — modern finished look at Rashcuts", service: "Men's Cuts", category: "Inspiration" },
  { image: "modern-textured-fade.webp", alt: "Modern textured fade — finished haircut at Rashcuts", service: "Textured Fade", category: "Fades" },
  { image: "modern-classic-haircut.webp", alt: "Modern classic haircut — clean scissor finish at Rashcuts", service: "Classic Cut", category: "Finished work" },
  { image: "luxury-full-grooming.webp", alt: "Full grooming haircut and beard finish at Rashcuts", service: "Full Grooming", category: "Grooming" },
  { image: "black-men-beard-grooming.webp", alt: "Beard grooming — clean shaped finish at Rashcuts", service: "Beard Grooming", category: "Grooming" }
];
let workGalleryItems = [...DEFAULT_WORK_GALLERY];

function setupOurWork() {
  const root = document.querySelector("#ourWork");
  const columnsRoot = document.querySelector("#ourWorkColumns");
  const viewport = document.querySelector("#ourWorkViewport");
  const focus = document.querySelector("#ourWorkFocus");
  const focusImage = document.querySelector("#ourWorkFocusImage");
  const focusCaption = document.querySelector("#ourWorkFocusCaption");
  const focusClose = document.querySelector("#ourWorkFocusClose");
  if (!root || !columnsRoot || !viewport) return;

  let galleryItems = [...workGalleryItems];
  const columns = window.matchMedia?.("(min-width: 768px) and (orientation: portrait) and (max-width: 1280px)")?.matches
    ? 4
    : window.matchMedia?.("(min-width: 768px)")?.matches ? 5 : 2;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  let tracks = [];
  let state = [];
  let running = !reduceMotion;
  let visible = false;
  let focusedItem = null;
  let raf = 0;
  let last = performance.now();
  let dragActive = false;
  let dragStartY = 0;
  let dragLastY = 0;
  let dragMoved = false;

  function workImageSrc(item) {
    if (item.imageUrl) return item.imageUrl;
    return assetUrl(`./assets/our-work/${item.image}`);
  }

  function buildGalleryDom() {
    const columnItems = Array.from({ length: columns }, () => []);
    galleryItems.forEach((item, index) => columnItems[index % columns].push({ item, index }));
    columnsRoot.innerHTML = "";
    columnItems.forEach((items, columnIndex) => {
      if (!items.length) return;
      const column = document.createElement("div");
      column.className = "our-work__column";
      const track = document.createElement("div");
      track.className = "our-work__track";
      track.dataset.column = String(columnIndex);
      [...items, ...items].forEach(({ item, index }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "our-work__item";
        button.dataset.index = String(index);
        button.dataset.image = item.image || "";
        button.dataset.alt = item.alt;
        button.dataset.category = item.category;
        button.dataset.service = item.service;
        button.setAttribute("aria-label", `Focus ${item.service}: ${item.alt}`);
        const img = document.createElement("img");
        img.src = workImageSrc(item);
        img.alt = item.alt;
        img.loading = "eager";
        img.decoding = "async";
        img.fetchPriority = index < columns ? "high" : "auto";
        button.appendChild(img);
        track.appendChild(button);
      });
      column.appendChild(track);
      columnsRoot.appendChild(column);
    });
    tracks = [...columnsRoot.querySelectorAll(".our-work__track")];
    state = tracks.map((track, index) => ({
      track,
      y: index === 1 ? -28 : index === 2 ? -10 : index === 3 ? -44 : index === 4 ? -18 : 0,
      speed: [0.018, 0.014, 0.021, 0.016, 0.019][index] || 0.018,
      loop: 0
    }));
  }

  function loopHeight(track) {
    const children = track.children;
    const half = Math.floor(children.length / 2);
    if (children[half] && children[0]) return Math.max(1, children[half].offsetTop - children[0].offsetTop);
    return Math.max(1, track.scrollHeight / 2);
  }
  function wrap(item) {
    const h = loopHeight(item.track);
    if (item.y <= -h) item.y += h;
    if (item.y > 0) item.y -= h;
  }
  function render() { state.forEach(item => { wrap(item); item.track.style.transform = `translate3d(0, ${item.y}px, 0)`; }); }
  function animate(now) {
    const elapsed = Math.min(40, now - last);
    last = now;
    if (running && visible && !focusedItem && !dragActive) { state.forEach(item => { item.y -= item.speed * elapsed; }); render(); }
    raf = requestAnimationFrame(animate);
  }
  function stopMotion() { running = false; }
  function resumeMotion() { if (!reduceMotion) running = true; }
  function focusItem(button) {
    const item = galleryItems[Number(button.dataset.index) % galleryItems.length];
    if (!item) return;
    focusedItem = button;
    stopMotion();
    root.classList.add("has-focus");
    button.classList.add("is-focused");
    if (focusImage) { focusImage.src = button.querySelector("img")?.currentSrc || workImageSrc(item); focusImage.alt = item.alt; focusImage.dataset.service = item.service; }
    if (focusCaption) focusCaption.textContent = `${item.category} · ${item.alt}`;
    if (focus) { focus.classList.add("is-open"); focus.setAttribute("aria-hidden", "false"); }
  }
  function closeFocus() {
    if (!focusedItem) return;
    focusedItem.classList.remove("is-focused");
    focusedItem = null;
    root.classList.remove("has-focus");
    if (focus) { focus.classList.remove("is-open"); focus.setAttribute("aria-hidden", "true"); }
    if (focusImage) focusImage.src = "";
    resumeMotion();
  }
  function refresh(nextItems) {
    const normalized = Array.isArray(nextItems) ? nextItems.filter((item) => item && (item.image || item.imageUrl)) : [];
    if (!normalized.length) return;
    closeFocus();
    galleryItems = normalized;
    buildGalleryDom();
    render();
  }

  columnsRoot.addEventListener("click", event => { const button = event.target.closest(".our-work__item"); if (!button || dragMoved) return; focusItem(button); });
  focusClose?.addEventListener("click", closeFocus);
  focus?.addEventListener("click", event => { if (event.target === focus) closeFocus(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && focusedItem) closeFocus(); });
  viewport.addEventListener("pointerdown", event => { if (focusedItem) return; dragActive = true; dragMoved = false; dragStartY = dragLastY = event.clientY; stopMotion(); viewport.setPointerCapture?.(event.pointerId); });
  viewport.addEventListener("pointermove", event => { if (!dragActive) return; const delta = event.clientY - dragLastY; if (Math.abs(event.clientY - dragStartY) > 5) dragMoved = true; if (dragMoved) event.preventDefault(); dragLastY = event.clientY; state.forEach(item => { item.y += delta; }); render(); });
  function endDrag(event) { if (!dragActive) return; dragActive = false; viewport.releasePointerCapture?.(event.pointerId); if (!focusedItem) window.setTimeout(resumeMotion, 260); window.setTimeout(() => { dragMoved = false; }, 0); }
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);
  const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; if (visible) last = performance.now(); }, { threshold: 0.08 });
  observer.observe(root);

  if (window.gsap && !reduceMotion) gsap.fromTo(root.querySelector(".our-work__intro"), { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, ease: "power3.out", scrollTrigger: { trigger: root, start: "top 78%", once: true } });

  window.RashcutsOurWork = { refresh };
  window.addEventListener("resize", render);
  buildGalleryDom();
  render();
  raf = requestAnimationFrame(animate);
  window.addEventListener("beforeunload", () => { cancelAnimationFrame(raf); observer.disconnect(); }, { once: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupOurWork, { once: true });
} else {
  setupOurWork();
}


/* =========================================================
   SECTION 07 / TESTIMONIALS — living message stream
   ========================================================= */
function setupTestimonials() {
  const root = document.querySelector("#testimonials");
  const viewport = document.querySelector("#testimonialsViewport");
  const cardsRoot = document.querySelector("#testimonialsCards");
  if (!root || !viewport || !cardsRoot) return;

  const testimonials = [
    { name: "Tobi", time: "12s", message: "Bro actually listened to what I wanted. The shape is clean.", type: "reaction", value: "🔥", image: "rashcuts-studio.webp" },
    { name: "Maya", time: "2d", message: "The consultation was the best part. We figured out what actually suited me.", type: "google", value: 5, image: "blonde-taper.webp" },
    { name: "Daniel", time: "1d", message: "Came in looking rough. Left looking like I had somewhere important to be.", type: "reaction", value: "😂", image: "starter-locs.webp" },
    { name: "Kemi", time: "3h", message: "That finish is ridiculous. Still checking myself in every mirror.", type: "reaction", value: "✨", image: "two-strand-twists.webp" },
    { name: "Femi", time: "4d", message: "Super calm studio, proper attention to detail. Easily one of my best cuts.", type: "google", value: 5, image: "360-waves.webp" },
    { name: "Nadia", time: "45s", message: "You guys understood the reference immediately. No weird guessing.", type: "reaction", value: "❤️", image: "buzz-cut-line-up.webp" },
    { name: "Jay", time: "1mo", message: "The haircut grew out really well too. That's how you know the cut was done right.", type: "google", value: 5, image: "drop-fade.webp" },
    { name: "Seyi", time: "2w", message: "Quiet room. Good music. Great barber. I didn't want to leave.", type: "reaction", value: "💈", image: "high-taper-fade.webp" },
    { name: "Amaka", time: "6mo", message: "First visit and somehow it already feels like my regular spot.", type: "google", value: 5, image: "mid-taper-fade.webp" },
    { name: "Kunle", time: "3d", message: "The little details are what got me. Lines, texture, everything.", type: "reaction", value: "🔥", image: "taper-beard.webp" },
    { name: "Zara", time: "1yr", message: "Asked for something simple and left with something that actually felt like me.", type: "google", value: 5, image: "22-plus-black-mens-cuts.webp" },
    { name: "Mikky", time: "5d", message: "Honestly? Best part was not having to explain myself ten times.", type: "reaction", value: "😂", image: "modern-textured-fade.webp" },
    { name: "Deji", time: "2mo", message: "Clean cut, clean space, zero rush. Exactly how an appointment should feel.", type: "google", value: 5, image: "modern-classic-haircut.webp" },
    { name: "Reni", time: "1mo", message: "I sent a reference. They made it work for my face instead of copying it.", type: "reaction", value: "✨", image: "luxury-full-grooming.webp" }
  ];


  let active = 0;
  let locked = false;
  let pointerStartY = 0;
  let pointerDelta = 0;
  let pointerActive = false;
  let pointerMode = null;
  let wheelAccumulator = 0;
  let wheelReset = 0;
  let autoTimer = 0;
  let resumeTimer = 0;
  let interacting = false;

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const mod = (n, m) => ((n % m) + m) % m;

  function buildCards() {
    cardsRoot.innerHTML = "";
    testimonials.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "testimonial-card";
      card.tabIndex = 0;
      card.dataset.index = String(index);
      card.setAttribute("aria-label", `${item.name}: ${item.message}`);

      const avatar = document.createElement("img");
      avatar.className = "testimonial-card__avatar";
      avatar.src = assetUrl(`./assets/our-work/${item.image}`);
      avatar.alt = "";
      avatar.loading = index < 7 ? "eager" : "lazy";
      avatar.decoding = "async";

      const body = document.createElement("div");
      body.className = "testimonial-card__body";

      const meta = document.createElement("div");
      meta.className = "testimonial-card__meta";
      meta.innerHTML = `<span>${item.name}</span><span class="testimonial-card__dot">·</span><span class="testimonial-card__time">${item.time}</span>`;

      const message = document.createElement("p");
      message.className = "testimonial-card__message";
      message.textContent = item.message;
      body.append(meta, message);

      const reaction = document.createElement("span");
      reaction.className = `testimonial-card__reaction${item.type === "google" ? " is-rating" : ""}`;
      reaction.textContent = item.type === "google" ? `${item.value} ★` : item.value;
      reaction.setAttribute("aria-label", item.type === "google" ? `${item.value} star review` : `Reaction ${item.value}`);

      card.append(avatar, body, reaction);
      cardsRoot.appendChild(card);
    });
  }

  function render(animate = true) {
    const cards = [...cardsRoot.children];
    const viewportHeight = window.innerHeight || 800;
    const isLandscapeTablet = window.innerWidth >= 701 && window.innerWidth <= 1280 && window.matchMedia?.("(orientation: landscape)")?.matches;
    const spacing = isLandscapeTablet
      ? 82
      : window.innerWidth <= 600
        ? 62
        : window.innerWidth <= 900
          ? (viewportHeight <= 720 ? 68 : viewportHeight <= 820 ? 76 : 88)
          : (viewportHeight <= 720 ? 72 : viewportHeight <= 820 ? 82 : 94);
    cards.forEach((card, index) => {
      let delta = mod(index - active, testimonials.length);
      if (delta > testimonials.length / 2) delta -= testimonials.length;

      const distance = Math.max(-3, Math.min(3, delta));
      const scale = distance === 0 ? 1 : distance === 1 || distance === -1 ? .91 : distance === 2 || distance === -2 ? .82 : .75;
      const opacity = distance === 0 ? 1 : distance === 1 || distance === -1 ? .78 : distance === 2 || distance === -2 ? .56 : .38;
      const blur = Math.abs(distance) === 0 ? 0 : Math.abs(distance);
      const y = distance * spacing;
      const visible = Math.abs(delta) <= 3;

      card.classList.toggle("is-active", distance === 0);
      card.setAttribute("aria-current", distance === 0 ? "true" : "false");
      card.style.zIndex = String(10 - Math.abs(distance));
      card.style.pointerEvents = visible ? "auto" : "none";
      card.style.transform = `translate(-50%, calc(-50% + ${y}px)) scale(${scale})`;
      card.style.opacity = String(visible ? opacity : 0);
      card.style.filter = `blur(${blur}px)`;
      card.style.transition = (!animate || reduceMotion) ? "none" : "";
    });
  }

  function clearAuto() {
    window.clearTimeout(autoTimer);
    window.clearTimeout(resumeTimer);
  }

  function scheduleAuto(delay = 1800) {
    window.clearTimeout(autoTimer);
    if (reduceMotion || document.hidden || !root.classList.contains("is-visible") || interacting) return;
    autoTimer = window.setTimeout(() => {
      if (!interacting && root.classList.contains("is-visible") && !document.hidden) move(1, true);
      scheduleAuto(1800);
    }, delay);
  }

  function pauseForInteraction() {
    interacting = true;
    clearAuto();
  }

  function resumeAfterInteraction(delay = 2800) {
    interacting = false;
    window.clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(() => scheduleAuto(), delay);
  }

  function move(direction, fromAuto = false) {
    if (locked) return;
    locked = true;
    active = mod(active + direction, testimonials.length);
    render(true);
    window.setTimeout(() => { locked = false; }, reduceMotion ? 80 : 570);
    if (!fromAuto) resumeAfterInteraction();
  }

  function focusIndex(index) {
    if (locked) return;
    let delta = mod(index, testimonials.length) - active;
    if (delta > testimonials.length / 2) delta -= testimonials.length;
    if (delta < -testimonials.length / 2) delta += testimonials.length;
    if (!delta) return;
    move(delta);
  }

  cardsRoot.addEventListener("click", event => {
    const card = event.target.closest(".testimonial-card");
    if (!card) return;
    focusIndex(Number(card.dataset.index));
  });

  viewport.addEventListener("keydown", event => {
    if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
    else if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
    else if (event.key === "Home") { event.preventDefault(); focusIndex(0); }
  });

  viewport.addEventListener("mouseenter", pauseForInteraction);
  viewport.addEventListener("mouseleave", () => resumeAfterInteraction(900));
  viewport.addEventListener("focusin", pauseForInteraction);
  viewport.addEventListener("focusout", event => {
    if (!viewport.contains(event.relatedTarget)) resumeAfterInteraction(900);
  });

  // Wheel navigation remains available to mouse/trackpad users. Touch users
  // must always be able to hand vertical gestures back to the document.
  viewport.addEventListener("wheel", event => {
    event.preventDefault();
    event.stopPropagation();
    if (Math.abs(event.deltaY) < 2) return;
    pauseForInteraction();
    wheelAccumulator += event.deltaY;
    window.clearTimeout(wheelReset);
    wheelReset = window.setTimeout(() => { wheelAccumulator = 0; }, 180);
    if (Math.abs(wheelAccumulator) >= 35) {
      const direction = wheelAccumulator > 0 ? 1 : -1;
      wheelAccumulator = 0;
      move(direction);
    }
  }, { passive: false });

  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches;
  if (!coarsePointer) {
    viewport.addEventListener("pointerdown", event => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pauseForInteraction();
      pointerActive = true;
      pointerMode = null;
      pointerStartY = event.clientY;
      pointerDelta = 0;
      viewport.setPointerCapture?.(event.pointerId);
    });

    viewport.addEventListener("pointermove", event => {
      if (!pointerActive) return;
      pointerDelta = event.clientY - pointerStartY;
      const distance = Math.abs(pointerDelta);
      if (!pointerMode && distance >= 28) {
        pointerMode = distance >= 120 ? "page" : "carousel";
      }
      if (pointerMode === "page") {
        pointerActive = false;
        viewport.releasePointerCapture?.(event.pointerId);
        resumeAfterInteraction(900);
        return;
      }
      if (pointerMode === "carousel") event.preventDefault();
    });

    function finishPointer(event) {
      if (!pointerActive) return;
      pointerActive = false;
      viewport.releasePointerCapture?.(event.pointerId);
      if (pointerMode === "carousel" && Math.abs(pointerDelta) >= 38) move(pointerDelta < 0 ? 1 : -1);
      else resumeAfterInteraction(1200);
      pointerDelta = 0;
      pointerMode = null;
    }

    viewport.addEventListener("pointerup", finishPointer);
    viewport.addEventListener("pointercancel", finishPointer);
  }

  const observer = new IntersectionObserver(entries => {
    const visible = entries[0]?.isIntersecting ?? false;
    root.classList.toggle("is-visible", visible);
    if (visible) scheduleAuto(1800);
    else clearAuto();
  }, { threshold: .08 });
  observer.observe(root);

  buildCards();
  render(false);
  scheduleAuto(1800);

  window.addEventListener("resize", () => render(false));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearAuto();
    else scheduleAuto(1800);
  });
  window.addEventListener("beforeunload", () => {
    clearAuto();
    observer.disconnect();
  }, { once: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupTestimonials, { once: true });
} else {
  setupTestimonials();
}


/* =========================================================
   FINAL CLOSING SEQUENCE — SECTION 08 / FAQ
   ========================================================= */
function setupFinalClosingSequence() {
  setupClosingFaq();
  setupClosingSocials();
  setupClosingContacts();
}



function setupClosingFaq() {
  const list = document.querySelector("[data-faq-list]");
  if (!list) return;
  document.documentElement.classList.add("faq-enhanced");

  const items = [...list.querySelectorAll(".faq-item")];
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduceMotion) {
    items.forEach((item) => item.classList.add("is-faq-revealed"));
  } else if ("IntersectionObserver" in window) {
    items.forEach((item, index) => {
      item.style.setProperty("--faq-reveal-delay", `${Math.min(index * 24, 144)}ms`);
    });
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-faq-revealed");
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
    items.forEach((item) => observer.observe(item));
  } else {
    items.forEach((item) => item.classList.add("is-faq-revealed"));
  }

  const closeItem = (item) => {
    const trigger = item.querySelector(".faq-item__trigger");
    if (!trigger) return;
    item.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
  };

  list.addEventListener("click", event => {
    const trigger = event.target.closest(".faq-item__trigger");
    if (!trigger) return;
    const current = trigger.closest(".faq-item");
    const shouldOpen = trigger.getAttribute("aria-expanded") !== "true";
    items.forEach(item => item !== current && closeItem(item));
    if (shouldOpen) {
      current.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
    } else {
      closeItem(current);
    }
  });
}

function setupClosingSocials() {
  const links = [...document.querySelectorAll(".social-link[data-social]")];
  const socialCard = document.querySelector(".closing-socials .social-card");

  if (socialCard) {
    const revealSocialCard = () => socialCard.classList.add("is-social-card-visible");
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      revealSocialCard();
    } else {
      const observer = new IntersectionObserver((entries, obs) => {
        if (!entries[0]?.isIntersecting) return;
        revealSocialCard();
        obs.disconnect();
      }, { threshold: 0.2, rootMargin: "0px 0px -8% 0px" });
      observer.observe(socialCard);
    }
  }

  if (!links.length) return;

  // Keep the real destinations in one place. They are left blank until the
  // studio confirms the live account URLs; touch interaction still works.
  const socialUrls = {
    instagram: "",
    github: "",
    x: "",
    facebook: "",
    whatsapp: "",
    snapchat: ""
  };

  links.forEach(link => {
    const platform = link.dataset.social;
    const url = socialUrls[platform];
    if (url) {
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
    } else {
      link.addEventListener("click", event => {
        event.preventDefault();
        links.forEach(item => item !== link && item.classList.remove("is-touched"));
        link.classList.toggle("is-touched");
      });
    }
  });
}

function setupClosingContacts() {
  const footerWhatsapp = document.querySelector("#footerWhatsappAction");
  const footerCall = document.querySelector("#footerCallInfo");
  const footerCallAction = document.querySelector("#footerCallAction");
  const navCall = document.querySelector(".nav-call, #navCall");
  const studioPhone = normalizePhoneForLink(studioPhoneForContact());
  const whatsappMessage = "Hi Rashcuts, I'd like to book.";
  if (footerWhatsapp) {
    footerWhatsapp.href = studioPhone ? `https://wa.me/${studioPhone.replace(/^\+/, "")}?text=${encodeURIComponent(whatsappMessage)}` : "#";
    footerWhatsapp.classList.toggle("is-disabled", !studioPhone);
  }
  if (studioPhone) {
    const href = `tel:${studioPhone}`;
    if (footerCall) footerCall.href = href;
    if (footerCallAction) footerCallAction.href = href;
    if (navCall) navCall.href = href;
  } else if (navCall) {
    navCall.href = "#";
    navCall.classList.add("is-disabled");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupFinalClosingSequence, { once: true });
} else {
  setupFinalClosingSequence();
}


// V52 — liquid morph navigation for the existing top-left menu button.
(function setupLiquidMorphMenu(){
  const trigger = document.querySelector("#liquidMenuBar");
  const menu = document.querySelector("#siteFloatingMenu");
  const bar = trigger;
  if (!trigger || !menu) return;

  const items = [...menu.querySelectorAll(".liquid-nav-menu__item")];
  let open = false;
  let lock = false;

  function decorateChars(){
    items.forEach((button) => {
      if (button.dataset.decorated) return;
      const label = button.textContent.trim();
      button.textContent = "";
      [...label].forEach((char) => {
        const outer = document.createElement("span");
        outer.className = "liquid-char";
        const stack = document.createElement("span");
        stack.className = "liquid-char__stack";
        const a = document.createElement("span");
        const b = document.createElement("span");
        a.className = b.className = "liquid-char__face";
        a.textContent = char === " " ? "\u00A0" : char;
        b.textContent = char === " " ? "\u00A0" : char;
        a.setAttribute("aria-hidden","true");
        stack.append(a,b);
        outer.appendChild(stack);
        button.appendChild(outer);
      });
      button.dataset.decorated = "1";
    });
  }

  function setOpen(next){
    if (next && typeof closeAllLiquidDropdowns === "function") closeAllLiquidDropdowns();
    open = next;
    trigger.setAttribute("aria-expanded", String(open));
    trigger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    trigger.classList.toggle("is-menu-active", open);
    menu.setAttribute("aria-hidden", String(!open));
    menu.classList.toggle("is-open", open);
    lock = true;
    window.setTimeout(() => { lock = false; }, open ? 780 : 520);
  }

  function scrollToTarget(target){
    const el = document.querySelector(target);
    if (!el) return;
    setOpen(false);
    requestAnimationFrame(() => {
      if (lenisInstance) lenisInstance.scrollTo(el, { offset: -12, duration: 1.05 });
      else el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  decorateChars();
  // The morph menu is hidden until it receives the visible state; initialise it
  // immediately so the existing top-left trigger can always open it.
  menu.classList.add("is-visible");
  setOpen(false);
  trigger.addEventListener("click", (event) => { event.stopPropagation(); setOpen(!open); });
  items.forEach((item) => item.addEventListener("click", () => scrollToTarget(item.dataset.menuTarget)));
  document.addEventListener("pointerdown", (event) => {
    if (!open || lock) return;
    if (!menu.contains(event.target) && !trigger.contains(event.target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open) setOpen(false);
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth <= 700 && open) menu.style.maxHeight = `${Math.max(220, window.innerHeight - 24)}px`;
    else menu.style.maxHeight = "";
  });
})();
