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
use Silarhi\TurboBundle\TurboStreamCollector;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Appends the streams of TurboStreamCollector to the Turbo Stream response of
 * the main request, whatever rendered it (TurboStreamRenderer, the
 * TurboStreamResponse of symfony/ux-turbo, a Response built by hand).
 *
 * Implements EventSubscriberInterface only, so it can be added to any Symfony
 * event dispatcher (`$dispatcher->addSubscriber(...)`) without the framework.
 */
final readonly class TurboStreamListener implements EventSubscriberInterface
{
    public function __construct(
        private TurboStreamCollector $turboStreams,
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
        if (!$event->isMainRequest() || !$this->turboStreams->hasStreams()) {
            return;
        }

        $response = $event->getResponse();
        if (!str_starts_with((string) $response->headers->get('Content-Type'), TurboManager::STREAM_CONTENT_TYPE)) {
            return;
        }

        // A streamed or binary response has no content to append to
        $content = $response->getContent();
        if (false === $content) {
            return;
        }

        $response->setContent($content . $this->turboStreams->flush());
        $response->headers->remove('Content-Length');
    }
}
