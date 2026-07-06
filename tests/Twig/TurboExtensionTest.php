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
use Twig\Environment;
use Twig\Loader\ArrayLoader;

class TurboExtensionTest extends TestCase
{
    public function testReturnsTemplateOutsideAnyTurboFrame(): void
    {
        $result = $this->extensionFor(new Request())->turboFrame($this->environment(), 'page.html.twig');

        self::assertSame('page.html.twig', $result);
    }

    public function testReturnsBaseTemplateInsideAnyTurboFrame(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'sidebar');

        $result = $this->extensionFor($request)->turboFrame($this->environment(), 'page.html.twig');

        self::assertSame('base-frame.html.twig', $result);
    }

    public function testReturnsTemplateWhenFrameIdDoesNotMatch(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'sidebar');

        $result = $this->extensionFor($request)->turboFrame($this->environment(), 'page.html.twig', 'main');

        self::assertSame('page.html.twig', $result);
    }

    public function testReturnsBaseTemplateWhenFrameIdMatches(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'main');

        $result = $this->extensionFor($request)->turboFrame($this->environment(), 'page.html.twig', 'main');

        self::assertSame('base-frame.html.twig', $result);
    }

    public function testUsesTheConfiguredBaseTemplate(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'main');

        $extension = $this->extensionFor($request, 'layout/_frame.html.twig');

        self::assertSame('layout/_frame.html.twig', $extension->turboFrame($this->environment(), 'page.html.twig'));
    }

    public function testPerCallBaseTemplateOverridesTheConfiguredOne(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'main');

        $result = $this->extensionFor($request)->turboFrame($this->environment(), 'page.html.twig', null, 'custom.html.twig');

        self::assertSame('custom.html.twig', $result);
    }

    public function testPrefersTheFrameSiblingConventionWhenItExists(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'main');

        $environment = $this->environment('page-frame.html.twig');
        $result = $this->extensionFor($request)->turboFrame($environment, 'page.html.twig');

        self::assertSame('page-frame.html.twig', $result);
    }

    public function testFallsBackToBaseTemplateWhenNoFrameSiblingExists(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'main');

        // Loader knows the full template but not its `-frame` sibling.
        $environment = $this->environment('page.html.twig');
        $result = $this->extensionFor($request)->turboFrame($environment, 'page.html.twig');

        self::assertSame('base-frame.html.twig', $result);
    }

    public function testFrameSiblingIsResolvedNextToTheTemplateInItsDirectory(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'main');

        $environment = $this->environment('project/show-frame.html.twig');
        $result = $this->extensionFor($request)->turboFrame($environment, 'project/show.html.twig');

        self::assertSame('project/show-frame.html.twig', $result);
    }

    public function testExplicitBaseTemplateSkipsTheFrameSiblingConvention(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'main');

        // The `-frame` sibling exists, but an explicit base template must win over the convention.
        $environment = $this->environment('page-frame.html.twig');
        $result = $this->extensionFor($request)->turboFrame($environment, 'page.html.twig', null, 'layout/_frame.html.twig');

        self::assertSame('layout/_frame.html.twig', $result);
    }

    public function testFrameSiblingIsIgnoredWhenTheFrameDoesNotMatch(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'sidebar');

        // The sibling exists, but the request targets another frame: return the untouched template.
        $environment = $this->environment('page-frame.html.twig');
        $result = $this->extensionFor($request)->turboFrame($environment, 'page.html.twig', 'main');

        self::assertSame('page.html.twig', $result);
    }

    private function extensionFor(Request $request, string $baseTemplate = 'base-frame.html.twig'): TurboExtension
    {
        $stack = new RequestStack();
        $stack->push($request);

        return new TurboExtension(new TurboManager($stack), $baseTemplate);
    }

    private function environment(string ...$templates): Environment
    {
        return new Environment(new ArrayLoader(array_fill_keys($templates, '')));
    }
}
