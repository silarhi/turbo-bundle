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

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Silarhi\TurboBundle\EventListener\TurboFrameMissingListener;
use Silarhi\TurboBundle\TurboManager;
use Symfony\Component\EventDispatcher\EventDispatcher;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\HttpKernelInterface;
use Symfony\Component\HttpKernel\KernelEvents;

class TurboFrameMissingListenerTest extends TestCase
{
    #[DataProvider('missingFrameProvider')]
    public function testWarnsWhenTheFrameIsMissing(Response $response): void
    {
        $logs = $this->dispatch($response);

        self::assertCount(1, $logs);
        self::assertSame('warning', $logs[0]['level']);
        self::assertSame('The response to the "modal" Turbo Frame has no <turbo-frame id="modal">: the browser shows "Content missing" in the frame.', $logs[0]['message']);
        self::assertSame(['frame' => 'modal', 'uri' => '/projects/1/edit', 'status' => $response->getStatusCode()], $logs[0]['context']);
    }

    /**
     * @return iterable<string, array{Response}>
     */
    public static function missingFrameProvider(): iterable
    {
        yield 'no frame' => [new Response('<html><body><p>Edit</p></body></html>')];
        yield 'another frame' => [new Response('<turbo-frame id="main"><p>Edit</p></turbo-frame>')];
        yield 'a longer id' => [new Response('<turbo-frame id="modal-2"></turbo-frame>')];
        yield 'a data-id' => [new Response('<turbo-frame data-id="modal"></turbo-frame>')];
        yield 'an invalid form' => [new Response('<form></form>', Response::HTTP_UNPROCESSABLE_ENTITY)];
        yield 'an empty page' => [new Response('')];
    }

    #[DataProvider('foundFrameProvider')]
    public function testStaysQuietWhenTheFrameIsThere(Response $response): void
    {
        self::assertSame([], $this->dispatch($response));
    }

    /**
     * @return iterable<string, array{Response}>
     */
    public static function foundFrameProvider(): iterable
    {
        yield 'double quotes' => [new Response('<html><turbo-frame id="modal"><p>Edit</p></turbo-frame></html>')];
        yield 'single quotes and attributes' => [new Response("<turbo-frame class=\"x\" id='modal' target=\"_top\"></turbo-frame>")];
        yield 'no quotes, upper case' => [new Response('<TURBO-FRAME ID=modal></TURBO-FRAME>')];
    }

    #[DataProvider('ignoredResponseProvider')]
    public function testIgnoresResponsesTurboDoesNotRenderInTheFrame(Response $response): void
    {
        self::assertSame([], $this->dispatch($response));
    }

    /**
     * @return iterable<string, array{Response}>
     */
    public static function ignoredResponseProvider(): iterable
    {
        yield 'a redirect' => [new RedirectResponse('/list')];
        yield 'a Turbo-Location' => [new Response(null, Response::HTTP_NO_CONTENT, ['Turbo-Location' => '/list'])];
        yield 'a Turbo Stream' => [new Response('<turbo-stream></turbo-stream>', Response::HTTP_OK, ['Content-Type' => TurboManager::STREAM_CONTENT_TYPE])];
        yield 'JSON' => [new Response('{}', Response::HTTP_OK, ['Content-Type' => 'application/json'])];
        yield 'a server error' => [new Response('Oops', Response::HTTP_INTERNAL_SERVER_ERROR)];
        yield 'a streamed response' => [new StreamedResponse(static function (): void {})];
    }

    public function testIgnoresRequestsOutsideAFrame(): void
    {
        self::assertSame([], $this->dispatch(new Response('<p>Edit</p>'), frameId: null));
    }

    public function testIgnoresSubRequests(): void
    {
        self::assertSame([], $this->dispatch(new Response('<p>Edit</p>'), requestType: HttpKernelInterface::SUB_REQUEST));
    }

    public function testDoesNothingWithoutALogger(): void
    {
        $request = Request::create('/projects/1/edit');
        $request->headers->set('Turbo-Frame', 'modal');
        $event = new ResponseEvent(self::createStub(HttpKernelInterface::class), $request, HttpKernelInterface::MAIN_REQUEST, new Response('<p>Edit</p>'));

        (new TurboFrameMissingListener(null))->onKernelResponse($event);
        self::assertSame('<p>Edit</p>', $event->getResponse()->getContent());
    }

    public function testDoesNotMakeTheResponseVaryOnTheFrame(): void
    {
        $request = Request::create('/projects/1/edit');
        $request->headers->set('Turbo-Frame', 'modal');
        $event = new ResponseEvent(self::createStub(HttpKernelInterface::class), $request, HttpKernelInterface::MAIN_REQUEST, new Response('<p>Edit</p>'));

        (new TurboFrameMissingListener(new RecordingLogger()))->onKernelResponse($event);
        self::assertFalse($request->attributes->has(TurboManager::VARY_ATTRIBUTE));
    }

    /**
     * @return list<array{level: mixed, message: string, context: array<mixed>}>
     */
    private function dispatch(Response $response, ?string $frameId = 'modal', int $requestType = HttpKernelInterface::MAIN_REQUEST): array
    {
        $request = Request::create('/projects/1/edit');
        if (null !== $frameId) {
            $request->headers->set('Turbo-Frame', $frameId);
        }
        $logger = new RecordingLogger();

        $dispatcher = new EventDispatcher();
        $dispatcher->addSubscriber(new TurboFrameMissingListener($logger));
        $dispatcher->dispatch(new ResponseEvent(self::createStub(HttpKernelInterface::class), $request, $requestType, $response), KernelEvents::RESPONSE);

        return $logger->logs;
    }
}
