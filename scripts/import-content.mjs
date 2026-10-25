import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, isAbsolute, join, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const EXPECTED_REGISTRY_FIELDS = ['env', 'id', 'manifest', 'pages', 'ref', 'repository'];
const REQUIRED_MANIFEST_FIELDS = ['id', 'tagline', 'title'];
const OPTIONAL_MANIFEST_FIELDS = ['excludes', 'features', 'includes', 'modelUrl', 'priceCny', 'status'];
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_PAGE_BYTES = 256 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 1024 * 1024;
const MAX_GIT_OUTPUT_BYTES = MAX_PAGE_BYTES + 1;
const OUTPUT_METADATA = 'src/data/generated-projects.json';
const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENV_PATTERN = /^ZZOO_[A-Z0-9_]{1,59}$/;
const SAFE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

function fail(message) {
  throw new Error(message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected, label) {
  if (!isRecord(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} has missing or unsupported fields.`);
  }
}

function hasAllowedKeys(value, required, optional, label) {
  if (!isRecord(value)) fail(`${label} must be an object.`);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !allowed.has(key))) {
    fail(`${label} has missing or unsupported fields.`);
  }
}

function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail(`${label} must be valid UTF-8.`);
  }
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(decodeUtf8(bytes, label));
  } catch (error) {
    if (error instanceof SyntaxError) fail(`${label} is not valid JSON.`);
    throw error;
  }
}

function validateSafeRelativePath(value, label, extension) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 1024 ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes(':') ||
    value
      .split('/')
      .some((segment) => !segment || segment === '.' || segment === '..' || !SAFE_PATH_SEGMENT_PATTERN.test(segment)) ||
    (extension && !value.toLowerCase().endsWith(extension))
  ) {
    fail(`${label} must be a safe relative path${extension ? ` ending in ${extension}` : ''} without traversal.`);
  }
  return value;
}

function validateRegistry(registry) {
  if (!Array.isArray(registry) || registry.length === 0) {
    fail('source-registry.json must contain a non-empty array of project entries.');
  }

  const ids = new Set();
  const environments = new Set();
  return registry.map((entry, projectIndex) => {
    hasExactKeys(entry, EXPECTED_REGISTRY_FIELDS, `Registry entry ${projectIndex + 1}`);
    if (typeof entry.id !== 'string' || !PROJECT_ID_PATTERN.test(entry.id) || entry.id.length > 64) {
      fail(`Registry entry ${projectIndex + 1} id must be a safe lowercase project identifier.`);
    }
    if (entry.id === 'index') fail('Registry project id "index" is reserved for the project landing route.');
    if (ids.has(entry.id)) fail(`Registry contains duplicate project id: ${entry.id}.`);
    ids.add(entry.id);

    if (entry.repository !== null && (typeof entry.repository !== 'string' || entry.repository.trim() === '')) {
      fail(`Registry repository for ${entry.id} must be null or a local repository path.`);
    }
    if (typeof entry.ref !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(entry.ref)) {
      fail(`Registry ref for ${entry.id} must be a full hexadecimal Git commit SHA.`);
    }
    validateSafeRelativePath(entry.manifest, `Registry manifest for ${entry.id}`, '.json');

    if (typeof entry.env !== 'string' || !ENV_PATTERN.test(entry.env)) {
      fail(`Registry env for ${entry.id} must be a safe ZZOO_ environment variable name.`);
    }
    if (environments.has(entry.env)) fail(`Registry contains duplicate environment variable: ${entry.env}.`);
    environments.add(entry.env);

    if (!Array.isArray(entry.pages) || entry.pages.length === 0) {
      fail(`Registry pages for ${entry.id} must be a non-empty explicit allowlist.`);
    }
    const slugs = new Set();
    const sources = new Set([entry.manifest]);
    const pages = entry.pages.map((page, pageIndex) => {
      hasExactKeys(page, ['slug', 'source'], `Registry page ${pageIndex + 1} for ${entry.id}`);
      validateSafeRelativePath(page.source, `Registry page source for ${entry.id}`, '.md');
      if (typeof page.slug !== 'string' || page.slug.length > 64 || !SLUG_PATTERN.test(page.slug)) {
        fail(`Registry page slug for ${entry.id} must be a safe lowercase URL segment.`);
      }
      if (page.slug === 'index') fail(`Registry page slug "index" is reserved for the ${entry.id} landing route.`);
      if (slugs.has(page.slug)) fail(`Registry contains duplicate page slug for ${entry.id}: ${page.slug}.`);
      if (sources.has(page.source)) fail(`Registry contains duplicate source path for ${entry.id}: ${page.source}.`);
      slugs.add(page.slug);
      sources.add(page.source);
      return { source: page.source, slug: page.slug };
    });

    return { ...entry, pages };
  });
}

function isRemoteRepository(value) {
  return /^(?:https?:\/\/|ssh:\/\/|git:\/\/|file:\/\/|[^/\\@]+@[^:]+:)/i.test(value);
}

function resolveSourceRepository(entry, workspaceRoot, environment) {
  const configured = entry.repository ?? environment[entry.env];
  if (typeof configured !== 'string' || configured.trim() === '') {
    fail(`Set ${entry.env} to a local Git repository containing the pinned commit.`);
  }
  if (isRemoteRepository(configured)) {
    fail(`Remote Git sources are not supported; provide a local repository path through ${entry.env}.`);
  }

  const candidate = isAbsolute(configured) ? configured : resolve(workspaceRoot, configured);
  try {
    const repository = realpathSync(candidate);
    if (!lstatSync(repository).isDirectory()) fail('The configured local Git source is not a directory.');
    return repository;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('The configured')) throw error;
    fail(`The local Git source configured in ${entry.env} does not exist.`);
  }
}

function git(repository, args, { maxBuffer = MAX_GIT_OUTPUT_BYTES } = {}) {
  const childEnvironment = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.toUpperCase().startsWith('GIT_')) childEnvironment[key] = value;
  }
  childEnvironment.GIT_TERMINAL_PROMPT = '0';
  childEnvironment.GIT_OPTIONAL_LOCKS = '0';
  childEnvironment.GIT_CONFIG_NOSYSTEM = '1';

  const result = spawnSync('git', ['-C', repository, '--no-pager', '-c', 'core.quotepath=false', ...args], {
    encoding: null,
    env: childEnvironment,
    maxBuffer,
    windowsHide: true,
  });
  if (result.error) fail('Could not run Git to read the pinned local source.');
  return result;
}

function requireCommit(repository, ref) {
  const result = git(repository, ['cat-file', '-t', ref], { maxBuffer: 1024 });
  if (result.status !== 0 || result.stdout.toString('ascii').trim() !== 'commit') {
    fail('Pinned source commit was not found as a commit in the local repository.');
  }
}

function requireRegularGitFile(repository, ref, sourcePath) {
  const result = git(repository, ['ls-tree', '-z', ref, '--', sourcePath], {
    maxBuffer: 4096,
  });
  if (result.status !== 0) fail('Could not inspect the pinned Git tree.');

  const entries = result.stdout.toString('utf8').split('\0').filter(Boolean);
  if (entries.length !== 1) fail(`Pinned source file is missing or ambiguous: ${sourcePath}.`);
  const tab = entries[0].indexOf('\t');
  if (tab < 0 || entries[0].slice(tab + 1) !== sourcePath) {
    fail(`Pinned source file is missing or ambiguous: ${sourcePath}.`);
  }
  const [mode, type] = entries[0].slice(0, tab).split(' ');
  if (type !== 'blob' || mode !== '100644') {
    fail(`Pinned source file must be a non-executable regular file (Git mode 100644): ${sourcePath}.`);
  }
}

function readPinnedFile(repository, ref, sourcePath, maxBytes) {
  requireRegularGitFile(repository, ref, sourcePath);
  const result = git(repository, ['show', '--no-ext-diff', '--no-textconv', `${ref}:${sourcePath}`]);
  if (result.status !== 0) fail(`Could not read pinned source file: ${sourcePath}.`);
  if (result.stdout.length > maxBytes) fail(`Pinned source file exceeds its ${maxBytes}-byte limit: ${sourcePath}.`);
  if (result.stdout.includes(0)) fail(`Pinned source file contains binary data: ${sourcePath}.`);
  return result.stdout;
}

function validatePlainText(value, label, { maxLength = 500 } = {}) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > maxLength) {
    fail(`${label} must be a non-empty string of at most ${maxLength} characters.`);
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F<>]/.test(value)) {
    fail(`${label} contains unsupported control characters or HTML markup.`);
  }
  return value;
}

function validateManifest(manifest, projectId) {
  hasAllowedKeys(manifest, REQUIRED_MANIFEST_FIELDS, OPTIONAL_MANIFEST_FIELDS, `Product manifest for ${projectId}`);
  if (manifest.id !== projectId) fail('Product manifest id does not match its registry id.');
  const clean = {
    id: projectId,
    title: validatePlainText(manifest.title, 'Manifest title', {
      maxLength: 160,
    }),
    tagline: validatePlainText(manifest.tagline, 'Manifest tagline', {
      maxLength: 300,
    }),
  };
  if (Object.hasOwn(manifest, 'priceCny')) {
    const priceCny = manifest.priceCny;
    if (typeof priceCny !== 'number' || !Number.isFinite(priceCny) || priceCny < 0 || priceCny > 100_000_000) {
      fail('Manifest priceCny must be a finite number between 0 and 100000000.');
    }
    clean.priceCny = priceCny;
  }
  if (Object.hasOwn(manifest, 'status')) {
    clean.status = validatePlainText(manifest.status, 'Manifest status', {
      maxLength: 80,
    });
  }
  for (const field of ['includes', 'excludes', 'features']) {
    if (Object.hasOwn(manifest, field)) clean[field] = validateTextList(manifest[field], `Manifest ${field}`);
  }
  if (Object.hasOwn(manifest, 'modelUrl')) {
    clean.modelUrl = manifest.modelUrl;
  }
  if (Object.hasOwn(clean, 'modelUrl') && clean.modelUrl !== null) {
    if (typeof clean.modelUrl !== 'string' || clean.modelUrl.length > 2048) {
      fail('Manifest modelUrl must be null or a safe local/HTTPS URL.');
    }
    let decodedModelUrl;
    try {
      decodedModelUrl = decodeURIComponent(clean.modelUrl);
    } catch {
      fail('Manifest modelUrl must be null or a safe local/HTTPS URL.');
    }
    if (/[\s\u0000-\u001F<>]/.test(decodedModelUrl)) {
      fail('Manifest modelUrl must be null or a safe local/HTTPS URL.');
    }
    let decodedLocalPath = null;
    if (clean.modelUrl.startsWith('/') && !clean.modelUrl.startsWith('//') && !clean.modelUrl.includes('\\')) {
      try {
        decodedLocalPath = decodeURIComponent(clean.modelUrl.split(/[?#]/, 1)[0]);
      } catch {
        fail('Manifest modelUrl must be null or a safe local/HTTPS URL.');
      }
    }
    const localUrl =
      decodedLocalPath !== null &&
      !/[\s\u0000-\u001F<>]/.test(decodedLocalPath) &&
      !decodedLocalPath.split('/').some((segment) => segment === '.' || segment === '..');
    let httpsUrl = false;
    if (/^https:\/\//i.test(clean.modelUrl)) {
      try {
        const parsedUrl = new URL(clean.modelUrl);
        httpsUrl =
          parsedUrl.protocol === 'https:' &&
          parsedUrl.hostname !== '' &&
          parsedUrl.username === '' &&
          parsedUrl.password === '';
      } catch {
        httpsUrl = false;
      }
    }
    if (!localUrl && !httpsUrl) fail('Manifest modelUrl must be null or a safe local/HTTPS URL.');
  }
  return clean;
}

function validateTextList(value, label) {
  if (!Array.isArray(value) || value.length > 100) {
    fail(`${label} must be an array with at most 100 entries.`);
  }
  return value.map((item, index) => validatePlainText(item, `${label}[${index}]`, { maxLength: 300 }));
}

function parseFrontmatterScalar(value, key, sourcePath) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"')) {
    try {
      return validatePlainText(JSON.parse(trimmed), `${sourcePath} frontmatter ${key}`, { maxLength: 300 });
    } catch (error) {
      if (error instanceof Error && error.message.includes('frontmatter')) throw error;
      fail(`${sourcePath} has an invalid quoted frontmatter value for ${key}.`);
    }
  }
  if (trimmed.startsWith("'")) {
    const match = /^'((?:[^']|'')*)'$/.exec(trimmed);
    if (!match) fail(`${sourcePath} has an invalid quoted frontmatter value for ${key}.`);
    return validatePlainText(match[1].replaceAll("''", "'"), `${sourcePath} frontmatter ${key}`, { maxLength: 300 });
  }
  if (!trimmed || /^[\[\]{}|>&*!%@`]/.test(trimmed) || /:\s|\s+#/.test(trimmed)) {
    fail(`${sourcePath} frontmatter ${key} must be a plain string scalar.`);
  }
  return validatePlainText(trimmed, `${sourcePath} frontmatter ${key}`, {
    maxLength: 300,
  });
}

function parseMarkdownPage(bytes, page, projectId, pages) {
  const sourcePath = page.source;
  const text = decodeUtf8(bytes, sourcePath).replaceAll('\r\n', '\n');
  const lines = text.split('\n');
  if (lines[0] !== '---') fail(`${sourcePath} must begin with simple YAML frontmatter.`);
  const closingIndex = lines.indexOf('---', 1);
  if (closingIndex < 0) fail(`${sourcePath} has no closing frontmatter delimiter.`);

  const frontmatter = {};
  for (const line of lines.slice(1, closingIndex)) {
    if (line.trim() === '') continue;
    const match = /^(title|description):[ \t]*(.*)$/.exec(line);
    if (!match) fail(`${sourcePath} frontmatter permits only title and description string fields.`);
    if (Object.hasOwn(frontmatter, match[1])) fail(`${sourcePath} has duplicate ${match[1]} frontmatter.`);
    frontmatter[match[1]] = parseFrontmatterScalar(match[2], match[1], sourcePath);
  }
  if (!frontmatter.title) fail(`${sourcePath} must define a title in frontmatter.`);

  const body = lines.slice(closingIndex + 1).join('\n');
  const rewritten = rewriteAndValidateBody(body, page, pages, projectId, sourcePath);
  const titleLine = `title: ${JSON.stringify(frontmatter.title)}`;
  const descriptionLine = frontmatter.description ? `\ndescription: ${JSON.stringify(frontmatter.description)}` : '';
  const output = `---\n${titleLine}${descriptionLine}\n---\n${rewritten.replace(/^\n+/, '')}`;
  return {
    title: frontmatter.title,
    description: frontmatter.description ?? null,
    output,
  };
}

function splitMarkdownDestination(raw, sourcePath) {
  const trimmed = raw.trim();
  const angle = /^<([^<>]*)>([\s\S]*)$/.exec(trimmed);
  const plain = angle ? null : /^(\S+)([\s\S]*)$/.exec(trimmed);
  const destination = angle ? angle[1] : plain?.[1];
  const suffix = angle ? angle[2] : (plain?.[2] ?? '');
  if (!destination || /[<>\u0000-\u0020]/.test(destination)) {
    fail(`${sourcePath} contains an unsupported Markdown link destination.`);
  }
  return { destination, suffix, angle: Boolean(angle) };
}

function rewriteDestination(raw, currentPage, pages, projectId, sourcePath, image = false) {
  const { destination, suffix, angle } = splitMarkdownDestination(raw, sourcePath);
  // Curated site-owned raster media only, scoped to the importing project.
  // Never allow SVG, traversal, query strings or arbitrary local paths here.
  if (image && new RegExp(`^/media/${projectId}/[a-z0-9]+(?:-[a-z0-9]+)*\\.(?:webp|png|jpg)$`).test(destination)) return raw;
  if (destination.startsWith('#')) return raw;
  if (/^https:\/\//i.test(destination) || /^mailto:/i.test(destination)) return raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(destination) || destination.startsWith('//')) {
    fail(`${sourcePath} contains a disallowed link protocol or network-path URL.`);
  }
  if (destination.includes('\\')) fail(`${sourcePath} contains a backslash in a relative link.`);

  const suffixIndex = destination.search(/[?#]/);
  const rawPath = suffixIndex < 0 ? destination : destination.slice(0, suffixIndex);
  const urlSuffix = suffixIndex < 0 ? '' : destination.slice(suffixIndex);
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    fail(`${sourcePath} contains an invalid encoded Markdown link.`);
  }
  if (!decodedPath || decodedPath.startsWith('/') || !decodedPath.toLowerCase().endsWith('.md')) {
    fail(`${sourcePath} may link only to an allowlisted relative .md page.`);
  }
  const normalized = resolveSourceDocPath(currentPage, decodedPath);
  const targetPage = pages.find((page) => page.source === normalized);
  if (!targetPage) fail(`${sourcePath} links outside the ${projectId} page allowlist.`);

  const route = `/docs/${projectId}/${targetPage.slug}/`;
  const rewritten = `${route}${urlSuffix}`;
  return angle ? `<${rewritten}>${suffix}` : `${rewritten}${suffix}`;
}

function resolveSourceDocPath(currentPage, relativePath) {
  return posix.normalize(posix.join(posix.dirname(currentPage.source), relativePath));
}

function rewriteAndValidateBody(body, currentPage, pages, projectId, sourcePath) {
  const lines = body.split('\n');
  let fence = null;
  const output = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceStart = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      output.push(line);
      if (fenceStart && fenceStart[1][0] === fence.character && fenceStart[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fenceStart) {
      fence = { character: fenceStart[1][0], length: fenceStart[1].length };
      output.push(line);
      continue;
    }

    const location = `${sourcePath}:${index + 1}`;
    if (/^\s*(?:import|export)\b/.test(line)) fail(`${location} contains executable import/export syntax.`);
    if (/<(?:javascript|data|vbscript):/i.test(line)) fail(`${location} contains an unsafe URL.`);
    const withoutSafeAutolinks = line.replace(/<(?:https?:\/\/|mailto:)[^>]*>/gi, '');
    if (/<!--|<\/?[A-Za-z][A-Za-z0-9:-]*(?=[\s/>]|$)/.test(withoutSafeAutolinks)) {
      fail(`${location} contains raw HTML or an MDX component.`);
    }
    if (/\{[^{}\n]*\}/.test(line)) fail(`${location} contains an MDX expression.`);

    let rewritten = line.replace(/(!?\[[^\]\n]*\]\()([^()\n]*)(\))/g, (_all, prefix, target, close) => {
      return `${prefix}${rewriteDestination(target, currentPage, pages, projectId, location, prefix.startsWith('!'))}${close}`;
    });
    const definition = /^(\s*\[[^\]\n]+\]:\s+)(.*)$/.exec(rewritten);
    if (definition) {
      rewritten = `${definition[1]}${rewriteDestination(definition[2], currentPage, pages, projectId, location)}`;
    }
    output.push(rewritten);
  }
  if (fence) fail(`${sourcePath} contains an unclosed Markdown code fence.`);
  return output.join('\n');
}

function readRegistry(workspaceRoot) {
  const registryPath = join(workspaceRoot, 'source-registry.json');
  let stat;
  try {
    stat = lstatSync(registryPath);
  } catch {
    fail('source-registry.json is missing.');
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('source-registry.json must be a regular file.');
  if (stat.size > 32 * 1024) fail('source-registry.json exceeds its 32768-byte limit.');
  return validateRegistry(parseJson(readFileSync(registryPath), 'source-registry.json'));
}

function inspectOutputPath(workspaceRoot, relativePath) {
  const segments = relativePath.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    fail('Internal generated output path is invalid.');
  }
  let current = workspaceRoot;
  for (const segment of segments.slice(0, -1)) {
    current = join(current, segment);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        fail(`Generated output parent is not a safe directory: ${relativePath}.`);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      break;
    }
  }
  const target = join(workspaceRoot, ...segments);
  try {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      fail(`Generated output target is not a regular file: ${relativePath}.`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function ensureOutputDirectory(workspaceRoot, relativeDirectory) {
  let current = workspaceRoot;
  for (const segment of relativeDirectory.split('/')) {
    current = join(current, segment);
    try {
      mkdirSync(current);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      fail(`Generated output parent is not a safe directory: ${relativeDirectory}.`);
    }
  }
}

function writeOutputsAtomically(workspaceRoot, outputs) {
  for (const relativePath of outputs.keys()) inspectOutputPath(workspaceRoot, relativePath);

  const directories = new Set(
    [...outputs.keys()].map((relativePath) => relativePath.slice(0, relativePath.lastIndexOf('/'))),
  );
  for (const directory of directories) ensureOutputDirectory(workspaceRoot, directory);

  const staged = [];
  try {
    for (const [relativePath, content] of outputs) {
      const destination = join(workspaceRoot, ...relativePath.split('/'));
      const temporary = join(dirname(destination), `.${basename(destination)}.${randomUUID()}.tmp`);
      const descriptor = openSync(temporary, 'wx', 0o644);
      try {
        writeFileSync(descriptor, content, 'utf8');
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
      staged.push({ temporary, destination });
    }
    for (const item of staged) renameSync(item.temporary, item.destination);
  } catch (error) {
    for (const item of staged) {
      try {
        unlinkSync(item.temporary);
      } catch {
        // Only the exact temporary files created by this invocation are cleaned up.
      }
    }
    throw error;
  }
}

export function importContent({ workspaceRoot = process.cwd(), environment = process.env } = {}) {
  const root = realpathSync(workspaceRoot);
  const entries = readRegistry(root);
  const importedProjects = [];
  let totalBytes = 0;
  let pageCount = 0;
  for (const entry of entries) {
    const repository = resolveSourceRepository(entry, root, environment);
    requireCommit(repository, entry.ref);

    const manifestBytes = readPinnedFile(repository, entry.ref, entry.manifest, MAX_MANIFEST_BYTES);
    totalBytes += manifestBytes.length;
    if (totalBytes > MAX_TOTAL_SOURCE_BYTES) fail('Pinned allowlisted content exceeds the 1 MiB total size limit.');
    const manifest = validateManifest(parseJson(manifestBytes, `Pinned product manifest for ${entry.id}`), entry.id);

    const pages = [];
    for (const page of entry.pages) {
      const bytes = readPinnedFile(repository, entry.ref, page.source, MAX_PAGE_BYTES);
      totalBytes += bytes.length;
      if (totalBytes > MAX_TOTAL_SOURCE_BYTES) fail('Pinned allowlisted content exceeds the 1 MiB total size limit.');
      pages.push({
        ...page,
        ...parseMarkdownPage(bytes, page, entry.id, entry.pages),
      });
    }
    pageCount += pages.length;
    importedProjects.push({ manifest, pages, id: entry.id });
  }

  const outputs = new Map();
  // Removed allowlist entries are not deleted; their old generated files can remain stale.
  for (const project of importedProjects) {
    const outputDocDirectory = `src/content/docs/docs/${project.id}`;
    for (const page of project.pages) outputs.set(`${outputDocDirectory}/${page.slug}.md`, page.output);
  }
  outputs.set(
    OUTPUT_METADATA,
    `${JSON.stringify(
      importedProjects.map(({ manifest, pages, id }) => ({
        ...manifest,
        docs: pages.map(({ slug, title, description }) => ({
          slug,
          title,
          description,
          href: `/docs/${id}/${slug}/`,
        })),
      })),
      null,
      2,
    )}\n`,
  );

  writeOutputsAtomically(root, outputs);
  return {
    projects: importedProjects.length,
    pages: pageCount,
    files: outputs.size,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = importContent();
    console.log(`Imported ${result.projects} projects and ${result.pages} pages; generated metadata.`);
  } catch (error) {
    console.error(`Content import failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exitCode = 1;
  }
}
