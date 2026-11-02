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

namespace Silarhi\TurboBundle\Tests;

use PHPUnit\Framework\TestCase;
use Silarhi\TurboBundle\TurboStreamRenderer;
use Symfony\Component\HttpFoundation\Response;
use Twig\Environment;
use Twig\Loader\ArrayLoader;

class TurboStreamRendererTest extends TestCase
{
    public function testRendersTheTemplateAsATurboStreamResponse(): void
    {
        $response = $this->renderer()->render('project/remove.stream.html.twig', ['id' => 1]);

        self::assertSame(Response::HTTP_OK, $response->getStatusCode());
        self::assertSame('text/vnd.turbo-stream.html', $response->headers->get('Content-Type'));
        self::assertSame('<turbo-stream action="remove" target="project_1"></turbo-stream>', $response->getContent());
    }

    public function testRendersOnlyTheGivenBlock(): void
    {
        $response = $this->renderer()->render('project/edit.html.twig', ['id' => 1], 'success_stream');

        self::assertSame('<turbo-stream action="remove" target="project_1"></turbo-stream>', $response->getContent());
    }

    public function testAnswersTheGivenStatus(): void
    {
        $response = $this->renderer()->render('project/edit.html.twig', ['id' => 1], 'error_stream', Response::HTTP_UNPROCESSABLE_ENTITY);

        self::assertSame(Response::HTTP_UNPROCESSABLE_ENTITY, $response->getStatusCode());
        self::assertSame('text/vnd.turbo-stream.html', $response->headers->get('Content-Type'));
    }

    private function renderer(): TurboStreamRenderer
    {
        return new TurboStreamRenderer(new Environment(new ArrayLoader([
            'project/remove.stream.html.twig' => '<turbo-stream action="remove" target="project_{{ id }}"></turbo-stream>',
            'project/edit.html.twig' => '<form>…</form>'
                . '{% block success_stream %}<turbo-stream action="remove" target="project_{{ id }}"></turbo-stream>{% endblock %}'
                . '{% block error_stream %}<turbo-stream action="replace" target="form_{{ id }}"></turbo-stream>{% endblock %}',
        ])));
    }
}
