<!-- One line at every step of the type scale, the caption step being the smallest the page draws. -->
<div class="stub" data-stub="type-scale">
  <p class="display">0123</p>
  <p class="headline">0123</p>
  <p class="section-header">Section</p>
  <p class="body">Body text the display presents to be read.</p>
  <p class="caption">Caption</p>
</div>

<style>
  .stub {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  p {
    margin: 0;
  }

  .display {
    font-size: var(--type-display);
    font-weight: var(--type-display-weight);
  }

  .headline {
    font-size: var(--type-headline);
    font-weight: var(--type-headline-weight);
  }

  .section-header {
    font-size: var(--type-section-header);
    font-weight: var(--type-section-header-weight);
    letter-spacing: var(--type-section-header-tracking);
    text-transform: uppercase;
  }

  .body {
    font-size: var(--type-body);
    font-weight: var(--type-body-weight);
  }

  .caption {
    font-size: var(--type-caption);
    font-weight: var(--type-caption-weight);
  }
</style>
