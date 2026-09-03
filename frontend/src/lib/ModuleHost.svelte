<script lang="ts">
  import type { ModuleOptions } from '../config/types';
  import { REQUEST_TIMEOUT_MS } from './liveness';
  import type { ModuleEntry } from './modules';
  import type { Payload, PayloadFailure } from './payload';

  /**
   * One placement of one module: it reads that module's payload, if the module has one, and hands the
   * module what it draws from. Shared framework code, so it names no module and reads nothing of what
   * a payload carries — what to call is the registry's, and what the answer means to a viewer is the
   * module's (docs/contracts/module-contract.md § Dependency direction).
   *
   * One host per placement, so two placements of one module read separately, each for the point its
   * own entry names. The route's response cache collapses them before anything leaves for the
   * upstream.
   */
  const {
    entry,
    config,
    reachable,
  }: { entry: ModuleEntry; config: ModuleOptions; reachable: boolean } = $props();

  /** What a module reports when a read did not come back at all, there being no body to take a reason off. */
  const UNANSWERED = 'The reading did not come back in time.';

  /** Capitalised so the markup below reads it as the component it is rather than as an element. */
  const Module = $derived(entry.component);

  let payload = $state<Payload<unknown>>({ state: 'loading' });

  /**
   * One read, resolved into what the module draws from. The status is what tells a reading from a
   * failure — the boundary schema carries a different body at each — so nothing here inspects a body
   * to decide which arrived.
   */
  async function read(ask: NonNullable<ModuleEntry['read']>): Promise<Payload<unknown>> {
    let answer;
    try {
      answer = await ask(config, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      return { state: 'unavailable', failure: { message: UNANSWERED } };
    }

    if (answer.status === 200) {
      return { state: 'ok', data: answer.data };
    }

    // Every other status the route answers at carries a body spelling the reason for a reader, and
    // the module renders that rather than words composed here
    // (SRS001<!-- A failed module shows why, and only that module -->). A status the schema does not
    // describe carries no such body, so it is reported as an answer that did not arrive rather than
    // drawn as an empty box.
    const failure = answer.data as Partial<PayloadFailure>;
    const message = typeof failure?.message === 'string' ? failure.message : UNANSWERED;
    return { state: 'unavailable', failure: { message } };
  }

  $effect(() => {
    const ask = entry.read;

    // A local module has nothing to read, so there is no timer and nothing held.
    if (ask === undefined) {
      return;
    }

    // An unreachable backend has nothing to answer with, so the timer is not merely ignored, it is
    // not running: a display left in an outage for days would otherwise go on asking every five
    // minutes for all of them. What is held from before the outage is dropped with it, because the
    // module would otherwise draw that reading as current for the window between the backend coming
    // back and the first read after it landing.
    if (!reachable) {
      payload = { state: 'loading' };
      return;
    }

    // A read settling after teardown belongs to a superseded configuration or reachability, so it
    // is discarded rather than written.
    let current = true;
    const once = async () => {
      const settled = await read(ask);
      if (current) {
        payload = settled;
      }
    };

    void once();
    // The module's own cadence, per its entry
    // (docs/contracts/module-contract.md § Cadence and TTL are chosen together).
    const polling = setInterval(() => void once(), entry.readIntervalMs);
    return () => {
      current = false;
      clearInterval(polling);
    };
  });
</script>

{#if entry.read === undefined}
  <!-- A local module is handed no payload, there being none to hand it. -->
  <Module {reachable} {config} />
{:else}
  <Module {reachable} {config} {payload} />
{/if}
