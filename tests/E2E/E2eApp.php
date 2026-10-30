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
    private const MORPH = '<meta name="turbo-refresh-method" content="morph">';

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
            'POST /morph', 'POST /morph-select', 'POST /morph-list', 'POST /morph-frame', 'POST /permanent/a' => static function (Request $request): Response {
                $response = new RedirectResponse($request->getRequestUri(), Response::HTTP_SEE_OTHER);
                $response->headers->setCookie(Cookie::create('count', (string) (self::count($request) + 1)));

                return $response;
            },
            // A refresh asked by the server: the page refreshes itself, with a morph when its meta asks for one
            'POST /morph/refresh-stream' => static function (Request $request): Response {
                $response = self::stream('<turbo-stream action="refresh"></turbo-stream>');
                $response->headers->setCookie(Cookie::create('count', (string) (self::count($request) + 1)));

                return $response;
            },
            'GET /morph-list' => self::morphList(...),
            'GET /morph-frame' => self::morphFrame(...),
            'GET /morph-frame/live' => static fn (Request $request): Response => self::page('Live frame', self::liveFrame(self::count($request))),
            'GET /stream-morph' => static fn (): Response => self::page('Stream morph', <<<'HTML'
                <form id="morph-replace" method="post" action="/stream-morph/replace"><button>Replace with a morph</button></form>
                <form id="morph-update" method="post" action="/stream-morph/update"><button>Update with a morph</button></form>
                <form id="morph-select" method="post" action="/stream-morph/select"><button>Replace the select with a morph</button></form>
                HTML . self::morphBox('Text 0', 'one')),
            // The target is the <select> itself, with the markup of its Tom Select right after it
            'POST /stream-morph/select' => static fn (): Response => self::stream('<turbo-stream action="replace" method="morph" target="morph-choice"><template>' . self::choice('morph-choice', 'two') . '</template></turbo-stream>'),
            'POST /stream-morph/replace' => static fn (): Response => self::stream('<turbo-stream action="replace" method="morph" target="morph-box"><template>' . self::morphBox('Text 1', 'two') . '</template></turbo-stream>'),
            'POST /stream-morph/update' => static fn (): Response => self::stream('<turbo-stream action="update" method="morph" target="morph-box"><template>' . self::morphBoxContent('Text 1', 'two') . '</template></turbo-stream>'),
            'GET /permanent/a', 'GET /permanent/b', 'GET /permanent/c' => self::permanent(...),
            'POST /permanent/stream' => static fn (): Response => self::stream('<turbo-stream action="replace" target="permanent-section"><template>' . self::permanentSection('Section 1') . '</template></turbo-stream>'),
            'GET /permanent/frame' => static fn (): Response => self::page('Permanent frame', '<turbo-frame id="permanent-frame">' . self::player() . '<a id="frame-next" href="/permanent/frame/next">Next</a></turbo-frame>'),
            'GET /permanent/frame/next' => static fn (): Response => self::page('Permanent frame next', '<turbo-frame id="permanent-frame">' . self::player() . '<p id="frame-next-page" data-widget>Next</p></turbo-frame>'),
            'GET /cache-control/no-cache', 'GET /cache-control/no-preview' => self::cacheControl(...),
            'GET /frames' => self::frames(...),
            // A stream in the page itself: Turbo renders it once connected, before the first turbo:load
            'GET /inline-stream' => static fn (): Response => self::page('Inline stream', <<<'HTML'
                <ul id="inline-list"></ul>
                <turbo-stream action="append" target="inline-list"><template><li id="inline-item" data-widget data-decorate>Item</li></template></turbo-stream>
                HTML),
            'GET /frames/eager' => static fn (): Response => self::page('Eager frame', '<turbo-frame id="eager"><p id="eager-content" data-widget data-decorate>Eager frame</p>' . self::choice('eager-choice') . '</turbo-frame>'),
            'GET /frames/lazy' => static fn (): Response => self::page('Lazy frame', <<<'HTML'
                <turbo-frame id="lazy"><p id="lazy-content" data-widget data-decorate>Lazy frame</p></turbo-frame>
                HTML),
            'GET /transition/a', 'GET /transition/b' => self::transition(...),
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
                <a id="frame-top" href="/second" data-turbo-frame="_top">Leave the frame</a>
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
            <form id="refresh-stream" method="post" action="/morph/refresh-stream"><button>Ask for a refresh</button></form>
            HTML, head: $request->query->has('replace') ? '' : self::MORPH);
    }

    /**
     * A morph that removes a box with its widgets, and adds another one
     */
    private static function morphList(Request $request): Response
    {
        $count = self::count($request);
        $action = htmlspecialchars($request->getRequestUri());
        $box = 0 === $count
            ? '<div id="old-box"><p id="old-text" data-widget>Old</p>' . self::choice('old-choice') . '</div>'
            : '<div id="new-box"><p id="new-text" data-widget>New</p>' . self::choice('new-choice') . '</div>';

        return self::page('Morph list', <<<HTML
            <div id="boxes">{$box}</div>
            <p id="counter" data-count="{$count}">Count {$count}</p>
            <form id="increment" method="post" action="{$action}"><button>Increment</button></form>
            HTML, head: self::MORPH);
    }

    /**
     * A frame reloaded with a morph when the page refreshes with one: <turbo-frame refresh="morph">
     */
    private static function morphFrame(Request $request): Response
    {
        $count = self::count($request);
        $action = htmlspecialchars($request->getRequestUri());

        return self::page('Morph frame', <<<HTML
            <p id="counter" data-count="{$count}">Count {$count}</p>
            <form id="increment" method="post" action="{$action}"><button>Increment</button></form>
            <turbo-frame id="live" src="/morph-frame/live" refresh="morph"></turbo-frame>
            HTML, head: self::MORPH);
    }

    private static function liveFrame(int $count): string
    {
        return <<<HTML
            <turbo-frame id="live">
                <p id="live-stable" data-widget>Stable</p>
                <p id="live-counter" data-widget data-decorate>Live {$count}</p>
            HTML . self::choice('live-choice') . '</turbo-frame>';
    }

    private static function morphBox(string $text, string $selected): string
    {
        return '<div id="morph-box">' . self::morphBoxContent($text, $selected) . '</div>';
    }

    private static function morphBoxContent(string $text, string $selected): string
    {
        return sprintf('<p id="morph-text" data-widget data-decorate>%s</p>', $text) . self::choice('morph-choice', $selected) . '<p id="morph-after" data-widget>After</p>';
    }

    /**
     * Two pages sharing a [data-turbo-permanent] element, which Turbo moves from one page to the other, and a third
     * without it. A stream replaces the section around it. With ?morph, a refresh morphs the page.
     */
    private static function permanent(Request $request): Response
    {
        $name = basename($request->getPathInfo());
        $section = 'c' === $name ? '' : self::permanentSection('Section 0');
        $count = self::count($request);
        $action = htmlspecialchars($request->getRequestUri());

        return self::page('Permanent ' . $name, <<<HTML
            {$section}
            <p id="page-{$name}" data-widget>Page {$name}</p>
            <p id="permanent-count">Count {$count}</p>
            <a id="to-a" href="/permanent/a">Page a</a>
            <a id="to-b" href="/permanent/b">Page b</a>
            <a id="to-c" href="/permanent/c">Page c</a>
            <form id="permanent-increment" method="post" action="{$action}"><button>Increment</button></form>
            <form id="permanent-stream" method="post" action="/permanent/stream"><button>Replace the section</button></form>
            HTML, head: $request->query->has('morph') ? self::MORPH : '');
    }

    private static function permanentSection(string $text): string
    {
        return sprintf('<section id="permanent-section">%s<p id="section-text" data-widget>%s</p></section>', self::player(), $text);
    }

    private static function player(): string
    {
        return '<div id="player" data-turbo-permanent><p id="player-text" data-widget data-decorate>Player</p>' . self::choice('player-choice') . '</div>';
    }

    /**
     * A page kept out of the cache (no-cache), or not shown as a preview (no-preview): <meta name="turbo-cache-control">
     */
    private static function cacheControl(Request $request): Response
    {
        $control = basename($request->getPathInfo());

        return self::page('Cache control', <<<HTML
            <p id="cached" data-widget data-decorate>{$control}</p>
            HTML . self::choice('cached-choice') . <<<'HTML'
            <a id="to-second" href="/second">Second page</a>
            HTML, head: sprintf('<meta name="turbo-cache-control" content="%s">', $control));
    }

    /**
     * An eager frame and a lazy one, below the fold. With ?slow, an image delays the load event of the page
     */
    private static function frames(Request $request): Response
    {
        $image = $request->query->has('slow') ? '<img src="/slow.png" alt="">' : '';

        return self::page('Frames', <<<HTML
            {$image}
            <p id="frames" data-widget>Frames</p>
            <a id="to-second" href="/second">Second page</a>
            <turbo-frame id="eager" src="/frames/eager"><p>Loading</p></turbo-frame>
            <div style="height: 3000px"></div>
            <turbo-frame id="lazy" src="/frames/lazy" loading="lazy"><p>Loading</p></turbo-frame>
            HTML);
    }

    /**
     * Two pages rendered in a view transition: <meta name="view-transition">
     */
    private static function transition(Request $request): Response
    {
        $name = basename($request->getPathInfo());
        $other = 'a' === $name ? 'b' : 'a';

        return self::page('Transition ' . $name, <<<HTML
            <p id="transition-{$name}" data-widget data-decorate>Page {$name}</p>
            HTML . self::choice('transition-choice') . <<<HTML
            <a id="to-{$other}" href="/transition/{$other}">Page {$other}</a>
            HTML, head: '<meta name="view-transition" content="same-origin">');
    }

    private static function choice(string $id, string $selected = 'one'): string
    {
        return sprintf('<select id="%s" name="choice" data-widget data-tomselect>%s</select>', $id, self::options($selected, ['one' => 'One', 'two' => 'Two']));
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
        // The server changes the value: a morph must not bring back the one of the page
        $choice = self::choice('choice', 0 === $count % 2 ? 'one' : 'two');

        return self::page('Morph select', <<<HTML
            <div id="panel">{$choice}</div>
            <p id="counter" data-widget data-count="{$count}">Count {$count}</p>
            <form id="increment" method="post" action="{$action}"><button>Increment</button></form>
            HTML, head: self::MORPH);
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
