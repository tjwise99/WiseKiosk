<script lang="ts">
  /**
   * What is wrong, and what an operator does about it. The two are separate content rather than one
   * sentence rephrased: SRS026 obliges the corrective action to be distinct from the failure it
   * reports, and #71 restart policy is what decides whether the action itself is the right advice.
   */
  const DIAGNOSIS = 'The kiosk service isn’t responding.';
  const REMEDIATION = 'Restart the WiseKiosk service on the host, then this page recovers on its own.';
</script>

<aside class="backend-unreachable" data-backend-unreachable role="alert">
  <h1 data-diagnosis>{DIAGNOSIS}</h1>
  <p data-remediation>{REMEDIATION}</p>
</aside>

<style>
  /* A band across the top of what is already laid out, not a replacement for it: the modules that
     need no backend keep rendering beneath (SYS001). The ground is the page's own, so the band is
     opaque over whatever it covers without emitting anything itself. */
  .backend-unreachable {
    box-sizing: border-box;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-md) var(--space-lg);
    background: var(--emission-ground);
    border-bottom: 1px solid var(--emission-stroke);
  }

  h1 {
    margin: 0;
    font-size: var(--type-body);
    font-weight: var(--type-body-weight);
  }

  p {
    margin: 0;
    font-size: var(--type-caption);
    font-weight: var(--type-caption-weight);
  }
</style>
