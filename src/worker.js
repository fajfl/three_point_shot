import { DurableObject } from 'cloudflare:workers';
import { Room } from './room.js';

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.room = new Room();
  }
  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const sock = {
      send: m => { try { server.send(m); } catch { /* 對方已離線 */ } },
      buffered: () => Number.isFinite(server.bufferedAmount) ? server.bufferedAmount : 0
    };
    server.addEventListener('message', e => this.room.message(sock, e.data));
    const bye = () => this.room.close(sock);
    server.addEventListener('close', bye);
    server.addEventListener('error', bye);
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(request, env) {
    const m = new URL(request.url).pathname.match(/^\/ws\/([A-Z0-9]{4,8})$/);
    if (m) {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('需要 WebSocket 連線', { status: 426 });
      return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
