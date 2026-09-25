import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

function loadPhotoModule() {
  const files = new Map();
  const cache = { uri: 'file:///app-cache/' };
  class FakeFile {
    constructor(...parts) {
      this.uri = parts.length === 1
        ? (typeof parts[0] === 'string' ? parts[0] : parts[0].uri)
        : parts[0].uri + parts.slice(1).join('/');
    }
    get exists() { return files.has(this.uri); }
    get size() { return files.get(this.uri)?.length ?? 0; }
    async copy(destination) {
      if (!this.exists) throw new Error('Source unavailable');
      files.set(destination.uri, Buffer.from(files.get(this.uri)));
    }
    async base64() {
      if (!this.exists) throw new Error('File unavailable');
      return files.get(this.uri).toString('base64');
    }
  }
  const source = readFileSync(new URL('./readPhoto.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const requireStub = (name) => {
    if (name === 'expo-file-system') return { File: FakeFile, Paths: { cache } };
    if (name === 'react-native') return { Platform: { OS: 'android' } };
    throw new Error(`Unexpected import: ${name}`);
  };
  new Function('require', 'exports', compiled)(requireStub, exports);
  return { ...exports, files, FakeFile };
}

test('copies the exact captured image before navigation and reads it as base64', async () => {
  const { files, FakeFile, holdPhoto, readPhoto } = loadPhotoModule();
  const cameraUri = 'file:///camera/example%252Fphoto.jpg';
  const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  files.set(cameraUri, image);

  const heldUri = await holdPhoto(cameraUri);
  assert.notEqual(heldUri, cameraUri);
  assert.equal(new FakeFile(heldUri).exists, true);
  assert.equal(new FakeFile(heldUri).size, image.length);
  assert.deepEqual(await readPhoto(heldUri), {
    imageBase64: image.toString('base64'),
    mimeType: 'image/jpeg',
  });
});

test('missing and empty local files fail before an API payload can be built', async () => {
  const { files, holdPhoto, readPhoto, PhotoReadError } = loadPhotoModule();
  await assert.rejects(holdPhoto('file:///camera/missing.jpg'), PhotoReadError);
  files.set('file:///camera/empty.jpg', Buffer.alloc(0));
  await assert.rejects(holdPhoto('file:///camera/empty.jpg'), PhotoReadError);
  await assert.rejects(readPhoto('file:///camera/missing.jpg'), {
    message: 'カード画像を読み込めませんでした。もう一度撮影してください。',
  });
});

test('images larger than the server limit are rejected before copying', async () => {
  const { files, holdPhoto } = loadPhotoModule();
  files.set('file:///camera/large.jpg', Buffer.alloc(5 * 1024 * 1024 + 1));
  await assert.rejects(holdPhoto('file:///camera/large.jpg'), /5MB/);
});

test('capture and analysis navigation never passes a local URI as a route parameter', () => {
  const screens = ['scan', 'camera', 'camera-preview', 'analysis-result', 'condition-check'];
  for (const name of screens) {
    const source = readFileSync(new URL(`../app/${name}.tsx`, import.meta.url), 'utf8');
    const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const uriParams = [];
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.expression.getText(file) === 'router'
        && ['push', 'replace'].includes(node.expression.name.text)) {
        const href = node.arguments[0];
        if (href && ts.isObjectLiteralExpression(href)) {
          const params = href.properties.find((property) => ts.isPropertyAssignment(property)
            && property.name.getText(file) === 'params');
          if (params && ts.isPropertyAssignment(params) && ts.isObjectLiteralExpression(params.initializer)) {
            uriParams.push(...params.initializer.properties.filter((property) =>
              property.name?.getText(file) === 'uri'));
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
    assert.equal(uriParams.length, 0, `${name} passes an image URI in navigation`);
  }
});