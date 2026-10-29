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
use Silarhi\TurboBundle\TurboManager;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;

class TurboManagerTest extends TestCase
{
    public function testHasTurboFrameReadsHeader(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'my_frame');

        $manager = $this->managerFor($request);
        self::assertTrue($manager->hasTurboFrame());
        self::assertSame('my_frame', $manager->getTurboFrameId());
    }

    public function testHasTurboFrameIsFalseWithoutHeader(): void
    {
        $manager = $this->managerFor(new Request());
        self::assertFalse($manager->hasTurboFrame());
        self::assertNull($manager->getTurboFrameId());
    }

    public function testReadingTheFrameHeaderFlagsTheRequestForVary(): void
    {
        $request = new Request();
        $this->managerFor($request)->getTurboFrameId();

        self::assertTrue($request->attributes->get(TurboManager::VARY_ATTRIBUTE));
    }

    public function testReadingOnlyTheRequestIdDoesNotFlagTheRequestForVary(): void
    {
        $request = new Request();
        $this->managerFor($request)->isTurboRequest();

        self::assertFalse($request->attributes->has(TurboManager::VARY_ATTRIBUTE));
    }

    public function testFollowTurboFrameRedirectRequiresFrameWithoutFollowHeader(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'my_frame');

        self::assertTrue($this->managerFor($request)->followTurboFrameRedirect());
    }

    public function testFollowTurboFrameRedirectIsFalseWhenAlreadyFollowing(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'my_frame');
        $request->headers->set('Turbo-Frame-Follow-Redirect', '1');

        self::assertFalse($this->managerFor($request)->followTurboFrameRedirect());
    }

    public function testFollowTurboFrameRedirectIsFalseWithoutFrame(): void
    {
        self::assertFalse($this->managerFor(new Request())->followTurboFrameRedirect());
    }

    public function testIsTurboRequestReadsRequestIdHeader(): void
    {
        $request = new Request();
        $request->headers->set('X-Turbo-Request-Id', 'abc');

        self::assertTrue($this->managerFor($request)->isTurboRequest());
        self::assertFalse($this->managerFor(new Request())->isTurboRequest());
    }

    public function testIsTurboRequestReadsTheStreamAcceptOfTurbo7Submissions(): void
    {
        // Turbo 7 sends no X-Turbo-Request-Id, but accepts Turbo Streams on its form submissions
        $request = Request::create('/resource', 'DELETE');
        $request->headers->set('Accept', 'text/vnd.turbo-stream.html, text/html, application/xhtml+xml');

        self::assertTrue($this->managerFor($request)->isTurboRequest());

        $request->headers->set('Accept', 'text/html, application/xhtml+xml');
        self::assertFalse($this->managerFor($request)->isTurboRequest());
    }

    public function testAnswersAsAPlainRequestWithoutACurrentRequest(): void
    {
        $manager = new TurboManager(new RequestStack());

        self::assertFalse($manager->hasTurboFrame());
        self::assertNull($manager->getTurboFrameId());
        self::assertFalse($manager->followTurboFrameRedirect());
        self::assertFalse($manager->isTurboRequest());
    }

    private function managerFor(Request $request): TurboManager
    {
        $stack = new RequestStack();
        $stack->push($request);

        return new TurboManager($stack);
    }
}
