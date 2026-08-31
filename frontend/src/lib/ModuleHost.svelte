<script lang="ts">
  import type { ModuleOptions } from '../config/types';
  import type { ModuleEntry } from './modules';
  import type { Payload } from './payload';

  /**
   * One placement of one module: it reads that module's payload, if the module has one, and hands the
   * module what it draws from. Shared framework code, so it names no module and reads nothing of what
   * a payload carries — what to call is the registry's, and what the answer means to a viewer is the
   * module's (docs/contracts/module-contract.md § Dependency direction).
   *
   * One host per placement, so two placements of one module read separately, each for the point its
   * own entry names. That is two reads where a shared one would do; they are not shared because the
   * route's own response cache already collapses them before anything leaves for the upstream, and a
   * cache here would be a second one with no obligation behind it.
   */
  const {
    entry,
    config,
    reachable,
  }: { entry: ModuleEntry; config: ModuleOptions; reachable: boolean } = $props();

  /**
   * How often a module's payload is re-read. The freshness obligation is met between this and the
   * route's own response cache rather than here alone: the cache bounds how far behind its source a
   * served answer can be, and this decides how often the display picks that answer up
   * (docs/contracts/module-contract.md § Cadence and TTL are chosen together). Reads landing inside
   * the cache's hold are answered from it, so this is a refresh cadence and not a request rate.
   */
  const READ_INTERVAL_MS = 5 * 60 * 1000;

  /**
   * How long one read is given before it is abandoned. Without it a request that never settles leaves
   * the module in its first-paint state for as long as the display runs, and a loading state that
   * never resolves cannot be told from a module that is broken.
   */
  const REQUEST_TIMEOUT_MS = 10_000;

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
    // the module renders that rather than words composed here (SRS001). A status the schema does not
    // describe carries no such body, so it is reported as an answer that did not arrive rather than
    // drawn as an empty box.
    const failure = answer.data as { message?: unknown };
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
    // back and the first read after it landing — old weather presented as now, which is the one
    // thing a display that cannot say how old it is must not do.
    if (!reachable) {
      payload = { state: 'loading' };
      return;
    }

    // A read coming back after this effect was torn down belongs to a configuration, or a
    // reachability, that no longer applies, and writing it would put a stale reading on screen.
    let current = true;
    const once = async () => {
      const settled = await read(ask);
      if (current) {
        payload = settled;
      }
    };

    void once();
    const polling = setInterval(() => void once(), READ_INTERVAL_MS);
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
