<!--
  Imagery rendered as content, brighter than the ceiling: the exemption, exercised.

  The scan reads an element's CSS surfaces, and an image's own painted pixels are not one — so the
  bright field here is carried as a `background-color` on the `img` itself. That is what makes the
  exemption load-bearing: drop it and this element is reported, which is the whole claim the legal
  fixture rests on.
-->
<div class="stub" data-stub="bright-image">
  <img
    alt="A white field"
    src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="
  />
</div>

<style>
  img {
    width: 20vh;
    height: 10vh;
    background-color: #eee;
  }
</style>
