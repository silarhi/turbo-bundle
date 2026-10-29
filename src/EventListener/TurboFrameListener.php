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
        $this->convertFrameRedirect($event);

        // A shared cache must not serve the frame layout of a page to a full visit, or the other way round
        if (true === $event->getRequest()->attributes->get(TurboManager::VARY_ATTRIBUTE)) {
            $event->getResponse()->setVary('Turbo-Frame', false);
        }
    }

    private function convertFrameRedirect(ResponseEvent $event): void
    {
        $response = $event->getResponse();
        // Only redirects to somewhere: a 304 Not Modified (frame revalidated with an ETag) is a 3xx without Location
        if (!$response->isRedirection() || !$response->headers->has('Location')) {
            return;
        }

        $request = $event->getRequest();
        // A frame with `data-turbo-follow-redirect` keeps every redirect, DELETE ones included
        if ($request->headers->has('Turbo-Frame-Follow-Redirect')) {
            return;
        }

        $shouldFollow = $this->turboManager->followTurboFrameRedirect()
            || ($this->followDeleteRedirects && $request->isMethod('DELETE') && $this->turboManager->isTurboRequest());

        if (!$shouldFollow) {
            return;
        }

        $event->setResponse($this->toTurboLocation($response));
    }

    /**
     * Keeps what the redirect carried (cookies, cache and custom headers): only the
     * status, the `Location` and the body headers change.
     */
    private function toTurboLocation(Response $redirect): Response
    {
        $response = new Response(null, Response::HTTP_NO_CONTENT);
        $response->headers = clone $redirect->headers;
        $response->headers->set('Turbo-Location', $redirect->headers->get('Location'));
        $response->headers->remove('Location');
        $response->headers->remove('Content-Type');
        $response->headers->remove('Content-Length');

        return $response;
    }
}
