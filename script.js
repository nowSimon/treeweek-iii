gsap.registerPlugin(ScrollTrigger);

// iOS Safari/Brave fire a resize event when the address bar hides/shows
// mid-scroll — same width, different height. Without ignoreMobileResize,
// ScrollTrigger's own internal logic treats that like a real resize and
// re-measures every registered trigger's position, independent of whether
// anything is pinned. That's a full page-wide recalculation happening while
// the user may still be actively scrolling — a real, plausible cause of felt
// "snapping." All section sizing is in svh now (stable across address-bar
// state) specifically so there's nothing that actually needs re-measuring
// when only the height changes, on mobile or desktop.
ScrollTrigger.config({ ignoreMobileResize: true });
// normalizeScroll(true) was here to keep the pinned hero smooth on mobile, but
// the pin itself is now disabled on mobile entirely (see matchMedia below), so
// it's no longer fixing anything. It works by replacing native OS-driven
// momentum scrolling with a JS/RAF-simulated one, which is exactly the kind of
// mechanism that could cost more than it saves on a page this content-heavy —
// removed as a test since jank was reported starting right at gesture start.

const bgGlow = document.getElementById('bg-glow');

const colorStops = [
  { t: 0.0, c: [5, 9, 18] },
  { t: 0.14, c: [26, 30, 58] },
  { t: 0.28, c: [96, 82, 70] },
  { t: 0.42, c: [88, 116, 72] },
  { t: 0.56, c: [168, 138, 82] },
  { t: 0.7, c: [200, 137, 80] },
  { t: 0.86, c: [58, 32, 48] },
  { t: 1.0, c: [5, 9, 18] },
];

/* Day-cycle: bg-glow tints from night through dawn/day/dusk as the user scrolls
   through the diary. Previously this set `background` directly every scroll
   tick — `background` isn't a compositable property, so that forced a full-
   viewport repaint on every frame (a real mobile jank source), even throttled.
   Instead: stack one solid-color layer per color stop and crossfade between
   the current pair with `opacity`, which the GPU composites with zero repaint. */
const bgLayers = colorStops.map(({ c }) => {
  const layer = document.createElement('div');
  layer.className = 'bg-glow-layer';
  layer.style.background = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  layer.style.opacity = '0';
  bgGlow.appendChild(layer);
  return layer;
});
bgLayers[0].style.opacity = '1';

function setBgProgress(t) {
  let idx = colorStops.length - 2;
  for (let i = 0; i < colorStops.length - 1; i++) {
    if (t >= colorStops[i].t && t <= colorStops[i + 1].t) { idx = i; break; }
  }
  const a = colorStops[idx], b = colorStops[idx + 1];
  const localT = (t - a.t) / (b.t - a.t);
  bgLayers.forEach((layer, i) => {
    layer.style.opacity = i === idx ? 1 - localT : i === idx + 1 ? localT : 0;
  });
}

ScrollTrigger.create({
  trigger: '#diary',
  start: 'top bottom',
  end: 'bottom top',
  onUpdate: (self) => setBgProgress(self.progress),
});

/* Camera descent: pin hero for 50vh of scroll while the title lifts out of the
   frame and the fire scene rises up from below into the bottom of the viewport.
   The starry sky (attached to <body>) stays behind as the tree grows into it.
   Pinning is desktop-only — iOS WebKit (Safari and Brave both run on it) resizes
   the viewport mid-scroll as the address bar collapses, which fights pinned
   ScrollTriggers. Phones get a simpler unpinned parallax instead of a jankier
   version of the same effect. */
ScrollTrigger.matchMedia({
  '(min-width: 900px)': function () {
    const heroTl = gsap.timeline({
      scrollTrigger: {
        trigger: '#hero',
        start: 'top top',
        end: '+=100%',
        pin: true,
        pinSpacing: false,
        scrub: 0.35,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });
    // pinSpacing: false — doc scroll advances naturally under the pinned hero,
    // so fire-scene rides up 1:1 with scroll and there's no orphaned empty space
    // between fire-scene and diary at pin release.
    heroTl.fromTo('.hero h1', { y: 0, opacity: 1 }, { y: '-40vh', opacity: 0, ease: 'none' }, 0, 0);
    heroTl.fromTo('.hero-sub', { y: 0, opacity: 1 }, { y: '-45vh', opacity: 0, ease: 'none' }, 0, 0);
    heroTl.to('.scroll-prompt', { opacity: 0, ease: 'none' }, 0);
    // Small negative translate so fire-scene stops rising a bit above viewport
    // bottom — leaves a strip of the pinned hero visible (treeline + dark forest)
    // for a "the scene sits in a clearing behind the deep forest" read.
    heroTl.fromTo('#fire-scene', { y: 0 }, { y: '-10vh', ease: 'none' }, 0);
  },
  // Mobile: no scroll-linked hero animation at all. The camera-descent effect
  // (pin, scrub fades, fire-scene sync) only ever caused problems on iOS
  // Safari/Brave — the address bar's live viewport-height changes fight any
  // scroll-position-driven animation, pinned or not. Simpler and more robust
  // to just let the hero scroll away like normal page content on mobile.
});

const revealTargets = [
  ...document.querySelectorAll('.polaroid'),
  document.querySelector('.fire-scene .scene'),
].filter(Boolean);

const revealObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  }
}, { rootMargin: '0px 0px -20% 0px', threshold: 0 });

for (const el of revealTargets) revealObserver.observe(el);

const envelopeWrap = document.getElementById('envelope-wrap');
const letterScene = document.getElementById('letter-scene');
const envelopeObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      envelopeObserver.disconnect();
      gsap.set(envelopeWrap, { scale: 3.2, y: -80, opacity: 0, rotation: 0 });
      gsap.to(envelopeWrap, {
        opacity: 1, scale: 1, y: 0, rotation: -2.5,
        duration: 1.5, ease: 'bounce.out',
      });
    }
  }
}, { rootMargin: '0px 0px -80% 0px', threshold: 0 });
envelopeObserver.observe(letterScene);

const seal = document.getElementById('seal');
const sheet1 = document.getElementById('sheet-1');
const sheet2 = document.getElementById('sheet-2');

// The sheets are centered as an absolute overlay on top of the envelope, so the
// section itself doesn't naturally grow to fit them. Content here is going to
// vary in length (hand-drawn/handwritten hexagram entries, added one at a time),
// so instead of a fixed height we measure the tallest sheet and grow the section
// to match — no fixed cap, no spilling past the section's edges.
function syncLetterSceneHeight() {
  const contentHeight = Math.max(sheet1.scrollHeight, sheet2.scrollHeight);
  const needed = contentHeight + window.innerHeight * 0.3;
  letterScene.style.minHeight = Math.max(window.innerHeight, needed) + 'px';
}

const fateLine = document.getElementById('fate-line');
const signoff = document.getElementById('signoff');
const fateBubble = document.getElementById('fate-bubble');
const acceptBubble = document.getElementById('accept-bubble');
const hexagramEl = document.getElementById('hexagram');
const readingEl = document.getElementById('reading');

gsap.set([sheet1, sheet2], { xPercent: -50, yPercent: -50 });

function positionBubble(bubble, anchorEl, verticalBias) {
  if (!bubble || !anchorEl) return;
  const sheet = bubble.closest('.sheet');
  if (!sheet) return;
  const sheetRect = sheet.getBoundingClientRect();
  const anchorRect = anchorEl.getBoundingClientRect();
  const anchorMidY = anchorRect.top - sheetRect.top + anchorRect.height / 2;
  const pointerReach = 38;
  const top = anchorMidY - bubble.offsetHeight - pointerReach + (verticalBias || 0);
  bubble.style.top = top + 'px';
}

function whenImageReady(img, cb) {
  if (!img) return;
  if (img.complete && img.naturalWidth > 0) cb();
  else img.addEventListener('load', cb);
}

const topLetterImg = sheet1.querySelector('.letter-photo');
whenImageReady(topLetterImg, () => {
  positionBubble(fateBubble, fateLine, -20);
  syncLetterSceneHeight();
});
// iOS fires a resize event when the address bar hides/shows mid-scroll — same
// width, different height. Reacting to that forces layout-reading work
// (getBoundingClientRect, scrollHeight) at the exact moment it's most likely
// to cause a felt hitch, for a resize that isn't a real one. Only run this
// stuff on a genuine width change (real resize or orientation change).
let lastResizeWidth = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === lastResizeWidth) return;
  lastResizeWidth = window.innerWidth;
  positionBubble(fateBubble, fateLine, -20);
  positionBubble(acceptBubble, signoff, -20);
  syncLetterSceneHeight();
});
if (window.ResizeObserver) {
  new ResizeObserver(() => {
    positionBubble(fateBubble, fateLine, -20);
    syncLetterSceneHeight();
  }).observe(sheet1);
  new ResizeObserver(() => {
    positionBubble(acceptBubble, signoff, -20);
    syncLetterSceneHeight();
  }).observe(sheet2);
}

seal.addEventListener('click', () => {
  const tl = gsap.timeline();
  tl.fromTo(sheet1, {
      y: () => window.innerHeight * 0.3,
      scale: 0.85,
      rotation: 2,
      autoAlpha: 0,
    }, {
      y: 0,
      scale: 1,
      rotation: 0,
      autoAlpha: 1,
      duration: 0.9,
      ease: 'back.out(1.15)',
      onComplete: () => positionBubble(fateBubble, fateLine, -20),
    })
    .to('#envelope-wrap', {
      opacity: 0.25,
      y: 30,
      scale: 0.95,
      duration: 0.5,
    }, '<')
    .call(() => {
      gsap.delayedCall(0.6, () => positionBubble(fateBubble, fateLine, -20));
      gsap.delayedCall(10, () => fateBubble.classList.add('shown'));
    });
}, { once: true });

document.querySelectorAll('.fate-line, .signoff').forEach((el) => {
  el.addEventListener('mouseenter', () => showBubbleFor(el));
  el.addEventListener('click', () => showBubbleFor(el));
});

function showBubbleFor(el) {
  if (el === fateLine) fateBubble.classList.add('shown');
  if (el === signoff) acceptBubble.classList.add('shown');
}

const hexagramReadings = {
  1: "This is a green light, though it comes with responsibility. Your power is real, but it only holds if you keep showing up for it — main character energy takes daily practice.",
  2: "Not every week is for pushing. This one asks you to receive — let people carry you a little, let the ground hold your weight. Strength isn't always the one doing the lifting.",
  3: "Everything worth starting looks like chaos first. Stop waiting for it to feel organized — call in your people, point at the mess together, and let the shape appear as you go.",
  4: "Pretending you already know causes more trouble than admitting you don't. Ask the obvious question out loud — the people actually worth learning from love being asked.",
  5: "This waiting is quietly doing something, even when it looks like nothing. Stay ready rather than anxious — eat well, rest, keep your fire lit — so when the moment opens you're not scrambling to catch up to it.",
  6: "Whatever's brewing, name it before it boils over. Say the awkward thing early, in plain words, to the actual person — not the group chat about them.",
  7: "Real strength here comes from being trusted enough that people follow without being told twice. Build that kind of trust this week.",
  8: "People gather around what feels real more than what looks impressive. Be the plain, warm center someone else can actually lean toward — that's the whole invitation.",
  9: "You can't force this one open. Small, steady moves — a kind word, a bit of care, a little discipline — are quietly building toward something not ready to rain yet.",
  10: "You're walking close to something bigger than you right now. Move with humor and respect, not bravado — that's exactly how you get through untouched.",
  11: "Things are actually in balance right now, even if it doesn't feel dramatic enough to trust. Let it be easy. Organize gently, then let the good season do its own work.",
  12: "Not every closed door needs forcing. If the room isn't ready for who you actually are, don't shrink to fit it — step back, stay whole, and wait for a better room.",
  13: "The friendships that matter this week are the ones built on something bigger than convenience, more than the merely comfortable ones. Organize around a real shared reason.",
  14: "However much you're holding right now — attention, resources, a room full of people who showed up for you — the ask is to stay humble with it and use it well.",
  15: "The quiet ones carry more weight than they know, and the loud ones have room to soften. Whatever end you're on, modesty evens it out, and it works.",
  16: "Real momentum spreads on its own instead of being forced. Find the rhythm the people around you are already moving in, and let the whole thing turn into music instead of a march.",
  17: "The people who are really with you don't need to be convinced. Stop performing conviction and just be someone worth following — the right ones will fall in step on their own.",
  18: "Something's been left to rot because looking at it felt like too much. This week is for looking at it — not the quick fix, the real one.",
  19: "You're gaining ground right now. Good — use it, reach down and bring people up with you, because seasons turn and this exact momentum won't last forever.",
  20: "You don't have to convince anyone of anything. Just become the kind of person whose presence alone changes the room — the rest follows.",
  21: "Something's in the way and politeness isn't moving it. Be direct, be fair, and clear it — obstruction doesn't dissolve on its own, it gets bitten through.",
  22: "Charm is the wrapping this week, nothing more. Let this week be beautiful, sure — but don't let the aesthetic replace the actual thing you came here to build.",
  23: "Some things are falling apart right now and that's not a verdict on you. Stay generous, stay connected to people, and let the cycle do what cycles do.",
  24: "The light is coming back, but slowly — don't force the return. Rest into it, let it build a little at a time, and it'll actually last.",
  25: "Stop calculating your next move. The truest thing you can do this week is act on instinct and let it be simple — main character energy is a reflex, not a strategy.",
  26: "You've got more power building in you than you're using. Don't waste it in bursts — hold it, learn from what came before you, and let it become something real.",
  27: "Watch what you're feeding yourself this week — food, people, words, all of it. What you take in becomes what you put out, so choose on purpose.",
  28: "There's more weight on this moment than the structure was built for. Stay calm anyway — sometimes the strongest move is just standing steady while everything strains.",
  29: "You're going to hit the same hard thing more than once this week. Move through it like water does — keep your nature intact and keep flowing anyway.",
  30: "Your light isn't meant to burn alone — it needs something to hold onto. Let yourself depend on this place and these people, and shine because of it, not despite it.",
  31: "The strongest pull comes from making room for people, more than pushing toward them. Stay open and let people come toward you instead of performing at them.",
  32: "Lasting doesn't mean staying still. Keep moving, keep changing shape if you need to — just don't lose the one true direction underneath it all.",
  33: "Retreat can be its own kind of win. Some situations call for you to step back, calm and unhurried, and let your energy return to you instead of leaking out.",
  34: "Real power without integrity is just noise. This week, the version of you that grows loudest is the one who stays grounded in what's actually true, rather than performing strength.",
  35: "You're being trusted and it's working. Don't shrink from the credit or the momentum — let this be the season people watch you rise without needing to compete for it.",
  36: "Sometimes the room isn't ready for your full light yet. Keep it burning quietly inside you anyway — the fire doesn't go out just because you're not showing it to everyone.",
  37: "How you treat the people closest to you is the whole message. Get that right first — the rest of your main character arc follows from there, not the other way around.",
  38: "You don't need everyone to agree with you. Let the differences stay differences, and put your energy into the small, real connections that are actually available to you right now.",
  39: "This isn't the week to force your way through. Step back, ask someone you trust for a hand, and use the obstacle as a mirror instead of a wall to smash.",
  40: "The pressure is finally breaking. Don't waste this relief chasing what's already resolved — let go of the grudge, close the loop, and actually enjoy the exhale.",
  41: "Less can be more. Whatever you strip away this season — the performance, the excess — makes room for something truer and sturdier to grow in its place.",
  42: "You're in a season where giving comes back tenfold. Be generous with your time and your energy — what you pour into others this week returns as momentum.",
  43: "Something's been building and it's time to actually deal with it. Move decisively, but stay generous and transparent about it — this is about clearing space, plain and simple.",
  44: "Watch what looks harmless. The thing that seems too small to matter is exactly the thing worth paying attention to before it quietly takes up more room than it should.",
  45: "Real gathering starts with you being solid first. Get grounded, then bring your people together — and stay alert, because any time this many people gather, something needs holding.",
  46: "You don't need a dramatic leap. Steady, humble effort compounds — keep showing up in small ways and the growth will be bigger than you expected by the end of the week.",
  47: "Even when things feel stacked against you, your job is to stay yourself. The people who come out of pressure intact are the ones who refused to stop being who they are.",
  48: "Some things don't change no matter what year it is — the need to be fed, held, and actually seen by real people. That's what this week is actually for.",
  49: "Something in you has been waiting for the right moment to change completely. This is it — a real turning over, and you already know it's overdue.",
  50: "You've been cooking something for a while — call it a project, a self, a life. It's ready. Serve it to the people who showed up, not the ones who didn't.",
  51: "Something is about to startle you awake. Let it. The people who stay standing through the shock are the ones who were already paying attention.",
  52: "Stop scanning the whole horizon for the next thing. Whatever is directly in front of you — that's the entire assignment right now.",
  53: "This isn't the season where things happen fast. It's the season where a tree grows exactly as far as its roots can hold it — go slow, go real, and let it actually take.",
  54: "Don't hand yourself over to something just because it's asking. Whatever commitment you make this week, make it with your eyes open, not because it's easier to say yes.",
  55: "You're at the top of something right now, whether you've noticed or not. Stay clear-headed in it — this kind of fullness doesn't last, so use it well while it's here.",
  56: "You're a guest here, even in your own life this week. Travel light, stay kind, don't overstay any single feeling — the ones who wander well don't try to own the room.",
  57: "You don't need to force this one. Keep showing up the same steady way and let it work on people slowly — wind moves mountains eventually, it just doesn't look like much while it's happening.",
  58: "Real joy isn't a performance, and people can tell the difference. Let yours be the actual, unguarded kind — it's the thing that pulls the right people toward the fire.",
  59: "Whatever has kept you and someone else at a distance — a grudge, an old story, plain avoidance — this week is built to dissolve exactly that kind of thing. Let it.",
  60: "Freedom without any shape just spills everywhere. Pick the container — the schedule, the boundary, the one rule you actually keep — and let it hold you instead of fighting it.",
  61: "The version of you that isn't performing for anyone is also the version that can actually reach people. Lead with that one, especially with whoever's been hardest to get through to.",
  62: "This isn't the week to swing big. Handle the small, close-at-hand thing in front of you with real care — a bird that comes home to its nest gets further than one still climbing for the sky.",
  63: "Just because something finally worked doesn't mean you can stop paying attention to it. The good things you've built this week need tending, not just admiring.",
  64: "You're almost there, whatever 'there' is for you right now. Don't get careless in the last stretch — this is exactly the moment people trip, right before they would have made it.",
};

const trigramBits = {
  Qian: [1, 1, 1],
  Kun: [0, 0, 0],
  Zhen: [1, 0, 0],
  Kan: [0, 1, 0],
  Gen: [0, 0, 1],
  Xun: [0, 1, 1],
  Li: [1, 0, 1],
  Dui: [1, 1, 0],
};

const hexagramData = [
  [1, 'Qian', 'Qian', 'The Creative'], [2, 'Kun', 'Kun', 'The Receptive'],
  [3, 'Zhen', 'Kan', 'Difficulty at the Beginning'], [4, 'Kan', 'Gen', 'Youthful Folly'],
  [5, 'Qian', 'Kan', 'Waiting'], [6, 'Kan', 'Qian', 'Conflict'],
  [7, 'Kan', 'Kun', 'The Army'], [8, 'Kun', 'Kan', 'Holding Together'],
  [9, 'Qian', 'Xun', 'The Taming Power of the Small'], [10, 'Dui', 'Qian', 'Treading'],
  [11, 'Qian', 'Kun', 'Peace'], [12, 'Kun', 'Qian', 'Standstill'],
  [13, 'Li', 'Qian', 'Fellowship with Men'], [14, 'Qian', 'Li', 'Possession in Great Measure'],
  [15, 'Gen', 'Kun', 'Modesty'], [16, 'Kun', 'Zhen', 'Enthusiasm'],
  [17, 'Zhen', 'Dui', 'Following'], [18, 'Xun', 'Gen', 'Work on What Has Been Spoiled'],
  [19, 'Dui', 'Kun', 'Approach'], [20, 'Kun', 'Xun', 'Contemplation'],
  [21, 'Zhen', 'Li', 'Biting Through'], [22, 'Li', 'Gen', 'Grace'],
  [23, 'Kun', 'Gen', 'Splitting Apart'], [24, 'Zhen', 'Kun', 'Return'],
  [25, 'Zhen', 'Qian', 'Innocence'], [26, 'Qian', 'Gen', 'The Taming Power of the Great'],
  [27, 'Zhen', 'Gen', 'The Corners of the Mouth'], [28, 'Xun', 'Dui', 'Preponderance of the Great'],
  [29, 'Kan', 'Kan', 'The Abysmal'], [30, 'Li', 'Li', 'The Clinging'],
  [31, 'Gen', 'Dui', 'Influence'], [32, 'Xun', 'Zhen', 'Duration'],
  [33, 'Gen', 'Qian', 'Retreat'], [34, 'Qian', 'Zhen', 'The Power of the Great'],
  [35, 'Kun', 'Li', 'Progress'], [36, 'Li', 'Kun', 'Darkening of the Light'],
  [37, 'Li', 'Xun', 'The Family'], [38, 'Dui', 'Li', 'Opposition'],
  [39, 'Gen', 'Kan', 'Obstruction'], [40, 'Kan', 'Zhen', 'Deliverance'],
  [41, 'Dui', 'Gen', 'Decrease'], [42, 'Zhen', 'Xun', 'Increase'],
  [43, 'Qian', 'Dui', 'Break-through'], [44, 'Xun', 'Qian', 'Coming to Meet'],
  [45, 'Kun', 'Dui', 'Gathering Together'], [46, 'Xun', 'Kun', 'Pushing Upward'],
  [47, 'Kan', 'Dui', 'Oppression'], [48, 'Xun', 'Kan', 'The Well'],
  [49, 'Li', 'Dui', 'Revolution'], [50, 'Xun', 'Li', 'The Caldron'],
  [51, 'Zhen', 'Zhen', 'The Arousing'], [52, 'Gen', 'Gen', 'Keeping Still'],
  [53, 'Gen', 'Xun', 'Development'], [54, 'Dui', 'Zhen', 'The Marrying Maiden'],
  [55, 'Li', 'Zhen', 'Abundance'], [56, 'Gen', 'Li', 'The Wanderer'],
  [57, 'Xun', 'Xun', 'The Gentle'], [58, 'Dui', 'Dui', 'The Joyous'],
  [59, 'Kan', 'Xun', 'Dispersion'], [60, 'Dui', 'Kan', 'Limitation'],
  [61, 'Dui', 'Xun', 'Inner Truth'], [62, 'Gen', 'Zhen', 'Preponderance of the Small'],
  [63, 'Li', 'Kan', 'After Completion'], [64, 'Kan', 'Li', 'Before Completion'],
];

const hexagramLookup = {};
hexagramData.forEach(([num, lower, upper, name]) => {
  const bits = [...trigramBits[lower], ...trigramBits[upper]].join('');
  hexagramLookup[bits] = { number: num, name };
});

function buildHexagram() {
  hexagramEl.innerHTML = '';
  const bits = [];
  for (let i = 0; i < 6; i++) {
    const isYang = Math.random() < 0.5;
    bits.push(isYang ? 1 : 0);
    const line = document.createElement('div');
    line.className = `hex-line ${isYang ? 'yang' : 'yin'}`;
    if (isYang) {
      const bar = document.createElement('div');
      bar.className = 'bar';
      line.appendChild(bar);
    } else {
      const barL = document.createElement('div');
      barL.className = 'bar';
      const barR = document.createElement('div');
      barR.className = 'bar';
      line.appendChild(barL);
      line.appendChild(barR);
    }
    hexagramEl.appendChild(line);
  }
  return hexagramLookup[bits.join('')];
}

fateBubble.addEventListener('click', () => {
  fateBubble.classList.remove('shown');

  const match = buildHexagram();
  const interpretation = hexagramReadings[match.number];
  readingEl.textContent = `This is the I Ching hexagram ${match.number}: ${match.name}. It means: ${interpretation}`;
  syncLetterSceneHeight();

  // The hexagram lines and the reading are writing on a letter, so they are
  // simply on the page when it comes out — no draw-on or type-on reveal. Only
  // the sheets themselves move.
  const tl = gsap.timeline({
    onComplete: () => {
      const bottomLetterImg = sheet2.querySelector('.letter-signoff-wrap .letter-photo');
      whenImageReady(bottomLetterImg, () => {
        requestAnimationFrame(() => requestAnimationFrame(() => positionBubble(acceptBubble, signoff, -20)));
      });
      gsap.delayedCall(10, () => acceptBubble.classList.add('shown'));
    },
  });

  tl.to(sheet1, {
      x: () => -window.innerWidth * 0.06,
      y: 20,
      rotation: -7,
      scale: 0.96,
      autoAlpha: 0.5,
      duration: 0.7,
      ease: 'power2.inOut',
    })
    .fromTo(sheet2, {
      y: () => window.innerHeight * 0.25,
      scale: 0.8,
      rotation: -2,
      autoAlpha: 0,
    }, {
      y: 0,
      scale: 1,
      rotation: 0,
      autoAlpha: 1,
      duration: 0.9,
      ease: 'back.out(1.1)',
    }, '-=0.35');
}, { once: true });

acceptBubble.addEventListener('click', () => {
  window.open('https://coliven.com/events/treeweek', '_blank', 'noopener');
});

const treeSealStamp = document.getElementById('tree-seal-stamp');
const videoModal = document.getElementById('video-modal');
const videoModalIframe = document.getElementById('video-modal-iframe');
const videoModalClose = document.getElementById('video-modal-close');
const videoEmbedSrc = 'https://www.youtube.com/embed/Fu48DwbMq_c?autoplay=1';

function openVideoModal() {
  videoModalIframe.src = videoEmbedSrc;
  videoModal.hidden = false;
}

function closeVideoModal() {
  videoModal.hidden = true;
  videoModalIframe.src = '';
}

treeSealStamp.addEventListener('click', openVideoModal);
videoModalClose.addEventListener('click', closeVideoModal);
videoModal.addEventListener('click', (e) => {
  if (e.target === videoModal) closeVideoModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !videoModal.hidden) closeVideoModal();
});
