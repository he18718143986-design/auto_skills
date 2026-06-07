import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { buildWorkflowWebviewHtml } from '../WebviewPanel';
import { createMountStageTimelineMiniDom } from './mountStageTimelineMiniDom';
import type { StageConfidenceView } from '../webview/shared/execTimelineConfidence';

export function buildTestWebviewL10nZh(): Record<string, string> {
  const catalog = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'l10n', 'webview-ui-strings.json'), 'utf8'),
  ) as Record<string, { en: string; zh: string }>;
  const out: Record<string, string> = {};
  for (const [key, vals] of Object.entries(catalog)) {
    out[key] = vals.zh;
  }
  return out;
}

export class MiniElement {
  public id = '';
  public tagName: string;
  public nodeType = 1;
  public children: MiniElement[] = [];
  public parent: MiniElement | null = null;
  public style: Record<string, string> = {};
  public dataset: Record<string, string> = {};
  public className = '';
  public textContent = '';
  public value = '';
  public type = '';
  public placeholder = '';
  public disabled = false;
  public onclick: ((e?: unknown) => void) | null = null;
  public oninput: (() => void) | null = null;
  private inputListeners: Array<() => void> = [];
  private attributes: Record<string, string> = {};

  addEventListener(event: string, handler: () => void): void {
    if (event === 'input') {
      this.inputListeners.push(handler);
    }
  }

  hidden = false;
  /** `<details>` open state (Mini DOM does not hide children when false). */
  open = false;

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
    if (name === 'data-step') {
      this.dataset.step = value;
    }
  }

  getAttribute(name: string): string | null {
    if (name === 'data-step') {
      return this.dataset.step || this.attributes[name] || null;
    }
    return this.attributes[name] ?? null;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  focus(): void {}

  private innerHtmlBacking = '';

  /** Webview 脚本用 innerHTML 清空容器；必须 detach 子节点，否则会重复堆积 input。 */
  set innerHTML(v: string) {
    this.innerHtmlBacking = v;
    for (const c of [...this.children]) {
      c.remove();
    }
    if (!v.trim()) {
      return;
    }
    const strongMatch = /^<strong>([^]*)<\/strong>\s*$/i.exec(v.trim());
    if (strongMatch) {
      const s = new MiniElement('strong');
      s.textContent = strongMatch[1];
      this.appendChild(s);
      return;
    }
    const buttonRe = /<button\s+id="([^"]+)"[^>]*>([^<]*)<\/button>/gi;
    let bm: RegExpExecArray | null;
    while ((bm = buttonRe.exec(v)) !== null) {
      const btn = new MiniElement('button');
      btn.id = bm[1];
      btn.textContent = bm[2];
      this.appendChild(btn);
    }
  }

  get innerHTML(): string {
    return this.innerHtmlBacking;
  }
  public classList = {
    contains: (name: string) => this.className.split(/\s+/).filter(Boolean).includes(name),
    toggle: (name: string, enabled?: boolean) => {
      const parts = this.className.split(/\s+/).filter(Boolean);
      const has = parts.includes(name);
      const on = enabled !== undefined ? enabled : !has;
      if (on && !has) {
        parts.push(name);
      } else if (!on) {
        this.className = parts.filter((c) => c !== name).join(' ');
        return;
      }
      this.className = parts.join(' ');
    },
    add: (name: string) => {
      if (!this.className.split(/\s+/).includes(name)) {
        this.className = this.className ? `${this.className} ${name}` : name;
      }
    },
    remove: (name: string) => {
      this.className = this.className
        .split(/\s+/)
        .filter((c) => c && c !== name)
        .join(' ');
    },
  };

  scrollIntoView(_opts?: unknown): void {}

  scrollTop = 0;

  get scrollHeight(): number {
    return 0;
  }

  constructor(tagName: string) {
    this.tagName = tagName.toLowerCase();
  }

  appendChild(child: MiniElement): MiniElement {
    if (child.parent) {
      child.parent.children = child.parent.children.filter((c) => c !== child);
    }
    child.parent = this;
    this.children.push(child);
    return child;
  }

  insertBefore(newChild: MiniElement, referenceNode: MiniElement | null): MiniElement {
    if (newChild.parent) {
      newChild.parent.children = newChild.parent.children.filter((c) => c !== newChild);
    }
    newChild.parent = this;
    if (!referenceNode) {
      this.children.unshift(newChild);
      return newChild;
    }
    const idx = this.children.indexOf(referenceNode);
    if (idx < 0) {
      this.children.push(newChild);
    } else {
      this.children.splice(idx, 0, newChild);
    }
    return newChild;
  }

  get nextSibling(): MiniElement | null {
    if (!this.parent) {
      return null;
    }
    const idx = this.parent.children.indexOf(this);
    return idx >= 0 && idx < this.parent.children.length - 1 ? this.parent.children[idx + 1] : null;
  }

  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }

  querySelector(selector: string): MiniElement | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return this.findFirst((node) => node.id === id);
    }
    if (selector === '.q-panel') {
      return this.findFirst((node) => node.className.split(' ').includes('q-panel'));
    }
    if (selector === 'summary') {
      return this.findFirst((node) => node.tagName === 'summary');
    }
    return null;
  }

  querySelectorAll(selector: string): MiniElement[] {
    if (selector === '.q-panel input[type=checkbox]') {
      const panel = this.querySelector('.q-panel');
      if (!panel) return [];
      return panel.findAll((node) => node.tagName === 'input' && node.type === 'checkbox');
    }
    return [];
  }

  private findFirst(predicate: (node: MiniElement) => boolean): MiniElement | null {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const nested = child.findFirst(predicate);
      if (nested) return nested;
    }
    return null;
  }

  private findAll(predicate: (node: MiniElement) => boolean): MiniElement[] {
    const out: MiniElement[] = [];
    for (const child of this.children) {
      if (predicate(child)) out.push(child);
      out.push(...child.findAll(predicate));
    }
    return out;
  }
}

export class MiniDocument {
  private readonly byId = new Map<string, MiniElement>();
  readonly body = new MiniElement('body');
  private readonly keydownHandlers: Array<(ev: { key: string; preventDefault: () => void }) => void> = [];

  register(el: MiniElement, id: string): void {
    el.id = id;
    this.byId.set(id, el);
  }

  querySelectorAll(selector: string): MiniElement[] {
    if (selector === '.workflow-step') {
      return ['step-nav-input', 'step-nav-confirm', 'step-nav-exec']
        .map((id) => this.byId.get(id))
        .filter((el): el is MiniElement => !!el);
    }
    return [];
  }

  getElementById(id: string): MiniElement | null {
    const registered = this.byId.get(id);
    if (registered) {
      return registered;
    }
    const roots = [this.body, ...this.byId.values()];
    for (const root of roots) {
      const found = findElementByIdInTree(root, id);
      if (found) {
        return found;
      }
    }
    return null;
  }

  createElement(tag: string): MiniElement {
    return new MiniElement(tag);
  }

  createElementNS(_ns: string, tag: string): MiniElement {
    return new MiniElement(tag);
  }

  createTextNode(text: string): MiniElement {
    const node = new MiniElement('#text');
    node.nodeType = 3;
    node.textContent = text;
    return node;
  }

  addEventListener(event: string, handler: (ev: { key: string; preventDefault: () => void }) => void): void {
    if (event === 'keydown') {
      this.keydownHandlers.push(handler);
    }
  }

  removeEventListener(event: string, handler: (ev: { key: string; preventDefault: () => void }) => void): void {
    if (event === 'keydown') {
      const idx = this.keydownHandlers.indexOf(handler);
      if (idx >= 0) {
        this.keydownHandlers.splice(idx, 1);
      }
    }
  }

  dispatchKeydown(key: string): void {
    const ev = { key, preventDefault: () => {} };
    for (const h of [...this.keydownHandlers]) {
      h(ev);
    }
  }
}

function findElementByIdInTree(root: MiniElement, id: string): MiniElement | null {
  if (root.id === id) {
    return root;
  }
  for (const child of root.children) {
    const found = findElementByIdInTree(child, id);
    if (found) {
      return found;
    }
  }
  return null;
}

/** 聚合元素及其子树的可见文本（与浏览器 textContent 语义接近）。 */
export function getElementTreeText(node: MiniElement): string {
  if (node.tagName === '#text') {
    return node.textContent;
  }
  const childText = node.children.map(getElementTreeText).join('');
  return `${node.textContent || ''}${childText}`;
}

function getNodeText(node: MiniElement): string {
  return getElementTreeText(node);
}

export function findButtonByText(root: MiniElement, text: string): MiniElement {
  const queue: MiniElement[] = [root];
  while (queue.length > 0) {
    const n = queue.shift()!;
    if (n.tagName === 'button' && getNodeText(n) === text) {
      return n;
    }
    queue.push(...n.children);
  }
  throw new Error(`button not found: ${text}`);
}

export function findInputByPlaceholder(root: MiniElement, placeholderPrefix: string): MiniElement {
  const queue: MiniElement[] = [root];
  while (queue.length > 0) {
    const n = queue.shift()!;
    if (n.tagName === 'input' && n.placeholder.startsWith(placeholderPrefix)) {
      return n;
    }
    queue.push(...n.children);
  }
  throw new Error(`input not found: ${placeholderPrefix}`);
}

export function findFirstByTag(root: MiniElement, tagName: string): MiniElement {
  const queue: MiniElement[] = [root];
  const wanted = tagName.toLowerCase();
  while (queue.length > 0) {
    const n = queue.shift()!;
    if (n.tagName === wanted) {
      return n;
    }
    queue.push(...n.children);
  }
  throw new Error(`element not found by tag: ${tagName}`);
}

export function findElementContainingText(root: MiniElement, text: string): MiniElement {
  const queue: MiniElement[] = [root];
  while (queue.length > 0) {
    const n = queue.shift()!;
    if (getNodeText(n).includes(text)) {
      return n;
    }
    queue.push(...n.children);
  }
  throw new Error(`element text not found: ${text}`);
}

/** 追问卡片内的单行文本输入（执行前 / 执行后批量表单）。 */
export function findExecTimelineItem(root: MiniElement, stageId: string): MiniElement {
  const queue: MiniElement[] = [root];
  while (queue.length > 0) {
    const n = queue.shift()!;
    if (n.tagName === 'li' && n.dataset.id === stageId) {
      return n;
    }
    queue.push(...n.children);
  }
  throw new Error(`exec timeline item not found: ${stageId}`);
}

export function countButtons(root: MiniElement): number {
  let count = 0;
  const queue: MiniElement[] = [root];
  while (queue.length > 0) {
    const n = queue.shift()!;
    if (n.tagName === 'button') {
      count += 1;
    }
    queue.push(...n.children);
  }
  return count;
}

export function findByClassPart(root: MiniElement, classPart: string): MiniElement | null {
  const queue: MiniElement[] = [root];
  while (queue.length > 0) {
    const n = queue.shift()!;
    if (n.className.split(/\s+/).filter(Boolean).includes(classPart)) {
      return n;
    }
    queue.push(...n.children);
  }
  return null;
}

export function assertPauseBarVisible(document: MiniDocument, message?: string): void {
  const bar = document.getElementById('pause-bar');
  assert.ok(bar, message ?? 'pause-bar missing');
  assert.equal(bar!.style.display, 'flex', message ?? 'pause-bar should be display:flex when paused');
  assert.ok(bar!.classList.contains('is-visible'), message ?? 'pause-bar should have is-visible');
  const dock = findByClassPart(bar!, 'pause-bar-dock');
  assert.ok(dock, message ?? 'pause-bar-dock missing');
  assert.ok(countButtons(dock!) >= 1, message ?? 'pause-bar-dock should contain action buttons');
}

export function activateExecView(document: MiniDocument): void {
  document.getElementById('view-exec')!.className = 'view active';
  document.getElementById('view-input')!.className = 'view';
  document.getElementById('view-confirm')!.className = 'view';
}

export function bootWorkflowOnExec(
  rt: { document: MiniDocument; send: (data: unknown) => void },
  workflow: unknown,
): void {
  rt.send({ type: 'workflowGenerated', workflow, warnings: [] });
  activateExecView(rt.document);
  rt.document.getElementById('btn-start')!.onclick?.();
}

export function collectTextInputs(root: MiniElement): MiniElement[] {
  const out: MiniElement[] = [];
  const queue: MiniElement[] = [root];
  while (queue.length > 0) {
    const n = queue.shift()!;
    if (n.tagName === 'input' && n.type === 'text') {
      out.push(n);
    }
    queue.push(...n.children);
  }
  return out;
}

export function setupWebviewScriptRuntime(confirmResult: boolean) {
  const html = buildWorkflowWebviewHtml({ cspSource: 'vscode-test' } as never);
  const scriptBlocks = [...html.matchAll(/<script nonce="[^"]*">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scriptBlocks.length >= 2, 'expected L10N + bundle script tags');
  const l10nMap = buildTestWebviewL10nZh();
  const l10nScript = `globalThis.__stagentL10n=${JSON.stringify(l10nMap)};`;
  const script = l10nScript + '\n' + scriptBlocks.slice(1).join('\n');

  const document = new MiniDocument();
  const ids = [
    'view-input',
    'view-confirm',
    'view-exec',
    'user-input',
    'polish-hint',
    'btn-polish',
    'task-workspace-path',
    'btn-pick-workspace',
    'btn-gen',
    'input-actions',
    'polish-actions',
    'polish-dock-hint',
    'gen-actions',
    'gen-dock-hint',
    'chat-history',
    'input-chat-shell',
    'composer-dock',
    'user-message-bubble',
    'input-composer',
    'polish-assistant',
    'polish-result-edit',
    'polish-loading',
    'polish-loading-text',
    'polish-inline-error',
    'btn-polish-apply',
    'btn-polish-collapse',
    'btn-edit-message',
    'gen-stream-details',
    'gen-status-panel',
    'gen-status-spinner',
    'gen-status-title',
    'gen-status-detail',
    'gen-stream',
    'timeline',
    'detail',
    'wf-warn',
    'plan-summary',
    'plan-diff',
    'plan-artifacts',
    'plan-stage-cards',
    'confirm-block',
    'confirm-repair-info',
    'confirm-footer',
    'confirm-stats',
    'confirm-main',
    'confirm-dock-hint',
    'confirm-actions',
    'input-view-scroll',
    'timeline-exec',
    'exec-main',
    'output-label',
    'btn-copy-debug',
    'btn-copy-session',
    'btn-follow-live',
    'output',
    'pause-bar',
    'downstream-reset-panel',
    'done-banner',
    'fail-banner',
    'exec-error-dock',
  ];
  ids.forEach((id) => document.register(new MiniElement('div'), id));
  document.register(new MiniElement('button'), 'btn-start');
  document.register(new MiniElement('button'), 'btn-back-input');
  document.register(new MiniElement('button'), 'btn-regenerate');

  for (const [id, step] of [
    ['step-nav-input', 'input'],
    ['step-nav-confirm', 'confirm'],
    ['step-nav-exec', 'exec'],
  ] as const) {
    const stepBtn = new MiniElement('button');
    stepBtn.className = 'workflow-step';
    stepBtn.setAttribute('data-step', step);
    document.register(stepBtn, id);
  }

  for (const id of [
    'polish-assistant',
    'chat-history',
    'gen-status-panel',
    'polish-result-edit',
    'polish-loading',
  ]) {
    document.getElementById(id)!.style.display = 'none';
  }
  document.getElementById('gen-actions')!.style.display = 'none';
  const pauseBar = document.getElementById('pause-bar')!;
  pauseBar.style.display = 'none';
  pauseBar.hidden = true;
  document.getElementById('exec-error-dock')!.style.display = 'none';

  for (const sectionId of [
    'section-plan-summary',
    'section-plan-diff',
    'section-plan-artifacts',
    'section-warnings',
    'section-stage-cards',
    'section-detail',
  ]) {
    const section = new MiniElement('details');
    section.hidden = true;
    const summary = new MiniElement('summary');
    section.appendChild(summary);
    document.register(section, sectionId);
  }

  const postMessages: unknown[] = [];
  let messageHandler: ((event: { data: unknown }) => void) | null = null;

  const sandbox = {
    document,
    __stagentL10n: l10nMap,
    __STAGENT_WEBVIEW_TEST__: true,
    window: {
      __STAGENT_WEBVIEW_TEST__: true,
      addEventListener: (name: string, handler: (event: { data: unknown }) => void) => {
        if (name === 'message') messageHandler = handler;
      },
      requestAnimationFrame: (fn: () => void) => {
        fn();
        return 0;
      },
    },
    acquireVsCodeApi: () => ({
      postMessage: (msg: unknown) => {
        postMessages.push(msg);
      },
    }),
    confirm: () => confirmResult,
    alert: () => {},
    requestAnimationFrame: (fn: () => void) => {
      fn();
      return 0;
    },
  };
  vm.runInNewContext(script, sandbox);
  // PR-1：Mini DOM mountStageTimeline stub（见 mountStageTimelineMiniDom.ts），非 props-only mock。
  type ExecStoreFold = {
    timelineFold: { segmentExpandedByKey: Record<string, boolean> };
    stageMaps?: { stageConfidence?: Record<string, StageConfidenceView> };
  };
  const getExecStore = (): ExecStoreFold | undefined =>
    (sandbox as { __stagentExecStore?: ExecStoreFold }).__stagentExecStore ??
    (sandbox.window as { __stagentExecStore?: ExecStoreFold }).__stagentExecStore;
  const mountStub = createMountStageTimelineMiniDom(
    l10nMap,
    () => getExecStore()?.timelineFold ?? { segmentExpandedByKey: {} },
    () => getExecStore()?.stageMaps?.stageConfidence ?? {},
  );
  (sandbox as { mountStageTimeline?: typeof mountStub }).mountStageTimeline = mountStub;
  (sandbox.window as { mountStageTimeline?: typeof mountStub }).mountStageTimeline = mountStub;
  (sandbox.window as { mountDecisionPauseBarDock?: unknown }).mountDecisionPauseBarDock = undefined;
  assert.ok(messageHandler, 'message handler not registered');

  return {
    document,
    postMessages,
    send: (data: unknown) => messageHandler!({ data }),
    dispatchKeydown: (key: string) => document.dispatchKeydown(key),
  };
}
