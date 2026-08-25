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
  /* A band above what is already laid out, not a replacement for it and not a cover over it: the
     page gives the band its own row and the frame the rest, so the modules that need no backend
     keep rendering in full (SYS001). The rule beneath separates the two. Its own text clears the
     masked band on the three edges it reaches, the frame below holding the fourth
     (docs/contracts/display-styling-contract.md § Spacing scale and the edge band). */
  .backend-unreachable {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: calc(var(--edge-band) + var(--space-md)) calc(var(--edge-band) + var(--space-lg))
      var(--space-md);
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
