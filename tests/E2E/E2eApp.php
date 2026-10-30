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

use function sprintf;

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
                <a id="to-list" href="/list">List</a>
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
            'GET /morph-select' => self::morphSelect(...),
            // Back to the same page: Turbo 8 renders it as a refresh, morphed with turbo-refresh-method="morph"
            'POST /morph', 'POST /morph-select' => static function (Request $request): Response {
                $response = new RedirectResponse($request->getRequestUri(), Response::HTTP_SEE_OTHER);
                $response->headers->setCookie(Cookie::create('count', (string) (self::count($request) + 1)));

                return $response;
            },
            'GET /list' => self::list(...),
            'GET /form', 'POST /form' => self::form(...),
            // A frame redirect becomes a visit: TurboFrameListener
            'POST /editor' => static fn (Request $request): Response => '' === self::field($request, 'name')
                ? self::page('Editor', self::editor($request, error: true), 422)
                : new RedirectResponse('/editor/saved', Response::HTTP_SEE_OTHER),
            'GET /editor/saved' => static fn (): Response => self::page('Saved', <<<'HTML'
                <turbo-frame id="editor"><p id="saved" data-widget>Saved</p></turbo-frame>
                HTML),
            // A failed submission answered with a Turbo Stream, as a form re-rendered in place
            'POST /stream-form' => static fn (Request $request): Response => '' === self::field($request, 'name')
                ? self::stream('<turbo-stream action="replace" target="stream-box"><template>' . self::streamBox($request, error: true) . '</template></turbo-stream>', 422)
                : new RedirectResponse('/second', Response::HTTP_SEE_OTHER),
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

    /**
     * A list filtered by a search form outside its results frame: the form targets the frame and advances the URL, as
     * the pagination inside it does, so the filters (a Tom Select) keep their state.
     */
    private static function list(Request $request): Response
    {
        $q = self::field($request, 'q');
        $status = self::field($request, 'status');
        $page = max(1, (int) $request->query->get('page', '1'));
        $next = htmlspecialchars('/list?' . http_build_query(['q' => $q, 'status' => $status, 'page' => $page + 1]));
        $options = self::options($status, ['' => 'All', 'open' => 'Open', 'closed' => 'Closed']);
        $summary = htmlspecialchars(sprintf('Results for "%s", status "%s", page %d', $q, $status, $page));
        $value = htmlspecialchars($q);

        return self::page('List', <<<HTML
            <form id="search" method="get" action="/list" data-turbo-frame="results" data-turbo-action="advance">
                <input id="q" name="q" value="{$value}">
                <select id="status" name="status" data-widget data-tomselect>{$options}</select>
                <button>Search</button>
            </form>
            <a id="to-second" href="/second">Second page</a>

            <turbo-frame id="results">
                <p id="summary" data-widget data-decorate>{$summary}</p>
                <ul>
                    <li id="row-{$page}-1" data-widget>Row {$page}.1</li>
                    <li id="row-{$page}-2" data-widget>Row {$page}.2</li>
                </ul>
                <a id="next" href="{$next}" data-turbo-action="advance">Next page</a>
            </turbo-frame>
            HTML);
    }

    /**
     * Three forms that fail with a 422 when the name is empty: a Drive form, a form in a frame and a form answered with
     * a Turbo Stream, each with a Tom Select.
     */
    private static function form(Request $request): Response
    {
        $failed = $request->isMethod('POST');
        if ($failed && '' !== self::field($request, 'name')) {
            return new RedirectResponse('/second', Response::HTTP_SEE_OTHER);
        }

        $error = $failed ? '<p id="error" data-widget>The name is required</p>' : '';
        $name = htmlspecialchars(self::field($request, 'name'));
        $options = self::options(self::field($request, 'kind'), ['a' => 'Kind A', 'b' => 'Kind B']);
        $editor = self::editor($request, error: false);
        $streamBox = self::streamBox($request, error: false);

        return self::page('Form', <<<HTML
            <form id="drive-form" method="post" action="/form">
                {$error}
                <input id="name" name="name" value="{$name}">
                <select id="kind" name="kind" data-widget data-tomselect>{$options}</select>
                <button>Save</button>
            </form>
            {$editor}
            {$streamBox}
            HTML, $failed ? 422 : 200);
    }

    private static function editor(Request $request, bool $error): string
    {
        $message = $error ? '<p id="editor-error" data-widget>The name is required</p>' : '';
        $options = self::options(self::field($request, 'kind'), ['a' => 'Kind A', 'b' => 'Kind B']);

        return <<<HTML
            <turbo-frame id="editor">
                <form id="editor-form" method="post" action="/editor">
                    {$message}
                    <input id="editor-name" name="name">
                    <select id="editor-kind" name="kind" data-widget data-tomselect>{$options}</select>
                    <button>Save in the frame</button>
                </form>
            </turbo-frame>
            HTML;
    }

    private static function streamBox(Request $request, bool $error): string
    {
        $message = $error ? '<p id="stream-error" data-widget>The name is required</p>' : '';
        $options = self::options(self::field($request, 'kind'), ['a' => 'Kind A', 'b' => 'Kind B']);

        return <<<HTML
            <div id="stream-box">
                <form id="stream-form" method="post" action="/stream-form">
                    {$message}
                    <input id="stream-name" name="name">
                    <select id="stream-kind" name="kind" data-widget data-tomselect>{$options}</select>
                    <button>Save with a stream</button>
                </form>
            </div>
            HTML;
    }

    private static function morphSelect(Request $request): Response
    {
        $count = self::count($request);
        $action = htmlspecialchars($request->getRequestUri());

        return self::page('Morph select', <<<HTML
            <div id="panel"><select id="choice" name="choice" data-widget data-tomselect><option value="one">One</option><option value="two">Two</option></select></div>
            <p id="counter" data-widget data-count="{$count}">Count {$count}</p>
            <form id="increment" method="post" action="{$action}"><button>Increment</button></form>
            HTML, head: '<meta name="turbo-refresh-method" content="morph">');
    }

    /**
     * @param array<string, string> $choices
     */
    private static function options(string $selected, array $choices): string
    {
        $options = '';
        foreach ($choices as $value => $label) {
            $options .= sprintf('<option value="%s"%s>%s</option>', $value, $value === $selected ? ' selected' : '', $label);
        }

        return $options;
    }

    private static function field(Request $request, string $name): string
    {
        $bag = $request->isMethod('GET') ? $request->query : $request->request;

        return trim((string) $bag->get($name, ''));
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
                <link rel="stylesheet" href="/e2e/tom-select.css">
                <script src="/e2e/tom-select.js"></script>
                <script type="importmap">{"imports": {"@hotwired/turbo": "/e2e/turbo.js", "@silarhi/turbo": "/e2e/turbo-handler.js"}}</script>
                <script type="module" src="/e2e/app.js"></script>
            </head>
            <body>
            {$body}
            </body>
            </html>
            HTML, $status);
    }

    private static function stream(string $streams, int $status = 200): Response
    {
        return new Response($streams, $status, ['Content-Type' => 'text/vnd.turbo-stream.html']);
    }
}
