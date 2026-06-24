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

use RuntimeException;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;

/**
 * Reads the Turbo request headers off the current request.
 *
 * Depends on nothing but the HttpFoundation RequestStack, so it works in a
 * full Symfony app and in any project that wires Symfony components by hand.
 */
final readonly class TurboManager
{
    public function __construct(
        private RequestStack $requestStack,
    ) {
    }

    public function hasTurboFrame(): bool
    {
        return $this->getRequest()->headers->has('turbo-frame');
    }

    public function getTurboFrameId(): ?string
    {
        return $this->getRequest()->headers->get('turbo-frame');
    }

    public function followTurboFrameRedirect(): bool
    {
        return $this->hasTurboFrame()
            && false === $this->getRequest()->headers->has('turbo-frame-follow-redirect');
    }

    public function isTurboRequest(): bool
    {
        return $this->getRequest()->headers->has('x-turbo-request-id');
    }

    private function getRequest(): Request
    {
        return $this->requestStack->getCurrentRequest()
            ?? throw new RuntimeException('No request available');
    }
}
