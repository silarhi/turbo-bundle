<?php

declare(strict_types=1);

/*
 * This file is part of the Turbo Bundle package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

namespace Silarhi\TurboBundle\Twig;

use InvalidArgumentException;
use Silarhi\TurboBundle\TurboManager;

use function sprintf;

use Stringable;
use Twig\Environment;
use Twig\Extension\AbstractExtension;
use Twig\Markup;
use Twig\TwigFilter;
use Twig\TwigFunction;

/**
 * Adds the `turbo_frame` filter: pick the lean frame template when the current
 * request targets a (matching) Turbo Frame, otherwise the full template.
 *
 *     {% extends 'page.html.twig'|turbo_frame('main') %}
 *
 * When rendering inside a matching frame and no base template is given, the
 * filter first looks for a `-frame` sibling of the template
 * (`page.html.twig` → `page-frame.html.twig`); if that template exists it wins,
 * otherwise it falls back to the configured base template. Pass an explicit base
 * template to skip the convention lookup:
 *
 *     {% extends 'page.html.twig'|turbo_frame('main', 'layout/_frame.html.twig') %}
 *
 * Also adds two functions for templates that branch on the frame themselves:
 * `turbo_frame_request(frameId = null)` (is this a request for any frame, or for
 * that one?) and `turbo_frame_id()` (the requesting frame, so a fragment can echo
 * whichever frame asked, e.g. an error page rendered inside a modal frame):
 *
 *     {% extends turbo_frame_request() ? 'base-frame.html.twig' : 'base-modal.html.twig' %}
 *     <turbo-frame id="{{ turbo_frame_id() }}">…</turbo-frame>
 *
 * `turbo_request_id()` returns the `X-Turbo-Request-Id` of the request, for the
 * `request-id` of a broadcast `refresh` stream.
 *
 * The `turbo_stream` filter wraps its content in a `<turbo-stream>` of any action,
 * a custom one included:
 *
 *     {% apply turbo_stream('append', 'flash-alerts') %}…{% endapply %}
 *     {{ ''|turbo_stream('modalClose', 'app-modal') }}
 *
 * The `turbo_stream` function takes the action first, with optional target and
 * content: `{{ turbo_stream('remove', 'project_1') }}`. Plain content is escaped;
 * content captured with Twig's `set` tag retains its rendered HTML.
 *
 * Classic AbstractExtension form (not the `#[AsTwigFilter]` attribute) so the
 * bundle keeps working on Symfony 6.4 / 7.0-7.2, where attribute-based Twig
 * extensions are not auto-registered.
 */
final class TurboExtension extends AbstractExtension
{
    public function __construct(
        private readonly TurboManager $turboManager,
        private readonly string $baseTemplate = 'base-frame.html.twig',
    ) {
    }

    /**
     * @return list<TwigFilter>
     */
    public function getFilters(): array
    {
        return [
            new TwigFilter('turbo_frame', $this->turboFrame(...), ['needs_environment' => true]),
            new TwigFilter('turbo_stream', $this->turboStream(...), ['pre_escape' => 'html', 'is_safe' => ['html']]),
        ];
    }

    /**
     * @return list<TwigFunction>
     */
    public function getFunctions(): array
    {
        return [
            new TwigFunction('turbo_frame_request', $this->isTurboFrameRequest(...)),
            new TwigFunction('turbo_frame_id', $this->turboFrameId(...)),
            new TwigFunction('turbo_request_id', $this->turboRequestId(...)),
            new TwigFunction('turbo_stream', $this->renderTurboStream(...), ['needs_environment' => true, 'is_safe' => ['html']]),
        ];
    }

    /**
     * Whether the current request targets a Turbo Frame: any frame, or the given one.
     */
    public function isTurboFrameRequest(?string $frameId = null): bool
    {
        return $this->turboManager->hasTurboFrame()
            && (null === $frameId || $frameId === $this->turboManager->getTurboFrameId());
    }

    /**
     * The id of the frame that sent the request, or null outside a frame request.
     */
    public function turboFrameId(): ?string
    {
        return $this->turboManager->getTurboFrameId();
    }

    /**
     * The `X-Turbo-Request-Id` of the current request, or null (Turbo 7, or no Turbo request).
     */
    public function turboRequestId(): ?string
    {
        return $this->turboManager->getTurboRequestId();
    }

    /**
     * @param string|null $baseTemplate per-call override of the configured base template
     */
    public function turboFrame(Environment $environment, string $template, ?string $frameId = null, ?string $baseTemplate = null): string
    {
        if (!$this->isTurboFrameRequest($frameId)) {
            return $template;
        }

        if (null === $baseTemplate) {
            // Before the first dot of the file name, not of the path: "v1.2/page.html.twig" → "v1.2/page-frame.html.twig"
            $slash = strrpos($template, '/');
            $dot = strpos($template, '.', false === $slash ? 0 : $slash + 1);
            $frameTemplate = false === $dot ? $template . '-frame' : substr_replace($template, '-frame', $dot, 0);
            if ($environment->getLoader()->exists($frameTemplate)) {
                return $frameTemplate;
            }
        }

        return $baseTemplate ?? $this->baseTemplate;
    }

    /**
     * Function counterpart of the filter: escape plain content, preserve captured Twig markup.
     *
     * @param array<string, string|int|float|bool|null> $attributes
     */
    public function renderTurboStream(Environment $environment, string $action, ?string $target = null, string|Stringable $content = '', ?string $targets = null, array $attributes = []): string
    {
        if (!$content instanceof Markup) {
            $content = htmlspecialchars((string) $content, \ENT_QUOTES | \ENT_SUBSTITUTE, $environment->getCharset());
        }

        return $this->turboStream($content, $action, $target, $targets, $attributes);
    }

    /**
     * Wraps the content in a `<turbo-stream>` of this action, built-in or custom: the
     * `<twig:Turbo:Stream:*>` components of symfony/ux-turbo cover the built-in ones only.
     * An empty content (`remove`, `refresh`, an action without one) gets no `<template>`.
     *
     * @param array<string, string|int|float|bool|null> $attributes more attributes of the stream:
     *                                                              `true` renders the name alone, `false` and `null` leave it out
     */
    public function turboStream(string|Stringable $content, string $action, ?string $target = null, ?string $targets = null, array $attributes = []): string
    {
        if (null !== $target && null !== $targets) {
            throw new InvalidArgumentException(sprintf('The "%s" Turbo Stream takes a target or targets, not both.', $action));
        }

        $html = '<turbo-stream';
        foreach (['action' => $action, 'target' => $target, 'targets' => $targets] + $attributes as $name => $value) {
            if (null === $value || false === $value) {
                continue;
            }
            $html .= true === $value ? ' ' . $name : sprintf(' %s="%s"', $name, htmlspecialchars((string) $value, \ENT_QUOTES | \ENT_SUBSTITUTE, 'UTF-8'));
        }
        $content = (string) $content;

        return $html . '>' . ('' === $content ? '' : '<template>' . $content . '</template>') . '</turbo-stream>';
    }
}
