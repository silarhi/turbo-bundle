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
use Silarhi\TurboBundle\EventListener\TurboFrameListener;
use Silarhi\TurboBundle\TurboManager;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\HttpKernelInterface;

class TurboFrameListenerTest extends TestCase
{
    public function testFrameRedirectIsConvertedToTurboLocation(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'my_frame');

        $response = $this->dispatch($request, new RedirectResponse('/target'))->getResponse();
        self::assertSame(Response::HTTP_NO_CONTENT, $response->getStatusCode());
        self::assertSame('/target', $response->headers->get('Turbo-Location'));
    }

    public function testDeleteTurboRequestRedirectIsConverted(): void
    {
        $request = Request::create('/resource', 'DELETE');
        $request->headers->set('X-Turbo-Request-Id', 'abc');

        $response = $this->dispatch($request, new RedirectResponse('/list'))->getResponse();
        self::assertSame(Response::HTTP_NO_CONTENT, $response->getStatusCode());
        self::assertSame('/list', $response->headers->get('Turbo-Location'));
    }

    public function testDeleteRedirectIsNotConvertedWhenDisabled(): void
    {
        $request = Request::create('/resource', 'DELETE');
        $request->headers->set('X-Turbo-Request-Id', 'abc');

        $event = $this->dispatch($request, new RedirectResponse('/list'), followDeleteRedirects: false);
        self::assertTrue($event->getResponse()->isRedirection());
    }

    public function testRedirectIsLeftUntouchedWhenAlreadyFollowing(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'my_frame');
        $request->headers->set('Turbo-Frame-Follow-Redirect', '1');

        $event = $this->dispatch($request, new RedirectResponse('/target'));
        self::assertTrue($event->getResponse()->isRedirection());
    }

    public function testNonRedirectResponseIsLeftUntouched(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'my_frame');
        $original = new Response('body', Response::HTTP_OK);

        $event = $this->dispatch($request, $original);
        self::assertSame($original, $event->getResponse());
    }

    private function dispatch(Request $request, Response $response, bool $followDeleteRedirects = true): ResponseEvent
    {
        $stack = new RequestStack();
        $stack->push($request);
        $listener = new TurboFrameListener(new TurboManager($stack), $followDeleteRedirects);

        $event = new ResponseEvent(
            self::createStub(HttpKernelInterface::class),
            $request,
            HttpKernelInterface::MAIN_REQUEST,
            $response,
        );
        $listener->onKernelResponse($event);

        return $event;
    }
}
