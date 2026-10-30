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
        $found = false;
        foreach ($streams as $stream) {
            if ($action === $stream['action'] && (null === $target || $target === $stream['target'])) {
                $found = true;
                break;
            }
        }

        $expected = null === $target ? $action : $action . ' ' . $target;
        $actual = array_map(static fn (array $stream): string => trim($stream['action'] . ' ' . $stream['target']), $streams);
        Assert::assertTrue($found, '' !== $message ? $message : sprintf(
            'Failed asserting that the response has a "%s" Turbo Stream. Found: %s.',
            $expected,
            [] === $actual ? 'none' : '"' . implode('", "', $actual) . '"',
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
     * @return list<array{action: string, target: string}>
     */
    private static function findTurboStreams(Response $response): array
    {
        // A streamed or binary response has no content to read
        $content = (string) $response->getContent();
        if ('' === trim($content)) {
            return [];
        }

        // Custom elements are not HTML 4 tags: libxml reports them, and still builds them
        $document = new DOMDocument();
        $document->loadHTML('<?xml encoding="UTF-8">' . $content, \LIBXML_NOERROR | \LIBXML_NOWARNING);

        $streams = [];
        foreach ($document->getElementsByTagName('turbo-stream') as $stream) {
            $streams[] = [
                'action' => $stream->getAttribute('action'),
                'target' => $stream->hasAttribute('target') ? $stream->getAttribute('target') : $stream->getAttribute('targets'),
            ];
        }

        return $streams;
    }

    private static function generateTurboRequestId(): string
    {
        return bin2hex(random_bytes(16));
    }
}
