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

use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;

/**
 * Reads the Turbo request headers off the current request. Without a current
 * request (console command, message handler, email rendering) every method
 * answers as for a plain, non-Turbo request.
 *
 * Depends on nothing but the HttpFoundation RequestStack, so it works in a
 * full Symfony app and in any project that wires Symfony components by hand.
 *
 * Reading the `Turbo-Frame` header flags the request (and the main request), so
 * TurboFrameListener adds `Vary: Turbo-Frame` to responses that depend on it.
 */
final readonly class TurboManager
{
    public const VARY_ATTRIBUTE = '_turbo_frame_vary';

    public function __construct(
        private RequestStack $requestStack,
    ) {
    }

    public function hasTurboFrame(): bool
    {
        return $this->getFrameRequest()?->headers->has('turbo-frame') ?? false;
    }

    public function getTurboFrameId(): ?string
    {
        return $this->getFrameRequest()?->headers->get('turbo-frame');
    }

    public function followTurboFrameRedirect(): bool
    {
        return $this->hasTurboFrame()
            && false === $this->getRequest()?->headers->has('turbo-frame-follow-redirect');
    }

    public function isTurboRequest(): bool
    {
        return $this->getRequest()?->headers->has('x-turbo-request-id') ?? false;
    }

    // No current request (console command, message handler, email rendering): not a Turbo request
    private function getRequest(): ?Request
    {
        return $this->requestStack->getCurrentRequest();
    }

    // The main request too: an inline fragment that branches on the frame changes the whole page
    private function getFrameRequest(): ?Request
    {
        $request = $this->getRequest();
        $request?->attributes->set(self::VARY_ATTRIBUTE, true);
        $this->requestStack->getMainRequest()?->attributes->set(self::VARY_ATTRIBUTE, true);

        return $request;
    }
}
