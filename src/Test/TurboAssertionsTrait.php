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

namespace Silarhi\TurboBundle\Test;

use DOMDocument;
use PHPUnit\Framework\Assert;

use function sprintf;

use Symfony\Component\HttpFoundation\Response;

/**
 * PHPUnit helpers for the functional tests of Turbo endpoints: the headers Turbo
 * sends, as `$server` parameters, and assertions on the responses. They take the
 * Response to check, so they work with a KernelBrowser, an HttpKernel or a
 * response built by hand:
 *
 *     $client->request('DELETE', '/projects/1', server: self::getTurboStreamHeaders());
 *     self::assertTurboStream($client->getResponse(), 'remove', 'project_1');
 */
trait TurboAssertionsTrait
{
    /**
     * The headers of a request made by `<turbo-frame id="$frameId">`. Add
     * getTurboStreamHeaders() for a form submitted inside the frame:
     *
     *     server: self::getTurboFrameHeaders('modal') + self::getTurboStreamHeaders()
     *
     * @return array<string, string>
     */
    public static function getTurboFrameHeaders(string $frameId): array
    {
        return [
            'HTTP_TURBO_FRAME' => $frameId,
            'HTTP_X_TURBO_REQUEST_ID' => self::generateTurboRequestId(),
        ];
    }

    /**
     * The headers of a form submission by Turbo 8, which accepts Turbo Streams.
     *
     * @return array<string, string>
     */
    public static function getTurboStreamHeaders(): array
    {
        return [
            'HTTP_ACCEPT' => 'text/vnd.turbo-stream.html, text/html, application/xhtml+xml',
            'HTTP_X_TURBO_REQUEST_ID' => self::generateTurboRequestId(),
        ];
    }

    public static function assertTurboStreamResponse(Response $response, string $message = ''): void
    {
        Assert::assertStringStartsWith('text/vnd.turbo-stream.html', (string) $response->headers->get('Content-Type'), $message);
    }

    /**
     * Asserts the response has a `<turbo-stream>` with this action, and this `target`
     * or `targets` when given. Whatever its content type: a frame response carries
     * streams in its HTML too.
     */
    public static function assertTurboStream(Response $response, string $action, ?string $target = null, string $message = ''): void
    {
        $streams = self::findTurboStreams($response);
        $found = [] !== array_filter($streams, static fn (array $stream): bool => self::matchesTurboStream($stream, $action, $target));

        Assert::assertTrue($found, '' !== $message ? $message : sprintf(
            'Failed asserting that the response has a "%s" Turbo Stream. Found: %s.',
            self::describeTurboStream($action, $target),
            self::describeTurboStreams($streams),
        ));
    }

    /**
     * Asserts the response has no `<turbo-stream>`, or none with this action (and
     * this `target` or `targets` when given).
     */
    public static function assertNoTurboStream(Response $response, ?string $action = null, ?string $target = null, string $message = ''): void
    {
        $streams = self::findTurboStreams($response);
        $found = null === $action
            ? $streams
            : array_values(array_filter($streams, static fn (array $stream): bool => self::matchesTurboStream($stream, $action, $target)));

        Assert::assertSame([], $found, '' !== $message ? $message : sprintf(
            'Failed asserting that the response has no %s. Found: %s.',
            null === $action ? 'Turbo Stream' : sprintf('"%s" Turbo Stream', self::describeTurboStream($action, $target)),
            self::describeTurboStreams($found),
        ));
    }

    public static function assertTurboStreamCount(Response $response, int $expectedCount, string $message = ''): void
    {
        $streams = self::findTurboStreams($response);

        Assert::assertCount($expectedCount, $streams, '' !== $message ? $message : sprintf(
            'Failed asserting that the response has %d Turbo Stream(s). Found: %s.',
            $expectedCount,
            self::describeTurboStreams($streams),
        ));
    }

    /**
     * Asserts a `<turbo-stream>` with this action, and this `target` or `targets` when
     * not null, has this string in the HTML or in the text of its `<template>`.
     */
    public static function assertTurboStreamContains(Response $response, string $action, ?string $target, string $expected, string $message = ''): void
    {
        $streams = array_filter(self::findTurboStreams($response), static fn (array $stream): bool => self::matchesTurboStream($stream, $action, $target));
        Assert::assertNotSame([], $streams, '' !== $message ? $message : sprintf('Failed asserting that the response has a "%s" Turbo Stream.', self::describeTurboStream($action, $target)));

        $found = [] !== array_filter($streams, static fn (array $stream): bool => str_contains($stream['html'], $expected) || str_contains($stream['text'], $expected));
        Assert::assertTrue($found, '' !== $message ? $message : sprintf(
            'Failed asserting that the "%s" Turbo Stream contains "%s". Its content: "%s".',
            self::describeTurboStream($action, $target),
            $expected,
            implode('", "', array_map(static fn (array $stream): string => trim($stream['text']), $streams)),
        ));
    }

    /**
     * Asserts the response has a `<turbo-frame>` of this id: without it, Turbo shows
     * "Content missing" in the frame that sent the request.
     */
    public static function assertTurboFrame(Response $response, string $frameId, string $message = ''): void
    {
        $frameIds = [];
        foreach (self::loadDocument($response)?->getElementsByTagName('turbo-frame') ?? [] as $frame) {
            $frameIds[] = $frame->getAttribute('id');
        }

        Assert::assertContains($frameId, $frameIds, '' !== $message ? $message : sprintf(
            'Failed asserting that the response has a <turbo-frame id="%s">. Found: %s.',
            $frameId,
            [] === $frameIds ? 'none' : '"' . implode('", "', $frameIds) . '"',
        ));
    }

    /**
     * Asserts the response is the `204 + Turbo-Location` TurboFrameListener answers
     * instead of a redirect.
     */
    public static function assertTurboLocation(Response $response, string $expectedUrl, string $message = ''): void
    {
        Assert::assertSame(Response::HTTP_NO_CONTENT, $response->getStatusCode(), $message);
        Assert::assertSame($expectedUrl, $response->headers->get('Turbo-Location'), $message);
    }

    /**
     * @return list<array{action: string, target: string, html: string, text: string}>
     */
    private static function findTurboStreams(Response $response): array
    {
        $document = self::loadDocument($response);
        if (!$document instanceof DOMDocument) {
            return [];
        }

        $streams = [];
        foreach ($document->getElementsByTagName('turbo-stream') as $stream) {
            $template = $stream->getElementsByTagName('template')->item(0);
            $html = '';
            foreach ($template->childNodes ?? [] as $child) {
                $html .= $document->saveHTML($child);
            }

            $streams[] = [
                'action' => $stream->getAttribute('action'),
                'target' => $stream->hasAttribute('target') ? $stream->getAttribute('target') : $stream->getAttribute('targets'),
                'html' => $html,
                'text' => $template->textContent ?? '',
            ];
        }

        return $streams;
    }

    private static function loadDocument(Response $response): ?DOMDocument
    {
        // A streamed or binary response has no content to read
        $content = (string) $response->getContent();
        if ('' === trim($content)) {
            return null;
        }

        // Custom elements are not HTML 4 tags: libxml reports them, and still builds them
        $document = new DOMDocument();
        $document->loadHTML('<?xml encoding="UTF-8">' . $content, \LIBXML_NOERROR | \LIBXML_NOWARNING);

        return $document;
    }

    /**
     * @param array{action: string, target: string, html: string, text: string} $stream
     */
    private static function matchesTurboStream(array $stream, string $action, ?string $target): bool
    {
        return $action === $stream['action'] && (null === $target || $target === $stream['target']);
    }

    private static function describeTurboStream(string $action, ?string $target): string
    {
        return null === $target ? $action : $action . ' ' . $target;
    }

    /**
     * @param array<array{action: string, target: string, html: string, text: string}> $streams
     */
    private static function describeTurboStreams(array $streams): string
    {
        $descriptions = array_map(static fn (array $stream): string => trim($stream['action'] . ' ' . $stream['target']), $streams);

        return [] === $descriptions ? 'none' : '"' . implode('", "', $descriptions) . '"';
    }

    private static function generateTurboRequestId(): string
    {
        return bin2hex(random_bytes(16));
    }
}
