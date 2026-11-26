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

use Psr\Log\LoggerInterface;
use Silarhi\TurboBundle\TurboManager;

use function sprintf;

use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Logs a warning when the answer to a Turbo Frame request has no `<turbo-frame>`
 * of that id: the browser shows "Content missing" in the frame, and its console
 * says no more. A development aid: SilarhiTurboBundle registers it when
 * `kernel.debug` is on.
 *
 * Reads the request headers itself rather than through TurboManager, which
 * would make the response vary on them.
 */
final readonly class TurboFrameMissingListener implements EventSubscriberInterface
{
    public function __construct(
        private ?LoggerInterface $logger,
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
        $frameId = $event->getRequest()->headers->get('Turbo-Frame');
        if (!$this->logger instanceof LoggerInterface || !$event->isMainRequest() || null === $frameId || !$this->isFrameContent($event->getResponse())) {
            return;
        }

        $content = (string) $event->getResponse()->getContent();
        if (1 === preg_match(sprintf('/<turbo-frame\b[^>]*\sid\s*=\s*(["\']?)%s\1[\s>\/]/i', preg_quote($frameId, '/')), $content)) {
            return;
        }

        $this->logger->warning(sprintf('The response to the "%s" Turbo Frame has no <turbo-frame id="%s">: the browser shows "Content missing" in the frame.', $frameId, $frameId), [
            'frame' => $frameId,
            'uri' => $event->getRequest()->getRequestUri(),
            'status' => $event->getResponse()->getStatusCode(),
        ]);
    }

    /**
     * Whether Turbo renders the response in the frame: HTML with a body, a success
     * or a client error (an invalid form answers 422). A server error is logged
     * already, and a Turbo Stream answer needs no frame.
     */
    private function isFrameContent(Response $response): bool
    {
        if (Response::HTTP_NO_CONTENT === $response->getStatusCode()
            || !$response->isSuccessful() && !$response->isClientError()
            || false === $response->getContent()) {
            return false;
        }

        $contentType = (string) $response->headers->get('Content-Type');

        return !str_starts_with($contentType, TurboManager::STREAM_CONTENT_TYPE)
            && ('' === $contentType || str_contains($contentType, 'html'));
    }
}
