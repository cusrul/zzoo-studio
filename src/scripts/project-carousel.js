export function createProjectRotation({ count, onChange, schedule = setTimeout, cancel = clearTimeout, delay = 6500 }) {
  let index = 0;
  let timer = null;
  let destroyed = false;
  const pauses = new Set();

  function arm() {
    if (timer !== null) cancel(timer);
    timer = null;
    if (!destroyed && count > 1 && pauses.size === 0) {
      timer = schedule(() => { timer = null; step(1); }, delay);
    }
  }

  function step(direction) {
    if (destroyed || count < 2) return;
    index = (index + direction + count) % count;
    onChange(index);
    arm();
  }

  return {
    start: arm,
    next: () => step(1),
    previous: () => step(-1),
    pause(reason, active) {
      if (active) pauses.add(reason);
      else pauses.delete(reason);
      arm();
    },
    destroy() {
      destroyed = true;
      arm();
    },
  };
}

export function mountProjectCarousels() {
  for (const root of document.querySelectorAll("[data-project-carousel]")) {
    if (root.dataset.ready) continue;
    const track = root.querySelector(".project-track");
    const slides = [...track.children];
    if (slides.length < 2) continue;
    const controls = root.querySelector(".project-switcher");
    const position = root.querySelector("[data-position]");
    const pause = root.querySelector("[data-pause]");
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const events = new AbortController();
    const options = { signal: events.signal };
    let userPaused = false;
    function render(index) {
      track.style.transform = `translateX(-${index * 100}%)`;
      slides.forEach((slide, i) => {
        slide.inert = i !== index;
        slide.setAttribute("aria-hidden", String(i !== index));
      });
      position.textContent = `${index + 1} / ${slides.length}`;
    }
    const rotation = createProjectRotation({ count: slides.length, onChange: render });
    root.dataset.ready = "true";
    root.setAttribute("aria-roledescription", "轮播");
    controls.hidden = false;
    render(0);
    rotation.pause("hover", root.matches(":hover"));
    rotation.pause("focus", root.contains(document.activeElement));
    rotation.pause("hidden", document.hidden);
    rotation.pause("motion", motion.matches);
    root.addEventListener("pointerenter", () => rotation.pause("hover", true), options);
    root.addEventListener("pointerleave", () => rotation.pause("hover", false), options);
    root.addEventListener("focusin", () => rotation.pause("focus", true), options);
    root.addEventListener("focusout", () => queueMicrotask(() => rotation.pause("focus", root.contains(document.activeElement))), options);
    root.addEventListener("pointerdown", () => rotation.pause("drag", true), options);
    const release = () => rotation.pause("drag", false);
    window.addEventListener("pointerup", release, options);
    window.addEventListener("pointercancel", release, options);
    // Focus inside the model iframe is still interaction with the current slide.
    window.addEventListener("blur", () => rotation.pause("focus", root.contains(document.activeElement)), options);
    window.addEventListener("focus", () => rotation.pause("focus", root.contains(document.activeElement)), options);
    document.addEventListener("visibilitychange", () => rotation.pause("hidden", document.hidden), options);
    motion.addEventListener("change", () => rotation.pause("motion", motion.matches), options);
    root.querySelector("[data-next]").addEventListener("click", () => rotation.next(), options);
    root.querySelector("[data-previous]").addEventListener("click", () => rotation.previous(), options);
    pause.addEventListener("click", () => {
      userPaused = !userPaused;
      rotation.pause("user", userPaused);
      pause.setAttribute("aria-pressed", String(userPaused));
      pause.textContent = userPaused ? "继续轮播" : "暂停轮播";
    }, options);
    const observer = new IntersectionObserver(([entry]) => rotation.pause("offscreen", !entry.isIntersecting));
    observer.observe(root);
    window.addEventListener("pagehide", (event) => {
      if (event.persisted) return;
      rotation.destroy();
      observer.disconnect();
      events.abort();
      delete root.dataset.ready;
    }, options);
  }
}
