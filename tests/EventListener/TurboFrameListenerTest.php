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
use Symfony\Component\EventDispatcher\EventDispatcher;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\HttpKernelInterface;
use Symfony\Component\HttpKernel\KernelEvents;

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

    public function testRedirectHeadersAndCookiesAreKeptOnTheTurboLocationResponse(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'my_frame');
        $redirect = new RedirectResponse('/target', Response::HTTP_SEE_OTHER, ['X-Custom' => 'kept']);
        $redirect->headers->setCookie(Cookie::create('remember', 'me'));
        $redirect->setPrivate();
        $redirect->setMaxAge(0);

        $response = $this->dispatch($request, $redirect)->getResponse();

        self::assertSame(Response::HTTP_NO_CONTENT, $response->getStatusCode());
        self::assertSame('/target', $response->headers->get('Turbo-Location'));
        self::assertFalse($response->headers->has('Location'));
        self::assertFalse($response->headers->has('Content-Type'));
        self::assertSame('kept', $response->headers->get('X-Custom'));
        self::assertSame('max-age=0, private', $response->headers->get('Cache-Control'));
        self::assertCount(1, $response->headers->getCookies());
        self::assertSame('me', $response->headers->getCookies()[0]->getValue());
        self::assertSame('', $response->getContent());
        // The 204 owns its headers: changing it leaves the original redirect untouched
        self::assertTrue($redirect->headers->has('Location'));
    }

    public function testDeleteRedirectIsLeftUntouchedForAFrameThatFollowsRedirects(): void
    {
        $request = Request::create('/resource', 'DELETE');
        $request->headers->set('X-Turbo-Request-Id', 'abc');
        $request->headers->set('Turbo-Frame', 'my_frame');
        $request->headers->set('Turbo-Frame-Follow-Redirect', '1');
        $original = new RedirectResponse('/list', Response::HTTP_SEE_OTHER);

        $event = $this->dispatch($request, $original);
        self::assertSame($original, $event->getResponse());
    }

    public function testDeleteRedirectFromAPlainFrameIsConverted(): void
    {
        $request = Request::create('/resource', 'DELETE');
        $request->headers->set('X-Turbo-Request-Id', 'abc');
        $request->headers->set('Turbo-Frame', 'my_frame');

        $response = $this->dispatch($request, new RedirectResponse('/list'), followDeleteRedirects: false)->getResponse();
        self::assertSame(Response::HTTP_NO_CONTENT, $response->getStatusCode());
        self::assertSame('/list', $response->headers->get('Turbo-Location'));
    }

    public function testNotModifiedResponseIsLeftUntouched(): void
    {
        // A frame revalidated with an ETag: the browser must get the 304 to reuse its cached copy
        $request = new Request(server: ['HTTP_IF_NONE_MATCH' => '"v1"']);
        $request->headers->set('Turbo-Frame', 'my_frame');
        $original = (new Response('frame'))->setEtag('v1');
        self::assertTrue($original->isNotModified($request));

        $event = $this->dispatch($request, $original);
        self::assertSame($original, $event->getResponse());
        self::assertSame(Response::HTTP_NOT_MODIFIED, $event->getResponse()->getStatusCode());
    }

    public function testRedirectionWithoutLocationIsLeftUntouched(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'my_frame');
        $original = new Response('choose', Response::HTTP_MULTIPLE_CHOICES);

        $event = $this->dispatch($request, $original);
        self::assertSame($original, $event->getResponse());
    }

    public function testNonRedirectResponseIsLeftUntouched(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'my_frame');
        $original = new Response('body', Response::HTTP_OK);

        $event = $this->dispatch($request, $original);
        self::assertSame($original, $event->getResponse());
    }

    public function testResponseThatReadTheFrameHeaderVariesOnIt(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'my_frame');
        $stack = new RequestStack();
        $stack->push($request);
        // What the `turbo_frame` filter does while rendering the page
        (new TurboManager($stack))->getTurboFrameId();

        $response = $this->dispatch($request, new Response('frame', Response::HTTP_OK, ['Vary' => 'Accept-Encoding']))->getResponse();
        self::assertSame(['Accept-Encoding', 'Turbo-Frame'], $response->getVary());
    }

    public function testFullPageThatReadTheFrameHeaderVariesOnIt(): void
    {
        // The full layout depends on the header being absent: it must not be served to a frame either
        $request = new Request();
        $stack = new RequestStack();
        $stack->push($request);
        self::assertFalse((new TurboManager($stack))->hasTurboFrame());

        $response = $this->dispatch($request, new Response('page'))->getResponse();
        self::assertSame(['Turbo-Frame'], $response->getVary());
    }

    public function testResponseThatNeverReadTheFrameHeaderDoesNotVaryOnIt(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'my_frame');

        $response = $this->dispatch($request, new Response('body'))->getResponse();
        self::assertSame([], $response->getVary());
    }

    public function testConvertedFrameRedirectVariesOnTheFrameHeader(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'my_frame');

        $response = $this->dispatch($request, new RedirectResponse('/target'))->getResponse();
        self::assertSame(Response::HTTP_NO_CONTENT, $response->getStatusCode());
        self::assertSame(['Turbo-Frame'], $response->getVary());
    }

    public function testFragmentThatReadTheFrameHeaderMakesTheMainResponseVary(): void
    {
        $main = new Request();
        $main->headers->set('Turbo-Frame', 'my_frame');
        $fragment = Request::create('/_fragment');
        $fragment->headers->set('Turbo-Frame', 'my_frame');
        $stack = new RequestStack();
        $stack->push($main);
        $stack->push($fragment);
        (new TurboManager($stack))->hasTurboFrame();
        $stack->pop();

        $response = $this->dispatch($main, new Response('page'))->getResponse();
        self::assertSame(['Turbo-Frame'], $response->getVary());
    }

    public function testSubscribesToKernelResponse(): void
    {
        self::assertSame(
            [KernelEvents::RESPONSE => 'onKernelResponse'],
            TurboFrameListener::getSubscribedEvents(),
        );
    }

    public function testConvertsFrameRedirectWhenRegisteredOnAnEventDispatcher(): void
    {
        $request = new Request();
        $request->headers->set('Turbo-Frame', 'my_frame');
        $stack = new RequestStack();
        $stack->push($request);

        $dispatcher = new EventDispatcher();
        $dispatcher->addSubscriber(new TurboFrameListener(new TurboManager($stack)));

        $event = new ResponseEvent(
            self::createStub(HttpKernelInterface::class),
            $request,
            HttpKernelInterface::MAIN_REQUEST,
            new RedirectResponse('/target'),
        );
        $dispatcher->dispatch($event, KernelEvents::RESPONSE);

        self::assertSame(Response::HTTP_NO_CONTENT, $event->getResponse()->getStatusCode());
        self::assertSame('/target', $event->getResponse()->headers->get('Turbo-Location'));
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
