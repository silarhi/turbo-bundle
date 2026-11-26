---
title: Turbo 8 page helpers
description: Render the meta tags that set how Turbo 8 refreshes, caches and visits a page.
sidebar:
    order: 5
---

Turbo reads a few `<meta>` tags of the page's `<head>` to decide how it refreshes, caches and visits it. Four Twig
functions render them, so a template doesn't have to spell their names and values:

```twig
{# templates/base.html.twig #}
<head>
    {{ turbo_refreshes_with('morph', 'preserve') }}
    {% block turbo_metas %}{% endblock %}
</head>

{# templates/checkout/payment.html.twig #}
{% block turbo_metas turbo_exempts_page_from_cache() %}
```

| Function                                                     | Renders                                                                                               | Effect                                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `turbo_refreshes_with(method = 'replace', scroll = 'reset')` | `<meta name="turbo-refresh-method" content="…">` and `<meta name="turbo-refresh-scroll" content="…">` | How a Turbo 8 page refresh renders: `replace` or `morph` the body, `reset` or `preserve` the scroll |
| `turbo_exempts_page_from_cache()`                            | `<meta name="turbo-cache-control" content="no-cache">`                                                | Turbo does not cache the page: no preview, and Back loads it from the server                        |
| `turbo_exempts_page_from_preview()`                          | `<meta name="turbo-cache-control" content="no-preview">`                                              | Turbo caches the page for Back, but shows no preview of it before a visit                           |
| `turbo_page_requires_reload()`                               | `<meta name="turbo-visit-control" content="reload">`                                                  | A Drive visit to the page becomes a full page load                                                  |

`turbo_refreshes_with()` throws an `InvalidArgumentException` on another method or scroll. The page refreshes of Turbo 8
are the `refresh` stream of a [broadcast](/php/request-id/) and a redirect back to the same page; with `morph`, see
[morph mutations](/javascript/morph-mutations/) for how `TurboHandler` mounts what a morph changes.
