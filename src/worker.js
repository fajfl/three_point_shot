import { DurableObject } from 'cloudflare:workers';
import { Room } from './room.js';
import { Matchmaker } from './match.js';

// 同一個 Durable Object 類別有兩種用途：一般的對戰房（/ws/房號），以及全站共用的一個配對大廳（/mm）
export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.room = new Room();
    this.mm = null;
  }
  async fetch(request) {
    const target = new URL(request.url).pathname === '/mm' ? (this.mm ??= new Matchmaker()) : this.room;
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const sock = {
      send: m => { try { server.send(m); } catch { /* 對方已離線 */ } },
      close: () => { try { server.close(1000, 'bye'); } catch { /* 已經關了 */ } },
      buffered: () => Number.isFinite(server.bufferedAmount) ? server.bufferedAmount : 0
    };
    server.addEventListener('message', e => target.message(sock, e.data));
    const bye = () => { target.close(sock); sock.close(); };
    server.addEventListener('close', bye);
    server.addEventListener('error', bye);
    return new Response(null, { status: 101, webSocket: client });
  }
}

const upgrade = request => request.headers.get('Upgrade') === 'websocket';
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const m = path.match(/^\/ws\/([A-Z0-9]{4,8})$/);
    if (m || path === '/mm') {
      if (!upgrade(request)) return new Response('需要 WebSocket 連線', { status: 426 });
      // 房號只會是大寫英數，配對大廳用一個不可能撞名的名字
      return env.ROOM.get(env.ROOM.idFromName(m ? m[1] : '~matchmaker')).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
