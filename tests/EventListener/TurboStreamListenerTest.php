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

namespace Silarhi\TurboBundle\Tests\EventListener;

use PHPUnit\Framework\TestCase;
use Silarhi\TurboBundle\EventListener\TurboStreamListener;
use Silarhi\TurboBundle\TurboManager;
use Silarhi\TurboBundle\TurboStreamBuilder;
use Silarhi\TurboBundle\TurboStreamCollector;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\HttpKernelInterface;
use Symfony\Component\HttpKernel\KernelEvents;

class TurboStreamListenerTest extends TestCase
{
    private const REMOVE = '<turbo-stream action="remove" target="item_1"></turbo-stream>';

    public function testAppendsTheCollectedStreamsToAStreamResponse(): void
    {
        $response = new Response('<turbo-stream action="refresh"></turbo-stream>', Response::HTTP_OK, [
            'Content-Type' => TurboManager::STREAM_CONTENT_TYPE . '; charset=UTF-8',
            'Content-Length' => '46',
        ]);

        [$event, $turboStreams] = $this->dispatch($response);

        self::assertSame('<turbo-stream action="refresh"></turbo-stream>' . self::REMOVE, $event->getResponse()->getContent());
        self::assertFalse($event->getResponse()->headers->has('Content-Length'));
        self::assertFalse($turboStreams->hasStreams());
    }

    public function testLeavesOtherResponsesAlone(): void
    {
        foreach ([new Response('<html></html>'), new RedirectResponse('/list')] as $response) {
            $content = $response->getContent();
            [$event, $turboStreams] = $this->dispatch($response);

            self::assertSame($content, $event->getResponse()->getContent());
            self::assertTrue($turboStreams->hasStreams());
        }
    }

    public function testLeavesAStreamedResponseAlone(): void
    {
        $response = new StreamedResponse(static function (): void {}, Response::HTTP_OK, ['Content-Type' => TurboManager::STREAM_CONTENT_TYPE]);

        [$event] = $this->dispatch($response);
        self::assertFalse($event->getResponse()->getContent());
    }

    public function testLeavesASubRequestAlone(): void
    {
        $response = new Response('', Response::HTTP_OK, ['Content-Type' => TurboManager::STREAM_CONTENT_TYPE]);

        [$event] = $this->dispatch($response, HttpKernelInterface::SUB_REQUEST);
        self::assertSame('', $event->getResponse()->getContent());
    }

    public function testSubscribesToKernelResponse(): void
    {
        self::assertSame([KernelEvents::RESPONSE => 'onKernelResponse'], TurboStreamListener::getSubscribedEvents());
    }

    /**
     * @return array{ResponseEvent, TurboStreamCollector}
     */
    private function dispatch(Response $response, int $requestType = HttpKernelInterface::MAIN_REQUEST): array
    {
        $request = new Request();
        $stack = new RequestStack();
        $stack->push($request);
        $turboStreams = (new TurboStreamCollector($stack, new TurboStreamBuilder()))->remove('item_1');

        $event = new ResponseEvent(self::createStub(HttpKernelInterface::class), $request, $requestType, $response);
        (new TurboStreamListener($turboStreams))->onKernelResponse($event);

        return [$event, $turboStreams];
    }
}
