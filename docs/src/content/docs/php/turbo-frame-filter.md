---
title: The turbo_frame Twig filter
description: Extend a lean frame layout when the request targets a matching Turbo Frame, with the -frame template sibling convention.
sidebar:
    order: 2
---

A Turbo Frame request only needs the content of the frame, not the page layout around it. The `turbo_frame` filter
picks the template to extend: the full one on a normal request, a lean one when the request targets a (matching) Turbo
Frame, without branching in every action:

```twig
{# convention: use project/show-frame.html.twig if it exists, #}
{# otherwise fall back to the configured base_template          #}
{% extends 'project/show.html.twig'|turbo_frame('project-details') %}

{# or pass an explicit base template (skips the -frame lookup) #}
{% extends 'project/show.html.twig'|turbo_frame('project-details', 'layout/_frame.html.twig') %}
```

The filter is registered by the bundle when `twig/twig` is installed, or by hand
[without the framework](/php/without-framework/).

## Arguments

```twig
{{ template|turbo_frame(frameId = null, baseTemplate = null) }}
```

| Argument       | Default | Effect                                                                                        |
| -------------- | ------- | --------------------------------------------------------------------------------------------- |
| `template`     |         | The template to extend outside the frame.                                                     |
| `frameId`      | `null`  | Only switch templates when the `Turbo-Frame` header equals this id; `null` matches any frame. |
| `baseTemplate` | `null`  | The template to extend inside the frame; skips the `-frame` lookup.                           |

Omit the frame id (`'project/show.html.twig'|turbo_frame`) to match **any** Turbo Frame request.

## Resolution

| Request                                                      | Returned template                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| No `Turbo-Frame` header, or another frame id than `frameId`  | `template`                                                  |
| No current request (console command, email, message handler) | `template`                                                  |
| Matching frame, `baseTemplate` given                         | `baseTemplate`                                              |
| Matching frame, the `-frame` sibling of `template` exists    | the sibling                                                 |
| Matching frame, otherwise                                    | the configured [`base_template`](/reference/configuration/) |

## The `-frame` sibling convention

When the frame matches and you don't pass a base template, the filter first looks for a **`-frame` sibling** of the
template (`project/show.html.twig` → `project/show-frame.html.twig`). If that template exists it wins; otherwise the
filter falls back to the configured `base_template`. Passing an explicit base template skips the sibling lookup
entirely.

`-frame` is inserted before the first dot of the file name, never in a directory name:

| Template                          | Sibling looked for                      |
| --------------------------------- | --------------------------------------- |
| `project/show.html.twig`          | `project/show-frame.html.twig`          |
| `v1.2/page.html.twig`             | `v1.2/page-frame.html.twig`             |
| `@App/admin.users/list.html.twig` | `@App/admin.users/list-frame.html.twig` |
| `partials/page`                   | `partials/page-frame`                   |

The lookup asks the Twig loader whether the sibling exists; it does not render it.

## A frame layout

Turbo extracts the `<turbo-frame>` whose `id` matches the requesting frame from the response, so the frame layout
needs that element, and the blocks of the full layout your pages fill. For example:

```twig
{# templates/base-frame.html.twig #}
<turbo-frame id="{{ turbo_frame_id() }}">
    {% block body %}{% endblock %}
</turbo-frame>
```

```twig
{# templates/project/show.html.twig #}
{% extends 'base.html.twig'|turbo_frame('project-details') %}

{% block body %}
    <h1>{{ project.name }}</h1>
{% endblock %}
```

A normal request renders the page in `base.html.twig`; a request from the `project-details` frame renders it in
`base-frame.html.twig`, the `-frame` sibling of `base.html.twig`.

## Branching on the frame: `turbo_frame_request()` and `turbo_frame_id()`

Two functions cover the templates that decide by themselves:

| Function                              | Returns                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `turbo_frame_request(frameId = null)` | `true` when the request targets a Turbo Frame (any frame, or the given id); `false` without a request |
| `turbo_frame_id()`                    | The id of the requesting frame, or `null` outside a frame request                                     |

A typical use is a URL that opens in a modal frame but also works as a full page (a new tab, a direct link, no
JavaScript):

```twig
{# templates/project/edit.html.twig #}
{% extends turbo_frame_request('modal') ? 'base-frame.html.twig' : 'base-modal.html.twig' %}
```

`turbo_frame_id()` lets a shared fragment answer whichever frame asked, for example an access-denied page that replaces
the content of the frame that requested it instead of triggering Turbo's "Content missing":

```twig
<turbo-frame id="{{ turbo_frame_id() }}">…</turbo-frame>
```
