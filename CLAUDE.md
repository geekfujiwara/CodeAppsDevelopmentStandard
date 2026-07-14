# WordPress blog post authoring notes (geekfujiwara.com)

- The blog author's name is **ギークフジワラ**（カタカナ）. Do not write "ギーク藤原".
- When writing `wp:list` block markup, the `<ul>`/`<ol>` element **must be explicitly closed** with `</ul>`/`</ol>` immediately before the `<!-- /wp:list -->` comment:

  ```html
  <!-- wp:list -->
  <ul class="wp-block-list">
  <!-- wp:list-item -->
  <li>...</li>
  <!-- /wp:list-item -->
  <!-- wp:list-item -->
  <li>...</li>
  <!-- /wp:list-item -->
  </ul>
  <!-- /wp:list -->
  ```

  Omitting `</ul>` produces syntactically-plausible-looking markup that the Gutenberg parser flags as an invalid block on publish, forcing a manual "attempt block recovery" fix in the editor. Always include the closing tag.
