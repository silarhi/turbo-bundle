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

namespace Silarhi\TurboBundle\Tests\Test;

use PHPUnit\Framework\AssertionFailedError;
use PHPUnit\Framework\TestCase;
use Silarhi\TurboBundle\EventListener\TurboFrameListener;
use Silarhi\TurboBundle\Test\TurboAssertionsTrait;
use Silarhi\TurboBundle\TurboManager;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\HttpKernelInterface;

class TurboAssertionsTraitTest extends TestCase
{
    use TurboAssertionsTrait;

    private const STREAMS = <<<'HTML'
        <turbo-stream action="replace" target="project_1"><template><div id="project_1">Café</div></template></turbo-stream>
        <turbo-stream action="remove" targets=".notification"></turbo-stream>
        <turbo-stream action="refresh" request-id="abc"></turbo-stream>
        HTML;

    public function testFrameHeadersAreTheOnesOfAFrameRequest(): void
    {
        $request = Request::create('/projects/1', server: self::getTurboFrameHeaders('modal'));
        $manager = $this->managerFor($request);

        self::assertSame('modal', $manager->getTurboFrameId());
        self::assertNotNull($manager->getTurboRequestId());
    }

    public function testStreamHeadersAreTheOnesOfATurboSubmission(): void
    {
        $request = Request::create('/projects/1', 'PATCH', server: self::getTurboStreamHeaders());
        $manager = $this->managerFor($request);

        self::assertTrue($manager->isTurboRequest());
        self::assertFalse($manager->hasTurboFrame());
        self::assertSame('text/vnd.turbo-stream.html', $request->getAcceptableContentTypes()[0]);
    }

    public function testEachRequestGetsItsOwnRequestId(): void
    {
        self::assertNotSame(
            self::getTurboStreamHeaders()['HTTP_X_TURBO_REQUEST_ID'],
            self::getTurboStreamHeaders()['HTTP_X_TURBO_REQUEST_ID'],
        );
    }

    public function testAssertTurboStreamResponse(): void
    {
        self::assertTurboStreamResponse(new Response(self::STREAMS, Response::HTTP_OK, ['Content-Type' => 'text/vnd.turbo-stream.html; charset=UTF-8']));

        $this->expectException(AssertionFailedError::class);
        self::assertTurboStreamResponse(new Response(self::STREAMS));
    }

    public function testAssertTurboStreamMatchesTheActionAndTheTargetOrTargets(): void
    {
        $response = new Response(self::STREAMS);

        self::assertTurboStream($response, 'replace');
        self::assertTurboStream($response, 'replace', 'project_1');
        self::assertTurboStream($response, 'remove', '.notification');
        self::assertTurboStream($response, 'refresh');
    }

    public function testAssertTurboStreamFailsOnAnotherTarget(): void
    {
        $this->expectException(AssertionFailedError::class);
        $this->expectExceptionMessage('Failed asserting that the response has a "replace project_2" Turbo Stream. Found: "replace project_1", "remove .notification", "refresh".');

        self::assertTurboStream(new Response(self::STREAMS), 'replace', 'project_2');
    }

    public function testAssertTurboStreamFailsOnAResponseWithoutStreams(): void
    {
        $this->expectException(AssertionFailedError::class);
        $this->expectExceptionMessage('Found: none.');

        self::assertTurboStream(new Response(''), 'remove');
    }

    public function testAssertNoTurboStream(): void
    {
        $response = new Response(self::STREAMS);

        self::assertNoTurboStream(new Response('<p>Saved</p>'));
        self::assertNoTurboStream($response, 'append');
        self::assertNoTurboStream($response, 'replace', 'project_2');
    }

    public function testAssertNoTurboStreamFailsOnAMatchingStream(): void
    {
        $this->expectException(AssertionFailedError::class);
        $this->expectExceptionMessage('Failed asserting that the response has no "replace project_1" Turbo Stream. Found: "replace project_1".');

        self::assertNoTurboStream(new Response(self::STREAMS), 'replace', 'project_1');
    }

    public function testAssertNoTurboStreamFailsOnAnyStream(): void
    {
        $this->expectException(AssertionFailedError::class);
        $this->expectExceptionMessage('Failed asserting that the response has no Turbo Stream. Found: "replace project_1", "remove .notification", "refresh".');

        self::assertNoTurboStream(new Response(self::STREAMS));
    }

    public function testAssertTurboStreamCount(): void
    {
        self::assertTurboStreamCount(new Response(self::STREAMS), 3);
        self::assertTurboStreamCount(new Response(''), 0);

        $this->expectException(AssertionFailedError::class);
        $this->expectExceptionMessage('Failed asserting that the response has 2 Turbo Stream(s). Found: "replace project_1", "remove .notification", "refresh".');
        self::assertTurboStreamCount(new Response(self::STREAMS), 2);
    }

    public function testAssertTurboStreamContainsMatchesTheHtmlOrTheText(): void
    {
        $response = new Response(self::STREAMS);

        self::assertTurboStreamContains($response, 'replace', 'project_1', 'Café');
        self::assertTurboStreamContains($response, 'replace', 'project_1', 'id="project_1"');
        self::assertTurboStreamContains($response, 'replace', null, 'Café');
    }

    public function testAssertTurboStreamContainsFailsOnAnotherContent(): void
    {
        $this->expectException(AssertionFailedError::class);
        $this->expectExceptionMessage('Failed asserting that the "replace project_1" Turbo Stream contains "Saved". Its content: "Café".');

        self::assertTurboStreamContains(new Response(self::STREAMS), 'replace', 'project_1', 'Saved');
    }

    public function testAssertTurboStreamContainsFailsWithoutTheStream(): void
    {
        $this->expectException(AssertionFailedError::class);
        $this->expectExceptionMessage('Failed asserting that the response has a "append flash" Turbo Stream.');

        self::assertTurboStreamContains(new Response(self::STREAMS), 'append', 'flash', 'Saved');
    }

    public function testAssertTurboFrame(): void
    {
        self::assertTurboFrame(new Response('<html><body><turbo-frame id="modal"><form></form></turbo-frame></body></html>'), 'modal');

        $this->expectException(AssertionFailedError::class);
        $this->expectExceptionMessage('Failed asserting that the response has a <turbo-frame id="modal">. Found: "main".');
        self::assertTurboFrame(new Response('<turbo-frame id="main"></turbo-frame>'), 'modal');
    }

    public function testAssertTurboFrameFailsOnAResponseWithoutFrames(): void
    {
        $this->expectException(AssertionFailedError::class);
        $this->expectExceptionMessage('Found: none.');

        self::assertTurboFrame(new Response(''), 'modal');
    }

    public function testAssertTurboLocationOnAConvertedFrameRedirect(): void
    {
        $request = Request::create('/projects/1', 'POST', server: self::getTurboFrameHeaders('modal') + self::getTurboStreamHeaders());
        $event = new ResponseEvent(
            self::createStub(HttpKernelInterface::class),
            $request,
            HttpKernelInterface::MAIN_REQUEST,
            new RedirectResponse('/projects'),
        );
        (new TurboFrameListener($this->managerFor($request)))->onKernelResponse($event);

        self::assertTurboLocation($event->getResponse(), '/projects');

        $this->expectException(AssertionFailedError::class);
        self::assertTurboLocation(new RedirectResponse('/projects'), '/projects');
    }

    private function managerFor(Request $request): TurboManager
    {
        $stack = new RequestStack();
        $stack->push($request);

        return new TurboManager($stack);
    }
}
