import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import { spawnBoundedServe } from '../process/ProcessRunner';

const NODE = process.execPath;

test('spawnBoundedServe: 长驻进程 grace 存活 → ready，不卡（自行收尾）', async () => {
  const res = await spawnBoundedServe(`"${NODE}" -e "setInterval(()=>{},1000)"`, {
    cwd: os.tmpdir(),
    graceMs: 500,
  });
  assert.equal(res.ready, true);
  assert.equal(res.crashed, false);
  assert.equal(res.timedOut, false);
});

test('spawnBoundedServe: 启动即崩溃 → crashed + 退出码', async () => {
  const res = await spawnBoundedServe(`"${NODE}" -e "process.exit(3)"`, {
    cwd: os.tmpdir(),
    graceMs: 1500,
  });
  assert.equal(res.ready, false);
  assert.equal(res.crashed, true);
  assert.equal(res.exitCode, 3);
});

test('spawnBoundedServe: readyProbe 命中 → ready（真起服务再探活）', async () => {
  const port = 47193;
  const server = `"${NODE}" -e "require('http').createServer((_,r)=>r.end('ok')).listen(${port})"`;
  const probe = `"${NODE}" -e "require('http').get('http://127.0.0.1:${port}',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"`;
  const res = await spawnBoundedServe(server, {
    cwd: os.tmpdir(),
    readyProbe: probe,
    probeIntervalMs: 200,
    readyTimeoutMs: 8000,
  });
  assert.equal(res.ready, true);
  assert.equal(res.crashed, false);
});
