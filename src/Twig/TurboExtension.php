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
use Twig\Extension\AbstractExtension;
use Twig\TwigFilter;

/**
 * Adds the `turbo_frame` filter: pick the lean base-frame template when the
 * current request targets a (matching) Turbo Frame, otherwise the full template.
 *
 *     {% extends app.request|turbo_frame('main', 'page.html.twig') %}
 *     {# or, relying on the configured base template: #}
 *     {% extends 'page.html.twig'|turbo_frame('main') %}
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
            new TwigFilter('turbo_frame', $this->turboFrame(...)),
        ];
    }

    /**
     * @param string|null $baseTemplate per-call override of the configured base template
     */
    public function turboFrame(string $template, ?string $frameId = null, ?string $baseTemplate = null): string
    {
        $matchesFrame = $this->turboManager->hasTurboFrame()
            && (null === $frameId || $frameId === $this->turboManager->getTurboFrameId());

        return $matchesFrame ? ($baseTemplate ?? $this->baseTemplate) : $template;
    }
}
