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
use RuntimeException;
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

    public function testThrowsWhenNoCurrentRequest(): void
    {
        $manager = new TurboManager(new RequestStack());

        $this->expectException(RuntimeException::class);
        $manager->isTurboRequest();
    }

    private function managerFor(Request $request): TurboManager
    {
        $stack = new RequestStack();
        $stack->push($request);

        return new TurboManager($stack);
    }
}
