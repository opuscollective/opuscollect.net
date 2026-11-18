// Just enough of the Workers runtime module for the Global Chat Durable Object, typed from
// @cloudflare/workers-types without loading those types globally (they would replace the DOM types).
declare module 'cloudflare:workers' {
  export abstract class DurableObject<E = unknown> {
    protected ctx: import('@cloudflare/workers-types').DurableObjectState;
    protected env: E;
    constructor(ctx: import('@cloudflare/workers-types').DurableObjectState, env: E);
  }
}
