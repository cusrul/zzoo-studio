export function validPoseQuaternion(value) {
  return Array.isArray(value) && value.length === 4 &&
    value.every(component => Number.isFinite(component)) &&
    Math.abs(Math.hypot(...value) - 1) < 0.02;
}

export function attachPreservingWorldTransform(parent, object) {
  parent.attach(object);
}

// Reverse the model's vertical tilt (X), preserving horizontal tilt (Y).
// For the gravity-only Rx(roll)*Ry(pitch) input, the cross term Z also flips.
export function modelTiltQuaternion([x, y, z, w]) {
  return [-x, y, -z, w];
}

export function poseBlendWeight(dt) {
  return 1 - Math.exp(-Math.max(0, Math.min(dt, 0.1)) / 0.08);
}
