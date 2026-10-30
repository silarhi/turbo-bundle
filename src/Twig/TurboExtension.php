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

use Silarhi\TurboBundle\TurboManager;
use Twig\Environment;
use Twig\Extension\AbstractExtension;
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
}
