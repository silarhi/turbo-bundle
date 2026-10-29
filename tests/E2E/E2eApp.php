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

namespace Silarhi\TurboBundle\Tests\E2E;

use Closure;
use Silarhi\TurboBundle\EventListener\TurboFrameListener;
use Silarhi\TurboBundle\TurboManager;
use Symfony\Component\EventDispatcher\EventDispatcher;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Controller\ArgumentResolver;
use Symfony\Component\HttpKernel\Controller\ControllerResolver;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\HttpKernel;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * The application of the end-to-end tests (assets/e2e), wired with Symfony components only, as the "Without the
 * framework" documentation page does: an HttpKernel, its event dispatcher and request stack, and TurboFrameListener.
 *
 * Every page loads Turbo and the built TurboHandler (tests/E2E/public/app.js), which logs each mount and unmount of a
 * [data-widget] element for the tests to read.
 */
final class E2eApp
{
    public static function kernel(): HttpKernel
    {
        $requestStack = new RequestStack();
        $dispatcher = new EventDispatcher();
        $dispatcher->addSubscriber(new TurboFrameListener(new TurboManager($requestStack)));
        $dispatcher->addListener(KernelEvents::REQUEST, static function (RequestEvent $event): void {
            $request = $event->getRequest();
            $request->attributes->set('_controller', self::route($request->getMethod(), $request->getPathInfo()));
        });

        return new HttpKernel($dispatcher, new ControllerResolver(), $requestStack, new ArgumentResolver());
    }

    private static function route(string $method, string $path): Closure
    {
        return match ("$method $path") {
            'GET /' => self::home(...),
            'GET /second' => static fn (): Response => self::page('Second', <<<'HTML'
                <p id="second" data-widget data-decorate>Second page</p>
                <turbo-frame id="follow-frame"><p id="followed" data-widget>Followed inside the frame</p></turbo-frame>
                HTML),
            'GET /frame/next' => static fn (): Response => self::page('Frame next', <<<'HTML'
                <turbo-frame id="frame"><p id="frame-next" data-widget data-decorate>Next frame content</p></turbo-frame>
                HTML),
            // A frame response with a stream outside the frame, as a layout appending its flash messages
            'GET /frame/streams' => static fn (): Response => self::page('Frame streams', <<<'HTML'
                <turbo-stream action="append" target="flashes"><template><p id="flash" data-widget>Saved</p></template></turbo-stream>
                <turbo-frame id="frame"><p id="frame-saved" data-widget>Saved frame</p></turbo-frame>
                HTML),
            'POST /frame/redirect', 'DELETE /items/1' => static fn (): Response => new RedirectResponse('/second'),
            'POST /invalid' => static fn (): Response => self::page('Invalid', '<p id="invalid" data-widget data-decorate>Invalid form</p>', 422),
            'POST /stream/append' => static fn (): Response => self::stream(<<<'HTML'
                <turbo-stream action="append" target="list"><template><li id="streamed" data-widget data-decorate>Streamed</li></template></turbo-stream>
                HTML),
            'POST /stream/remove' => static fn (): Response => self::stream('<turbo-stream action="remove" target="item"></turbo-stream>'),
            'GET /morph' => self::morph(...),
            // Back to the same page: Turbo 8 renders it as a refresh, morphed with turbo-refresh-method="morph"
            'POST /morph' => static function (Request $request): Response {
                $response = new RedirectResponse($request->getRequestUri(), Response::HTTP_SEE_OTHER);
                $response->headers->setCookie(Cookie::create('count', (string) (self::count($request) + 1)));

                return $response;
            },
            // A DELETE redirect followed by the browser ends here, as "DELETE /second"
            default => static fn (): Response => new Response('Not found', Response::HTTP_NOT_FOUND),
        };
    }

    private static function home(): Response
    {
        return self::page('Home', <<<'HTML'
            <p id="home" data-widget data-decorate>Home page</p>
            <a id="to-second" href="/second">Second page</a>
            <a id="delete" href="/items/1" data-turbo-method="delete">Delete</a>
            <form id="invalid-form" method="post" action="/invalid"><button>Submit an invalid form</button></form>
            <div id="flashes"></div>

            <turbo-frame id="frame">
                <p id="frame-content" data-widget data-decorate>Frame content</p>
                <a id="frame-link" href="/frame/next">Navigate the frame</a>
                <a id="frame-advance" href="/frame/next" data-turbo-action="advance">Navigate the frame and the URL</a>
                <a id="frame-missing" href="/second">Load a page without this frame</a>
                <a id="frame-streams" href="/frame/streams">Load a frame with streams</a>
                <form id="frame-redirect" method="post" action="/frame/redirect"><button>Redirect</button></form>
            </turbo-frame>

            <turbo-frame id="follow-frame" data-turbo-follow-redirect>
                <form id="follow-redirect" method="post" action="/frame/redirect"><button>Redirect in the frame</button></form>
            </turbo-frame>

            <ul id="list"><li id="item" data-widget>Item</li></ul>
            <form id="stream-append" method="post" action="/stream/append"><button>Append</button></form>
            <form id="stream-remove" method="post" action="/stream/remove"><button>Remove</button></form>
            HTML);
    }

    private static function morph(Request $request): Response
    {
        $count = self::count($request);
        // The same URL, query string included: a redirect to another one is a visit, not a refresh
        $action = htmlspecialchars($request->getRequestUri());

        return self::page('Morph', <<<HTML
            <p id="stable" data-widget>Stable</p>
            <p id="decorated" data-widget data-decorate>Decorated</p>
            <p id="counter" data-widget data-count="{$count}">Count {$count}</p>
            <form id="increment" method="post" action="{$action}"><button>Increment</button></form>
            HTML, head: '<meta name="turbo-refresh-method" content="morph">');
    }

    private static function count(Request $request): int
    {
        return (int) $request->cookies->get('count', '0');
    }

    private static function page(string $title, string $body, int $status = 200, string $head = ''): Response
    {
        return new Response(<<<HTML
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>{$title}</title>
                {$head}
                <script type="importmap">{"imports": {"@hotwired/turbo": "/e2e/turbo.js", "@silarhi/turbo": "/e2e/turbo-handler.js"}}</script>
                <script type="module" src="/e2e/app.js"></script>
            </head>
            <body>
            {$body}
            </body>
            </html>
            HTML, $status);
    }

    private static function stream(string $streams): Response
    {
        return new Response($streams, 200, ['Content-Type' => 'text/vnd.turbo-stream.html']);
    }
}
