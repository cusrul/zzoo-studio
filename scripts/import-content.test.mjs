import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { importContent } from './import-content.mjs';

const temporaryRoots = [];

after(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
});

function runGit(repository, hooks, args, input) {
  const result = spawnSync(
    'git',
    ['-C', repository, '-c', `core.hooksPath=${hooks}`, '-c', 'commit.gpgsign=false', ...args],
    { encoding: 'utf8', input, windowsHide: true },
  );
  if (result.error || result.status !== 0) {
    throw new Error(`Test Git command failed: ${result.stderr || result.error?.message || result.status}`);
  }
  return result.stdout.trim();
}

function createWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'zzoo-import-content-'));
  temporaryRoots.push(root);
  const workspace = join(root, 'workspace');
  const hooks = join(root, 'empty-hooks');
  mkdirSync(workspace);
  mkdirSync(hooks);
  return { root, workspace, hooks };
}

function createProject(
  context,
  { id = 'crabit', manifestPath = 'showcase/product.json', pages = defaultPages(), manifest } = {},
) {
  const repository = join(context.root, `${id}-product`);
  mkdirSync(repository);
  runGit(repository, context.hooks, ['init', '--quiet', '--object-format=sha1']);
  runGit(repository, context.hooks, ['config', 'user.name', 'Importer Test']);
  runGit(repository, context.hooks, ['config', 'user.email', 'importer-test@example.invalid']);

  const product = manifest ?? {
    id,
    title: id === 'crabit' ? 'Crabit' : `${id} project`,
    tagline: 'A compact maker device',
    priceCny: 399,
    status: 'prototype',
    includes: ['Device'],
    excludes: ['Shipping'],
    features: ['Open source'],
    modelUrl: `/models/${id}.glb`,
  };
  writeSourceFile(repository, manifestPath, `${JSON.stringify(product, null, 2)}\n`);
  for (const page of pages) writeSourceFile(repository, page.source, page.content);

  runGit(repository, context.hooks, ['add', '--all']);
  runGit(repository, context.hooks, ['commit', '--quiet', '-m', 'initial project content']);
  const ref = runGit(repository, context.hooks, ['rev-parse', 'HEAD']);
  const envSuffix = id.toUpperCase().replaceAll('-', '_');
  const entry = {
    id,
    repository: null,
    ref,
    manifest: manifestPath,
    pages: pages.map(({ source, slug }) => ({ source, slug })),
    env: `ZZOO_${envSuffix}_SOURCE`,
  };
  return { entry, repository, ref };
}

function createFixture(options = {}) {
  const context = createWorkspace();
  const project = createProject(context, options);
  writeRegistry(context.workspace, [project.entry]);
  return { ...context, ...project, projects: [project] };
}

function defaultPages() {
  return [
    {
      source: 'showcase/docs/start.md',
      slug: 'start',
      content: '---\ntitle: Start\ndescription: First steps\n---\n\nRead [connect](./connect.md) next.\n',
    },
    {
      source: 'showcase/docs/connect.md',
      slug: 'connect',
      content: '---\ntitle: Connect\n---\n\nConnect the device.\n',
    },
    {
      source: 'showcase/docs/update.md',
      slug: 'update',
      content: '---\ntitle: Update\n---\n\nUpdate it safely.\n',
    },
    {
      source: 'showcase/docs/develop.md',
      slug: 'develop',
      content: '---\ntitle: Develop\n---\n\nBuild from source.\n',
    },
  ];
}

function writeSourceFile(repository, relativePath, content) {
  const filePath = join(repository, ...relativePath.split('/'));
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

function writeRegistry(workspace, entries) {
  writeFileSync(join(workspace, 'source-registry.json'), `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
}

function environmentFor(fixture) {
  return Object.fromEntries(fixture.projects.map(({ entry, repository }) => [entry.env, repository]));
}

function invoke(fixture) {
  return importContent({
    workspaceRoot: fixture.workspace,
    environment: environmentFor(fixture),
  });
}

function readGenerated(fixture, file) {
  return readFileSync(join(fixture.workspace, ...file.split('/')), 'utf8');
}

function exists(path) {
  try {
    readFileSync(path);
    return true;
  } catch (error) {
    return error?.code !== 'ENOENT';
  }
}

test('curated raster images are scoped to their project and unsafe media paths fail closed', () => {
  for (const [image, allowed] of [
    ['/media/crabit/parts.webp', true],
    ['/media/other/parts.webp', false],
    ['/media/crabit/parts.svg', false],
    ['/media/crabit/../parts.webp', false],
  ]) {
    const fixture = createFixture({pages: [{source: 'showcase/docs/start.md', slug: 'start', content: `---\ntitle: Photo\n---\n\n![Parts](${image})\n`}]});
    if (allowed) {
      invoke(fixture);
      assert.ok(readGenerated(fixture, 'src/content/docs/docs/crabit/start.md').includes(image));
    } else {
      assert.throws(() => invoke(fixture), /allowlisted relative/);
    }
  }
});

test('reads the pinned commit, not newer commits or dirty worktree content', () => {
  const fixture = createFixture();
  const startFile = join(fixture.repository, 'showcase', 'docs', 'start.md');
  writeFileSync(startFile, '---\ntitle: Start\n---\n\nNEW COMMITTED content.\n', 'utf8');
  runGit(fixture.repository, fixture.hooks, ['add', '--', 'showcase/docs/start.md']);
  runGit(fixture.repository, fixture.hooks, ['commit', '--quiet', '-m', 'newer product content']);
  const newerRef = runGit(fixture.repository, fixture.hooks, ['rev-parse', 'HEAD']);
  writeFileSync(startFile, '---\ntitle: Start\n---\n\nDIRTY WORKTREE content.\n', 'utf8');

  assert.deepEqual(invoke(fixture), { projects: 1, pages: 4, files: 5 });
  const pinned = readGenerated(fixture, 'src/content/docs/docs/crabit/start.md');
  assert.match(pinned, /First steps/);
  assert.doesNotMatch(pinned, /NEW COMMITTED|DIRTY WORKTREE/);
  assert.match(pinned, /\]\(\/docs\/crabit\/connect\/\)/);

  writeRegistry(fixture.workspace, [{ ...fixture.entry, ref: newerRef }]);
  invoke(fixture);
  const updatedPin = readGenerated(fixture, 'src/content/docs/docs/crabit/start.md');
  assert.match(updatedPin, /NEW COMMITTED/);
  assert.doesNotMatch(updatedPin, /DIRTY WORKTREE/);
  const projects = JSON.parse(readGenerated(fixture, 'src/data/generated-projects.json'));
  assert.equal(projects[0].docs.length, 4);
  assert.equal(projects[0].docs[0].href, '/docs/crabit/start/');
});

test('imports multiple projects with distinct source layouts and optional manifest fields', () => {
  const context = createWorkspace();
  const crabit = createProject(context);
  const vectorKit = createProject(context, {
    id: 'vector-kit',
    manifestPath: 'catalog/project.json',
    pages: [
      {
        source: 'handbook/intro.md',
        slug: 'overview',
        content: '---\ntitle: Overview\n---\n\nContinue to [setup](./setup.md).\n',
      },
      {
        source: 'handbook/setup.md',
        slug: 'setup',
        content: '---\ntitle: Setup\n---\n\nConfigure the kit.\n',
      },
    ],
    manifest: {
      id: 'vector-kit',
      title: 'Vector Kit',
      tagline: 'A second independent project',
    },
  });
  const fixture = { ...context, projects: [crabit, vectorKit] };
  writeRegistry(
    context.workspace,
    fixture.projects.map(({ entry }) => entry),
  );

  assert.deepEqual(invoke(fixture), { projects: 2, pages: 6, files: 7 });
  assert.match(readGenerated(fixture, 'src/content/docs/docs/crabit/start.md'), /\/docs\/crabit\/connect\//);
  assert.match(readGenerated(fixture, 'src/content/docs/docs/vector-kit/overview.md'), /\/docs\/vector-kit\/setup\//);
  const projects = JSON.parse(readGenerated(fixture, 'src/data/generated-projects.json'));
  assert.deepEqual(
    projects.map(({ id }) => id),
    ['crabit', 'vector-kit'],
  );
  assert.equal(projects[1].title, 'Vector Kit');
  assert.equal(projects[1].docs[0].href, '/docs/vector-kit/overview/');
  assert.equal(Object.hasOwn(projects[1], 'priceCny'), false);
  assert.equal(Object.hasOwn(projects[1], 'modelUrl'), false);
});

test('rejects duplicate project IDs, environment names, and page slugs', () => {
  const fixture = createFixture();
  const entry = fixture.entry;
  writeRegistry(fixture.workspace, [entry, { ...entry }]);
  assert.throws(() => invoke(fixture), /duplicate project id/);

  writeRegistry(fixture.workspace, [entry, { ...entry, id: 'other-project' }]);
  assert.throws(() => invoke(fixture), /duplicate environment variable/);

  const duplicateSlug = entry.pages.map((page) => ({ ...page }));
  duplicateSlug[1].slug = duplicateSlug[0].slug;
  writeRegistry(fixture.workspace, [{ ...entry, pages: duplicateSlug }]);
  assert.throws(() => invoke(fixture), /duplicate page slug/);
  assert.equal(exists(join(fixture.workspace, 'src')), false);
});

test('reserves the index project ID and document slug for landing routes', () => {
  const fixture = createFixture();
  writeRegistry(fixture.workspace, [{ ...fixture.entry, id: 'index' }]);
  assert.throws(() => invoke(fixture), /project id "index" is reserved/);

  const pages = fixture.entry.pages.map((page) => ({ ...page }));
  pages[0].slug = 'index';
  writeRegistry(fixture.workspace, [{ ...fixture.entry, pages }]);
  assert.throws(() => invoke(fixture), /page slug "index" is reserved/);
  assert.equal(exists(join(fixture.workspace, 'src')), false);
});

test('rejects unsafe environment names and manifest or page paths before generating files', () => {
  const fixture = createFixture();
  const entry = fixture.entry;
  const cases = [
    { ...entry, env: 'PATH' },
    { ...entry, env: 'ZZOO_BAD-NAME' },
    { ...entry, manifest: '../outside.json' },
    { ...entry, manifest: 'C:/outside.json' },
    {
      ...entry,
      pages: [{ ...entry.pages[0], source: '../outside.md' }, ...entry.pages.slice(1)],
    },
    {
      ...entry,
      pages: [{ ...entry.pages[0], source: '/outside.md' }, ...entry.pages.slice(1)],
    },
    {
      ...entry,
      pages: [{ ...entry.pages[0], source: 'showcase\\..\\outside.md' }, ...entry.pages.slice(1)],
    },
  ];
  for (const invalidEntry of cases) {
    writeRegistry(fixture.workspace, [invalidEntry]);
    assert.throws(() => invoke(fixture), /safe ZZOO_|safe relative path/);
    assert.equal(exists(join(fixture.workspace, 'src')), false);
  }
});

test('rejects MDX imports and raw HTML before any generated file is written', () => {
  for (const malicious of [
    '---\ntitle: Update\n---\n\nimport Widget from "./Widget.astro";\n',
    '---\ntitle: Update\n---\n\n<script>alert(1)</script>\n',
    '---\ntitle: Update\n---\n\n<iframe\n src="https://example.invalid"\n>\n',
  ]) {
    const fixture = createFixture();
    writeSourceFile(fixture.repository, 'showcase/docs/update.md', malicious);
    runGit(fixture.repository, fixture.hooks, ['add', '--', 'showcase/docs/update.md']);
    runGit(fixture.repository, fixture.hooks, ['commit', '--quiet', '-m', 'unsafe page fixture']);
    writeRegistry(fixture.workspace, [
      {
        ...fixture.entry,
        ref: runGit(fixture.repository, fixture.hooks, ['rev-parse', 'HEAD']),
      },
    ]);

    assert.throws(() => invoke(fixture), /executable import\/export syntax|raw HTML or an MDX component/);
    assert.equal(exists(join(fixture.workspace, 'src')), false);
  }
});

test('fails closed for a missing commit and a missing allowlisted page', () => {
  const missingCommit = createFixture();
  writeRegistry(missingCommit.workspace, [{ ...missingCommit.entry, ref: 'f'.repeat(40) }]);
  assert.throws(() => invoke(missingCommit), /Pinned source commit was not found/);
  assert.equal(exists(join(missingCommit.workspace, 'src')), false);

  const missingPage = createFixture();
  const pages = [...missingPage.entry.pages, { source: 'showcase/docs/missing.md', slug: 'missing' }];
  writeRegistry(missingPage.workspace, [{ ...missingPage.entry, pages }]);
  assert.throws(() => invoke(missingPage), /Pinned source file is missing or ambiguous: showcase\/docs\/missing\.md/);
  assert.equal(exists(join(missingPage.workspace, 'src')), false);
});

test('rejects a manifest whose id differs from the registry entry', () => {
  const context = createWorkspace();
  const fixtureProject = createProject(context, {
    manifest: {
      id: 'other-project',
      title: 'Crabit',
      tagline: 'A compact maker device',
    },
  });
  const fixture = { ...context, ...fixtureProject, projects: [fixtureProject] };
  writeRegistry(context.workspace, [fixtureProject.entry]);
  assert.throws(() => invoke(fixture), /manifest id does not match/);
  assert.equal(exists(join(fixture.workspace, 'src')), false);
});

test('rejects an unsafe model URL in the manifest', () => {
  const context = createWorkspace();
  const fixtureProject = createProject(context, {
    manifest: {
      id: 'crabit',
      title: 'Crabit',
      tagline: 'A compact maker device',
      modelUrl: 'javascript:alert(1)',
    },
  });
  const fixture = { ...context, ...fixtureProject, projects: [fixtureProject] };
  writeRegistry(context.workspace, [fixtureProject.entry]);
  assert.throws(() => invoke(fixture), /safe local\/HTTPS URL/);
  assert.equal(exists(join(fixture.workspace, 'src')), false);
});

test('rejects Markdown links outside the project page allowlist', () => {
  const fixture = createFixture();
  writeSourceFile(fixture.repository, 'showcase/docs/start.md', '---\ntitle: Start\n---\n\n[missing](./missing.md)\n');
  runGit(fixture.repository, fixture.hooks, ['add', '--', 'showcase/docs/start.md']);
  runGit(fixture.repository, fixture.hooks, ['commit', '--quiet', '-m', 'missing link fixture']);
  writeRegistry(fixture.workspace, [
    {
      ...fixture.entry,
      ref: runGit(fixture.repository, fixture.hooks, ['rev-parse', 'HEAD']),
    },
  ]);

  assert.throws(() => invoke(fixture), /links outside the crabit page allowlist/);
  assert.equal(exists(join(fixture.workspace, 'src')), false);
});

test('rejects a symlink Git tree entry by its octal mode', () => {
  const fixture = createFixture();
  const targetBlob = runGit(fixture.repository, fixture.hooks, ['hash-object', '-w', '--stdin'], 'target.md');
  runGit(fixture.repository, fixture.hooks, [
    'update-index',
    '--add',
    '--cacheinfo',
    `120000,${targetBlob},showcase/docs/start.md`,
  ]);
  runGit(fixture.repository, fixture.hooks, ['commit', '--quiet', '-m', 'symlink mode fixture']);
  writeRegistry(fixture.workspace, [
    {
      ...fixture.entry,
      ref: runGit(fixture.repository, fixture.hooks, ['rev-parse', 'HEAD']),
    },
  ]);

  assert.throws(() => invoke(fixture), /Git mode 100644/);
  assert.equal(exists(join(fixture.workspace, 'src')), false);
});
