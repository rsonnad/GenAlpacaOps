/**
 * Scroll Animations - Subtle fade-in on scroll using IntersectionObserver
 * Lightweight, no dependencies
 */

/**
 * Initialize scroll animations for elements with data-animate attribute
 * Options:
 * - data-animate="fade-in" - fade in from bottom
 * - data-animate="fade-in-up" - fade in with slight upward movement
 * - data-animate-delay="200" - delay in ms before animation starts
 */
export function initScrollAnimations() {
  // Only run if IntersectionObserver is supported
  if (typeof IntersectionObserver === 'undefined') {
    return;
  }

  // Create observer with subtle threshold
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const element = entry.target;
          const delay = parseInt(element.dataset.animateDelay || '0', 10);
          const animationType = element.dataset.animate || 'fade-in';

          setTimeout(() => {
            element.classList.add('animate-in');
            // Unobserve after animation to improve performance
            observer.unobserve(element);
          }, delay);
        }
      });
    },
    {
      threshold: 0.1, // Trigger when 10% visible
      rootMargin: '0px 0px -50px 0px', // Start animation slightly before element enters viewport
    }
  );

  // Observe all elements with data-animate attribute
  const animatedElements = document.querySelectorAll('[data-animate]');
  animatedElements.forEach((el) => {
    observer.observe(el);
  });
}

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScrollAnimations);
  } else {
    initScrollAnimations();
  }
}
