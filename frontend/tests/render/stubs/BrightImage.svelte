<!--
  Imagery rendered as content, brighter than the ceiling: the exemption, exercised.

  The scan reads an element's CSS surfaces, and an image's own painted pixels are not one — so the
  bright field here is carried as a `background-color` on the `img` itself. That is what makes the
  exemption load-bearing: drop it and this element is reported, which is the whole claim the legal
  fixture rests on.
-->
<div class="stub" data-stub="bright-image">
  <!-- Same-origin, so the file loads under the served `img-src 'self'` (#266 security response headers); a `data:` URI does not. -->
  <img alt="A white field" src={new URL('./bright-image.gif', import.meta.url).href} />
</div>

<style>
  img {
    width: 20vh;
    height: 10vh;
    background-color: #eee;
  }
</style>
