// Proxy boxes are a broad phase only. Accept input only when the first visible
// surface belongs to that physical button, including at oblique/back views.
export function pickVisibleButton(raycaster, model, screenPanel, buttons, proxies) {
  const candidate = raycaster.intersectObjects(proxies, false)[0];
  if (!candidate) return null;
  const button = buttons.find(button => button.key === candidate.object.userData.key);
  if (!button) return null;
  const surfaces = raycaster.intersectObjects([model, screenPanel].filter(Boolean), true);
  let ancestor = surfaces[0]?.object;
  while (ancestor) {
    if (ancestor === button.node) return button.key;
    ancestor = ancestor.parent;
  }
  return null;
}
