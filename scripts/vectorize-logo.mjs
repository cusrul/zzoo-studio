import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'public', 'brand', 'zzoo-original.png');
const svgPath = path.join(root, 'public', 'brand', 'zzoo.svg');
const provenancePath = path.join(root, 'public', 'brand', 'vector-provenance.json');

const WHITE_LUMINANCE_THRESHOLD = 80;
const ORANGE_MIN_RED = 10;
const ORANGE_MIN_COMPONENT_PIXELS = 128;
const DOT_MIN_ELLIPSE_IOU = 0.92;
const DOT_REGION_BOTTOM = 810;
const SIMPLIFICATION_EPSILON = 0.8;
const INK = '#171717';

function isOrange(r, g, b) {
  return r >= ORANGE_MIN_RED && r > g * 1.35 && r > b * 2;
}

function luminance(r, g, b) {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function getBounds(mask, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }

  if (right < 0) throw new Error('No foreground pixels were found in the source image.');
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function addEdge(edges, outgoing, from, to, direction) {
  const index = edges.length;
  edges.push({ from, to, direction, used: false });
  const candidates = outgoing.get(from);
  if (candidates) candidates.push(index);
  else outgoing.set(from, [index]);
}

function extractContours(mask, width, height) {
  const stride = width + 1;
  const edges = [];
  const outgoing = new Map();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (!mask[pixel]) continue;

      const vertex = y * stride + x;
      if (y === 0 || !mask[pixel - width]) {
        addEdge(edges, outgoing, vertex, vertex + 1, 0);
      }
      if (x === width - 1 || !mask[pixel + 1]) {
        addEdge(edges, outgoing, vertex + 1, vertex + stride + 1, 1);
      }
      if (y === height - 1 || !mask[pixel + width]) {
        addEdge(edges, outgoing, vertex + stride + 1, vertex + stride, 2);
      }
      if (x === 0 || !mask[pixel - 1]) {
        addEdge(edges, outgoing, vertex + stride, vertex, 3);
      }
    }
  }

  const pointFor = (vertex) => ({ x: vertex % stride, y: Math.floor(vertex / stride) });
  const turnPriority = [1, 0, 3, 2]; // right, straight, left, reverse; separates diagonal pixel contacts.
  const loops = [];

  for (let first = 0; first < edges.length; first += 1) {
    if (edges[first].used) continue;

    const start = edges[first].from;
    const points = [pointFor(start)];
    let current = first;
    let closed = false;

    for (let step = 0; step <= edges.length; step += 1) {
      const edge = edges[current];
      if (edge.used) break;
      edge.used = true;

      const vertex = edge.to;
      if (vertex === start) {
        closed = true;
        break;
      }
      points.push(pointFor(vertex));

      const available = (outgoing.get(vertex) ?? []).filter((candidate) => !edges[candidate].used);
      if (!available.length) break;

      let next = available[0];
      let best = Infinity;
      for (const candidate of available) {
        const delta = (edges[candidate].direction - edge.direction + 4) % 4;
        const priority = turnPriority.indexOf(delta);
        if (priority < best) {
          best = priority;
          next = candidate;
        }
      }
      current = next;
    }

    if (!closed) throw new Error('Contour tracing encountered an open boundary.');
    loops.push(points);
  }

  return loops;
}

function discardSmallComponents(mask, width, height, minimumPixels) {
  const visited = new Uint8Array(mask.length);
  const stack = [];
  const component = [];
  let removed = 0;

  for (let first = 0; first < mask.length; first += 1) {
    if (!mask[first] || visited[first]) continue;
    stack.push(first);
    component.length = 0;
    visited[first] = 1;

    while (stack.length) {
      const pixel = stack.pop();
      component.push(pixel);
      const x = pixel % width;
      const neighbors = [
        x > 0 ? pixel - 1 : -1,
        x + 1 < width ? pixel + 1 : -1,
        pixel >= width ? pixel - width : -1,
        pixel + width < width * height ? pixel + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || !mask[neighbor] || visited[neighbor]) continue;
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }

    if (component.length < minimumPixels) {
      for (const pixel of component) mask[pixel] = 0;
      removed += component.length;
    }
  }

  return removed;
}

function findComponents(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const stack = [];
  const components = [];

  for (let first = 0; first < mask.length; first += 1) {
    if (!mask[first] || visited[first]) continue;
    stack.push(first);
    visited[first] = 1;
    const pixels = [];
    const rowSpans = new Map();
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;

    while (stack.length) {
      const pixel = stack.pop();
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      pixels.push(pixel);
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
      const span = rowSpans.get(y);
      if (span) {
        span[0] = Math.min(span[0], x);
        span[1] = Math.max(span[1], x + 1);
      } else {
        rowSpans.set(y, [x, x + 1]);
      }

      const neighbors = [
        x > 0 ? pixel - 1 : -1,
        x + 1 < width ? pixel + 1 : -1,
        y > 0 ? pixel - width : -1,
        y + 1 < height ? pixel + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || !mask[neighbor] || visited[neighbor]) continue;
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }

    components.push({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      area: pixels.length,
      pixels,
      rowSpans,
    });
  }

  return components;
}

function componentKey(bounds) {
  return `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`;
}

function fittedEllipse(component, sourceWidth, sourceHeight) {
  const { x, y, width, height, pixels } = component;
  let sumX = 0;
  let sumY = 0;
  for (const pixel of pixels) {
    sumX += (pixel % sourceWidth) + 0.5;
    sumY += Math.floor(pixel / sourceWidth) + 0.5;
  }
  const cx = sumX / pixels.length;
  const cy = sumY / pixels.length;
  let varianceX = 0;
  let varianceY = 0;
  for (const pixel of pixels) {
    varianceX += ((pixel % sourceWidth) + 0.5 - cx) ** 2;
    varianceY += (Math.floor(pixel / sourceWidth) + 0.5 - cy) ** 2;
  }
  const rx = 2 * Math.sqrt(varianceX / pixels.length);
  const ry = 2 * Math.sqrt(varianceY / pixels.length);
  const members = new Set(pixels);
  let predicted = 0;
  let overlap = 0;

  for (let py = Math.max(0, y - 1); py < Math.min(sourceHeight, y + height + 1); py += 1) {
    for (let px = Math.max(0, x - 1); px < x + width + 1; px += 1) {
      if (((px + 0.5 - cx) / rx) ** 2 + ((py + 0.5 - cy) / ry) ** 2 > 1) continue;
      predicted += 1;
      if (members.has(py * sourceWidth + px)) overlap += 1;
    }
  }

  return {
    cx,
    cy,
    rx,
    ry,
    maskIoU: overlap / (component.area + predicted - overlap),
  };
}

function loopBounds(points) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const point of points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function ellipsePath(bounds, viewBounds) {
  const cx = bounds.x + bounds.width / 2 - viewBounds.x;
  const cy = bounds.y + bounds.height / 2 - viewBounds.y;
  const rx = bounds.width / 2;
  const ry = bounds.height / 2;
  const k = 0.5522847498307936;
  const n = formatCoordinate;
  return `M${n(cx)} ${n(cy - ry)}C${n(cx + k * rx)} ${n(cy - ry)} ${n(cx + rx)} ${n(cy - k * ry)} ${n(cx + rx)} ${n(cy)}C${n(cx + rx)} ${n(cy + k * ry)} ${n(cx + k * rx)} ${n(cy + ry)} ${n(cx)} ${n(cy + ry)}C${n(cx - k * rx)} ${n(cy + ry)} ${n(cx - rx)} ${n(cy + k * ry)} ${n(cx - rx)} ${n(cy)}C${n(cx - rx)} ${n(cy - k * ry)} ${n(cx - k * rx)} ${n(cy - ry)} ${n(cx)} ${n(cy - ry)}Z`;
}

function fittedCapsuleRadius(component) {
  const { x, y, width, height, rowSpans } = component;
  const minRadius = Math.max(5, Math.min(width, height) * 0.2);
  const maxRadius = height / 2;
  let bestRadius = minRadius;
  let bestError = Infinity;

  for (let radius = minRadius; radius <= maxRadius; radius += 0.1) {
    let error = 0;
    for (const [row, span] of rowSpans) {
      const centerY = row + 0.5;
      let cornerOffset = 0;
      if (centerY < y + radius) {
        const dy = y + radius - centerY;
        cornerOffset = radius - Math.sqrt(Math.max(0, radius * radius - dy * dy));
      } else if (centerY > y + height - radius) {
        const dy = centerY - (y + height - radius);
        cornerOffset = radius - Math.sqrt(Math.max(0, radius * radius - dy * dy));
      }
      const leftError = span[0] - (x + cornerOffset);
      const rightError = span[1] - (x + width - cornerOffset);
      error += leftError * leftError + rightError * rightError;
    }
    if (error < bestError) {
      bestError = error;
      bestRadius = radius;
    }
  }

  return {
    radius: bestRadius,
    rowBoundaryRmse: Math.sqrt(bestError / (rowSpans.size * 2)),
  };
}

function roundedRectanglePath(bounds, radii, viewBounds) {
  const x0 = bounds.x - viewBounds.x;
  const y0 = bounds.y - viewBounds.y;
  const x1 = x0 + bounds.width;
  const y1 = y0 + bounds.height;
  const rx = radii.radius;
  const ry = radii.radius;
  const cx = rx * 0.5522847498307936;
  const cy = ry * 0.5522847498307936;
  const n = formatCoordinate;
  return `M${n(x0 + rx)} ${n(y0)}H${n(x1 - rx)}C${n(x1 - rx + cx)} ${n(y0)} ${n(x1)} ${n(y0 + ry - cy)} ${n(x1)} ${n(y0 + ry)}V${n(y1 - ry)}C${n(x1)} ${n(y1 - ry + cy)} ${n(x1 - rx + cx)} ${n(y1)} ${n(x1 - rx)} ${n(y1)}H${n(x0 + rx)}C${n(x0 + rx - cx)} ${n(y1)} ${n(x0)} ${n(y1 - ry + cy)} ${n(x0)} ${n(y1 - ry)}V${n(y0 + ry)}C${n(x0)} ${n(y0 + ry - cy)} ${n(x0 + rx - cx)} ${n(y0)} ${n(x0 + rx)} ${n(y0)}Z`;
}

function ellipseElement(ellipse, viewBounds, color) {
  const cx = ellipse.cx - viewBounds.x;
  const cy = ellipse.cy - viewBounds.y;
  return `<ellipse fill="${color}" cx="${formatCoordinate(cx)}" cy="${formatCoordinate(cy)}" rx="${formatCoordinate(ellipse.rx)}" ry="${formatCoordinate(ellipse.ry)}"/>`;
}

function distanceFromSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const projection = Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
  ));
  return Math.hypot(point.x - (start.x + projection * dx), point.y - (start.y + projection * dy));
}

function simplifyOpen(points, epsilon) {
  if (points.length <= 2) return points;

  let farthest = -1;
  let maximumDistance = epsilon;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceFromSegment(points[index], points[0], points.at(-1));
    if (distance > maximumDistance) {
      maximumDistance = distance;
      farthest = index;
    }
  }

  if (farthest < 0) return [points[0], points.at(-1)];
  return [
    ...simplifyOpen(points.slice(0, farthest + 1), epsilon).slice(0, -1),
    ...simplifyOpen(points.slice(farthest), epsilon),
  ];
}

function simplifyClosed(points, epsilon) {
  if (points.length <= 4) return points;

  let farthest = 1;
  let maximumDistance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const distance = (points[index].x - points[0].x) ** 2 + (points[index].y - points[0].y) ** 2;
    if (distance > maximumDistance) {
      maximumDistance = distance;
      farthest = index;
    }
  }

  const firstArc = points.slice(0, farthest + 1);
  const secondArc = [...points.slice(farthest), points[0]];
  const simplified = [
    ...simplifyOpen(firstArc, epsilon),
    ...simplifyOpen(secondArc, epsilon).slice(1, -1),
  ];
  return simplified.length >= 3 ? simplified : points;
}

function signedArea(points) {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return twiceArea / 2;
}

function formatCoordinate(value) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function contourToPath(points, bounds) {
  const simplified = simplifyClosed(points, SIMPLIFICATION_EPSILON);
  const commands = simplified.map((point, index) => {
    const x = formatCoordinate(point.x - bounds.x);
    const y = formatCoordinate(point.y - bounds.y);
    return `${index === 0 ? 'M' : 'L'}${x} ${y}`;
  });
  return `${commands.join('')}Z`;
}

function median(values) {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function toHex(value) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

function accentColor(coreChannels) {
  return `#${coreChannels.map((channel) => toHex(median(channel))).join('')}`;
}

function contourStats(loops) {
  return {
    contours: loops.length,
    holes: loops.filter((loop) => signedArea(loop) < 0).length,
    sourceBoundaryVertices: loops.reduce((sum, loop) => sum + loop.length, 0),
  };
}

async function main() {
  const sourceBytes = await readFile(sourcePath);
  const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');
  const { data, info } = await sharp(sourceBytes)
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 3) throw new Error(`Expected RGB source pixels; got ${info.channels} channels.`);

  const darkMask = new Uint8Array(info.width * info.height);
  const orangeMask = new Uint8Array(info.width * info.height);
  const accentSamples = [[], [], []];
  let brightPixelCount = 0;
  let orangePixelCount = 0;

  for (let pixel = 0; pixel < darkMask.length; pixel += 1) {
    const offset = pixel * 3;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const orange = isOrange(r, g, b);
    if (orange) {
      orangeMask[pixel] = 1;
    }
  }

  const removedOrangePixels = discardSmallComponents(
    orangeMask,
    info.width,
    info.height,
    ORANGE_MIN_COMPONENT_PIXELS,
  );

  for (let pixel = 0; pixel < darkMask.length; pixel += 1) {
    const offset = pixel * 3;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    if (orangeMask[pixel]) {
      orangePixelCount += 1;
      if (r > 200 && g > 50 && g < 160 && b < 50 && r > g * 1.5) {
        accentSamples[0].push(r);
        accentSamples[1].push(g);
        accentSamples[2].push(b);
      }
    } else if (luminance(r, g, b) >= WHITE_LUMINANCE_THRESHOLD) {
      darkMask[pixel] = 1;
      brightPixelCount += 1;
    }
  }

  if (!brightPixelCount || !orangePixelCount || !accentSamples[0].length) {
    throw new Error('Could not isolate both the light mark and its orange accent.');
  }

  const darkBounds = getBounds(darkMask, info.width, info.height);
  const orangeBounds = getBounds(orangeMask, info.width, info.height);
  const bounds = {
    x: Math.min(darkBounds.x, orangeBounds.x),
    y: Math.min(darkBounds.y, orangeBounds.y),
    width: Math.max(darkBounds.x + darkBounds.width, orangeBounds.x + orangeBounds.width)
      - Math.min(darkBounds.x, orangeBounds.x),
    height: Math.max(darkBounds.y + darkBounds.height, orangeBounds.y + orangeBounds.height)
      - Math.min(darkBounds.y, orangeBounds.y),
  };

  const darkContours = extractContours(darkMask, info.width, info.height);
  const orangeContours = extractContours(orangeMask, info.width, info.height);
  const darkComponents = findComponents(darkMask, info.width, info.height);
  const orangeComponents = findComponents(orangeMask, info.width, info.height);
  const capsules = darkComponents
    .filter((component) => component.width >= 160
      && component.width <= 195
      && component.height >= 50
      && component.height <= 82
      && component.width / component.height >= 2.2
      && component.y < 600)
    .map((component) => ({ ...component, fit: fittedCapsuleRadius(component) }));

  if (capsules.length !== 4) {
    throw new Error(`Expected four fitted capsule bars; found ${capsules.length}.`);
  }

  const dotCandidates = darkComponents.filter((component) => component.width >= 12
    && component.width <= 22
    && component.height >= 12
    && component.height <= 22
    && component.y + component.height <= DOT_REGION_BOTTOM);
  const dots = dotCandidates
    .map((component) => ({ ...component, fit: fittedEllipse(component, info.width, info.height) }))
    .filter((component) => component.fit.maskIoU >= DOT_MIN_ELLIPSE_IOU);
  const orangeDots = orangeComponents
    .filter((component) => component.area >= ORANGE_MIN_COMPONENT_PIXELS
      && component.width >= 18
      && component.width <= 36
      && component.height >= 18
      && component.height <= 36)
    .map((component) => ({ ...component, fit: fittedEllipse(component, info.width, info.height) }))
    .filter((component) => component.fit.maskIoU >= DOT_MIN_ELLIPSE_IOU);

  const orange = accentColor(accentSamples);
  const dotKeys = new Set(dots.map(componentKey));
  const orangeDotKeys = new Set(orangeDots.map(componentKey));
  const capsuleByKey = new Map(capsules.map((capsule) => [componentKey(capsule), capsule]));
  const darkPathParts = [];
  const orangePathParts = [];
  let fittedEyeCounters = 0;

  for (const loop of darkContours) {
    const loopBox = loopBounds(loop);
    const key = componentKey(loopBox);
    const area = signedArea(loop);

    if (area > 0 && dotKeys.has(key)) continue;

    const capsule = area > 0 ? capsuleByKey.get(key) : undefined;
    if (capsule) {
      darkPathParts.push(roundedRectanglePath(capsule, capsule.fit, bounds));
      continue;
    }

    const pupilHost = area < 0 && capsules.find((candidate) => candidate.y < 450
      && loopBox.width >= 18
      && loopBox.width <= 27
      && loopBox.height >= 18
      && loopBox.height <= 27
      && loopBox.x >= candidate.x + 8
      && loopBox.x + loopBox.width <= candidate.x + candidate.width - 8
      && loopBox.y >= candidate.y + 8
      && loopBox.y + loopBox.height <= candidate.y + candidate.height - 8);
    if (pupilHost) {
      darkPathParts.push(ellipsePath(loopBox, bounds));
      fittedEyeCounters += 1;
      continue;
    }

    darkPathParts.push(contourToPath(loop, bounds));
  }

  for (const loop of orangeContours) {
    const loopBox = loopBounds(loop);
    if (signedArea(loop) > 0 && orangeDotKeys.has(componentKey(loopBox))) continue;
    orangePathParts.push(contourToPath(loop, bounds));
  }

  if (fittedEyeCounters !== 2) {
    throw new Error(`Expected two rounded eye counters; fitted ${fittedEyeCounters}.`);
  }

  const darkPaths = darkPathParts.join('');
  const orangePaths = orangePathParts.join('');
  const darkEllipseElements = dots.map((component) => ellipseElement(component.fit, bounds, INK)).join('');
  const orangeEllipseElements = orangeDots
    .map((component) => ellipseElement(component.fit, bounds, orange))
    .join('');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}" role="img" aria-labelledby="zzoo-logo-title" aria-describedby="zzoo-logo-description">
  <title id="zzoo-logo-title">ZZOO 动动物园</title>
  <desc id="zzoo-logo-description">The original dotted ZZOO mark with two orange accents and the Chinese lettering 动动物园.</desc>
  <path fill="${INK}" fill-rule="evenodd" d="${darkPaths}"/>
  ${darkEllipseElements}
  <path fill="${orange}" fill-rule="evenodd" d="${orangePaths}"/>
  ${orangeEllipseElements}
</svg>
`;

  const provenance = {
    source: 'zzoo-original.png',
    sourceSha256: sourceHash,
    sourcePixels: { width: info.width, height: info.height },
    sourceMarkBounds: bounds,
    output: 'zzoo.svg',
    outputViewBox: `0 0 ${bounds.width} ${bounds.height}`,
    transparentBackground: true,
    colors: {
      ink: INK,
      orange: {
        value: orange,
        derivation: 'Per-channel median of the source orange core pixels.',
      },
    },
    tracing: {
      foreground: `Source luminance >= ${WHITE_LUMINANCE_THRESHOLD}/255; orange hue classified separately.`,
      contourMethod: 'Oriented pixel-boundary edges with right-turn tie-breaking at diagonal contacts.',
      simplification: `Closed-loop Ramer-Douglas-Peucker, ${SIMPLIFICATION_EPSILON} source pixels maximum deviation.`,
      fillRule: 'evenodd, preserving counters and enclosed transparent holes.',
      fittedGeometry: {
        capsuleBars: capsules.map((capsule) => ({
          sourceBounds: {
            x: capsule.x,
            y: capsule.y,
            width: capsule.width,
            height: capsule.height,
          },
          cornerRadius: Number(capsule.fit.radius.toFixed(2)),
          rowBoundaryRmse: Number(capsule.fit.rowBoundaryRmse.toFixed(3)),
          curve: 'Cubic rounded rectangle fitted to source row extents.',
        })),
        darkDotEllipses: dots.length,
        orangeDotEllipses: orangeDots.length,
        preservedAsTracedPaths: dotCandidates.length - dots.length,
        minimumEllipseMaskIoU: DOT_MIN_ELLIPSE_IOU,
        dotRegionBottom: DOT_REGION_BOTTOM,
        eyeCounters: fittedEyeCounters,
        chineseGlyphs: 'Kept on the traced path contour; not classified as dots or fitted geometry.',
      },
      sourceForegroundPixels: brightPixelCount,
      sourceOrangePixels: orangePixelCount,
      discardedOrangeNoisePixels: removedOrangePixels,
      minimumOrangeComponentPixels: ORANGE_MIN_COMPONENT_PIXELS,
      dark: contourStats(darkContours),
      orange: contourStats(orangeContours),
    },
  };

  await writeFile(svgPath, svg, 'utf8');
  await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${path.relative(root, svgPath)} (${bounds.width}x${bounds.height}, ${capsules.length} fitted capsules, ${dots.length + orangeDots.length} fitted ellipses).`);
  console.log(`Source SHA-256: ${sourceHash}`);
  console.log(`Ink ${INK}; source-derived orange ${orange}; transparent background.`);
}

await main();
