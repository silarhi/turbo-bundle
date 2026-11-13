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

namespace Silarhi\TurboBundle;

use Symfony\Component\HttpFoundation\Response;
use Twig\Environment;

/**
 * Renders a template, or one of its blocks, as a Turbo Stream response. The
 * streams of an action usually live in a block of its form template:
 *
 *     if ($turboManager->acceptsTurboStream()) {
 *         return $turboStreamRenderer->render('project/edit.html.twig', ['item' => $item], 'success_stream');
 *     }
 *
 * Depends on Twig only, so it works without symfony/ux-turbo and without the
 * framework. Unlike AbstractController::render(), it takes no form: pass
 * `$form->createView()`.
 */
final readonly class TurboStreamRenderer
{
    public function __construct(
        private Environment $twig,
    ) {
    }

    /**
     * @param array<string, mixed> $parameters
     */
    public function render(string $view, array $parameters = [], ?string $block = null, int $status = Response::HTTP_OK): Response
    {
        $content = null === $block
            ? $this->twig->render($view, $parameters)
            : $this->twig->load($view)->renderBlock($block, $parameters);

        return new Response($content, $status, ['Content-Type' => TurboManager::STREAM_CONTENT_TYPE]);
    }
}
