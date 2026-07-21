// Nav: transparent on hero, frosted glass on scroll
const nav = document.getElementById('nav');
const onScroll = () => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
};
window.addEventListener('scroll', onScroll, { passive: true });

// Fade-in on scroll using IntersectionObserver
const fadeEls = document.querySelectorAll('.fade-in');
const observer = new IntersectionObserver(
    (entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    },
    { threshold: 0.1, rootMargin: '0px 0px -48px 0px' }
);
fadeEls.forEach((el) => observer.observe(el));

// Stagger timeline cards
document.querySelectorAll('.timeline-card').forEach((card, i) => {
    card.style.transitionDelay = `${i * 0.1}s`;
});

// Stagger vibe blockquotes
document.querySelectorAll('.vibe-quotes blockquote').forEach((el, i) => {
    el.style.transitionDelay = `${i * 0.12}s`;
});
