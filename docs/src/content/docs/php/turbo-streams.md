---
title: Answering with Turbo Streams
description: Decide when to answer a Turbo Stream, render a template or one of its blocks as a stream response, and write streams of any action with the turbo_stream filter.
sidebar:
    order: 3
---

Turbo asks for a Turbo Stream answer on its form submissions (a `data-turbo-method` link included) and on
`data-turbo-stream` links, by adding `text/vnd.turbo-stream.html` to the `Accept` header. A browser without JavaScript
never does, so the same action keeps a redirect for it.

## Deciding: `acceptsTurboStream()`

`TurboManager::acceptsTurboStream()` reads that `Accept` header:

```php
use Silarhi\TurboBundle\TurboManager;
use Silarhi\TurboBundle\TurboStreamRenderer;

public function delete(Project $item, TurboManager $turbo, TurboStreamRenderer $streams): Response
{
    // …
    if ($turbo->acceptsTurboStream()) {
        return $streams->render('project/delete.stream.html.twig', ['item' => $item]);
    }

    return $this->redirectToRoute('projects_index');
}
```

A Drive form outside any frame asks for a stream too. When the answer must leave the page there (an edit page that goes
back to the list), decide on the frame instead: a stream for the form of a modal frame, the redirect otherwise.

```php
if ('modal' === $turbo->getTurboFrameId()) {
    return $streams->render('project/edit.html.twig', ['item' => $item], 'success_stream');
}

return $this->redirectToRoute('projects_index');
```

## Rendering: `TurboStreamRenderer`

`TurboStreamRenderer::render()` renders a template, or one of its blocks, with the `text/vnd.turbo-stream.html` content
type. The streams of an action can live in a block of its form template:

```twig
{# project/edit.html.twig #}
{% extends 'layouts/modal.html.twig'|turbo_frame('modal') %}

{% block body %}
    {{ form(form) }}
{% endblock %}

{% block success_stream %}
    {% apply turbo_stream('replace', 'project_' ~ item.id) %}
        {% include 'project/_row.html.twig' with({'item': item}) %}
    {% endapply %}
    {{ ''|turbo_stream('modalClose', 'app-modal') }}
{% endblock %}
```

```php
public function render(string $view, array $parameters = [], ?string $block = null, int $status = 200): Response
```

- It depends on Twig only: it works without `symfony/ux-turbo` and [without the framework](/php/without-framework/).
  `SilarhiTurboBundle` registers it when Twig is installed.
- Unlike `AbstractController::render()`, it takes no form object: pass `$form->createView()`.
- Turbo renders a stream answer whatever its status: pass `422` to answer an invalid form with streams.

With `symfony/ux-turbo` in a controller, `renderBlock()` with its `TurboStreamResponse` does the same:
`$this->renderBlock('project/edit.html.twig', 'success_stream', [...], new TurboStreamResponse())`.

## Writing streams: the `turbo_stream` filter

The `<twig:Turbo:Stream:*>` components of `symfony/ux-turbo` cover the built-in actions only, and need TwigComponent.
The `turbo_stream` filter wraps its content in a `<turbo-stream>` of any action, a custom one registered with
`StreamActions` included:

```twig
{% apply turbo_stream('append', 'flash-alerts') %}
    <div class="alert alert-success">{{ 'label.project_saved'|trans }}</div>
{% endapply %}

{{ ''|turbo_stream('remove', targets = '.notification') }}
{{ ''|turbo_stream('modalClose', 'app-modal') }}
{{ ''|turbo_stream('refresh', attributes = {'request-id': turbo_request_id()}) }}
```

```twig
content|turbo_stream(action, target = null, targets = null, attributes = {})
```

- `target` is an element id, `targets` a CSS selector: pass one of them, not both.
- Named arguments use `=` for compatibility with Twig 3.0, for example `targets = '.notification'`.
- `attributes` adds attributes to the stream (`method`, `request-id`, `data-*`…). `true` renders the name alone,
  `false` and `null` leave it out; `action`, `target` and `targets` come from the arguments.
- An empty content gets no `<template>`, as `remove`, `refresh` and actions without content expect.
- The content of an `{% apply %}` block is already escaped. A plain string is escaped like any Twig output.

### The `turbo_stream` function

The function is convenient for actions without content, and also accepts content as its third argument:

```twig
{{ turbo_stream('remove', 'project_1') }}
{{ turbo_stream('remove', targets = '.notification') }}
{{ turbo_stream('append', 'notes', message) }}
{{ turbo_stream('refresh', attributes = {'request-id': turbo_request_id()}) }}
```

```twig
turbo_stream(action, target = null, content = '', targets = null, attributes = {})
```

Plain content is escaped. To pass rendered HTML, capture it with `{% set %}` (or use the filter's `{% apply %}` form):

```twig
{% set content %}<p>{{ project.name }}</p>{% endset %}
{{ turbo_stream('replace', 'project_1', content) }}
```

The filter and function both work with Twig 3.0 and share the same rules for targets, attributes and empty content.

### Optional Twig component

If you use [Symfony UX Twig Component](https://symfony.com/bundles/ux-twig-component) 2.20 or later,
including 3.x, the bundle also provides `<twig:Turbo:Stream>`. Install and enable the Twig Component
bundle and register `SilarhiTurboBundle`; the component is discovered automatically. This dependency is optional:

```shell
composer require symfony/ux-twig-component
```

```twig
<twig:Turbo:Stream action="replace" target="project_1">
    <p>{{ project.name }}</p>
</twig:Turbo:Stream>

<twig:Turbo:Stream action="remove" targets=".notification" />
<twig:Turbo:Stream action="modalClose" target="app-modal" data-reason="saved" />
<twig:Turbo:Stream action="refresh" request-id="{{ turbo_request_id() }}" />
```

The component accepts `action`, `target` and `targets` as props. Other attributes are forwarded to the
`<turbo-stream>` element. Its body becomes the `<template>` content; an empty body produces no `<template>`.
It uses the same renderer and target validation as the function and filter. Twig Component has its own Twig
version requirements; installing it does not change the minimum supported by the standalone helpers.

```js
import { StreamActions } from '@hotwired/turbo'

StreamActions.modalClose = function modalClose() {
    for (const shell of this.targetElements) {
        shell.dispatchEvent(new CustomEvent('modal:close'))
    }
}
```

To check these responses in functional tests, see [`assertTurboStream()`](/php/testing/).
