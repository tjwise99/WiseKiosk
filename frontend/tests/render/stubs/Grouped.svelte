<!-- The grouping vocabulary at its legal emission: a header's dim divider and a below-ceiling tint. -->
<div class="stub" data-stub="grouped">
  <p class="header">Wait times</p>
  <div class="group">
    <p class="line">Big Thunder — 25 min</p>
    <p class="line">Space Mountain — 40 min</p>
  </div>
</div>

<style>
  .stub {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  p {
    margin: 0;
  }

  .header {
    padding-bottom: var(--space-xs);
    border-bottom: 1px solid var(--emission-stroke);
    font-size: var(--type-section-header);
    font-weight: var(--type-section-header-weight);
    letter-spacing: var(--type-section-header-tracking);
    text-transform: uppercase;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-sm);
    background: var(--emission-fill);
  }

  .line {
    font-size: var(--type-body);
    font-weight: var(--type-body-weight);
  }
</style>
