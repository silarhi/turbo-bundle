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

namespace Silarhi\TurboBundle\EventListener;

use Silarhi\TurboBundle\TurboManager;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Turns a redirect issued inside a Turbo Frame into a 204 + `Turbo-Location`
 * header, so the browser performs a full Drive visit instead of replacing the
 * frame with the redirect target. Pairs with the JS handler's
 * `turbo:before-fetch-response` interception.
 *
 * Implements EventSubscriberInterface only, so it can be added to any Symfony
 * event dispatcher (`$dispatcher->addSubscriber(...)`) without the framework.
 */
final readonly class TurboFrameListener implements EventSubscriberInterface
{
    public function __construct(
        private TurboManager $turboManager,
        private bool $followDeleteRedirects = true,
    ) {
    }

    /**
     * @return array<string, string>
     */
    public static function getSubscribedEvents(): array
    {
        return [
            KernelEvents::RESPONSE => 'onKernelResponse',
        ];
    }

    public function onKernelResponse(ResponseEvent $event): void
    {
        $response = $event->getResponse();
        if (!$response->isRedirection()) {
            return;
        }

        $request = $event->getRequest();
        $shouldFollow = $this->turboManager->followTurboFrameRedirect()
            || ($this->followDeleteRedirects && $request->isMethod('DELETE') && $this->turboManager->isTurboRequest());

        if (!$shouldFollow) {
            return;
        }

        $event->setResponse(new Response(null, Response::HTTP_NO_CONTENT, [
            'Turbo-Location' => $response->headers->get('Location'),
        ]));
    }
}
