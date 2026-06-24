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

namespace Silarhi\TurboBundle\Tests\Twig;

use PHPUnit\Framework\TestCase;
use Silarhi\TurboBundle\TurboManager;
use Silarhi\TurboBundle\Twig\TurboExtension;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;

class TurboExtensionTest extends TestCase
{
    public function testReturnsTemplateOutsideAnyTurboFrame(): void
    {
        self::assertSame('page.html.twig', $this->extensionFor(new Request())->turboFrame('page.html.twig'));
    }

    public function testReturnsBaseTemplateInsideAnyTurboFrame(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'sidebar');

        self::assertSame('base-frame.html.twig', $this->extensionFor($request)->turboFrame('page.html.twig'));
    }

    public function testReturnsTemplateWhenFrameIdDoesNotMatch(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'sidebar');

        self::assertSame('page.html.twig', $this->extensionFor($request)->turboFrame('page.html.twig', 'main'));
    }

    public function testReturnsBaseTemplateWhenFrameIdMatches(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'main');

        self::assertSame('base-frame.html.twig', $this->extensionFor($request)->turboFrame('page.html.twig', 'main'));
    }

    public function testUsesTheConfiguredBaseTemplate(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'main');

        $extension = $this->extensionFor($request, 'layout/_frame.html.twig');
        self::assertSame('layout/_frame.html.twig', $extension->turboFrame('page.html.twig'));
    }

    public function testPerCallBaseTemplateOverridesTheConfiguredOne(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'main');

        $result = $this->extensionFor($request)->turboFrame('page.html.twig', null, 'custom.html.twig');
        self::assertSame('custom.html.twig', $result);
    }

    private function extensionFor(Request $request, string $baseTemplate = 'base-frame.html.twig'): TurboExtension
    {
        $stack = new RequestStack();
        $stack->push($request);

        return new TurboExtension(new TurboManager($stack), $baseTemplate);
    }
}
