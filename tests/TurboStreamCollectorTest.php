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

namespace Silarhi\TurboBundle\Tests;

use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use Silarhi\TurboBundle\TurboManager;
use Silarhi\TurboBundle\TurboStreamBuilder;
use Silarhi\TurboBundle\TurboStreamCollector;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Component\HttpFoundation\Response;

class TurboStreamCollectorTest extends TestCase
{
    public function testBuildsTheStreamsOfEachAction(): void
    {
        $turboStreams = $this->collectorFor(new Request())
            ->append('list', '<li>1</li>')
            ->prepend('list', '<li>0</li>')
            ->replace('item_1', '<p>1</p>')
            ->update('count', '2', morph: true)
            ->before('item_1', '<hr>')
            ->after('item_1', '<hr>')
            ->remove('item_2')
            ->refresh('abc')
            ->action('modalClose', 'app-modal', attributes: ['data-reason' => 'saved'])
            ->action('remove', targets: '.notification');

        self::assertSame([
            '<turbo-stream action="append" target="list"><template><li>1</li></template></turbo-stream>',
            '<turbo-stream action="prepend" target="list"><template><li>0</li></template></turbo-stream>',
            '<turbo-stream action="replace" target="item_1"><template><p>1</p></template></turbo-stream>',
            '<turbo-stream action="update" target="count" method="morph"><template>2</template></turbo-stream>',
            '<turbo-stream action="before" target="item_1"><template><hr></template></turbo-stream>',
            '<turbo-stream action="after" target="item_1"><template><hr></template></turbo-stream>',
            '<turbo-stream action="remove" target="item_2"></turbo-stream>',
            '<turbo-stream action="refresh" request-id="abc"></turbo-stream>',
            '<turbo-stream action="modalClose" target="app-modal" data-reason="saved"></turbo-stream>',
            '<turbo-stream action="remove" targets=".notification"></turbo-stream>',
        ], $turboStreams->all());
    }

    public function testRejectsATargetAndTargets(): void
    {
        $this->expectException(InvalidArgumentException::class);

        $this->collectorFor(new Request())->action('remove', 'item_1', targets: '.item');
    }

    public function testStreamsLiveOnTheMainRequest(): void
    {
        $main = new Request();
        $stack = new RequestStack();
        $stack->push($main);
        $stack->push(Request::create('/_fragment'));
        (new TurboStreamCollector($stack, new TurboStreamBuilder()))->remove('item_1');
        $stack->pop();

        self::assertSame(['<turbo-stream action="remove" target="item_1"></turbo-stream>'], (new TurboStreamCollector($stack, new TurboStreamBuilder()))->all());
    }

    public function testAddsRenderedStreams(): void
    {
        $turboStreams = $this->collectorFor(new Request())->add('<turbo-stream action="refresh"></turbo-stream>')->add('');

        self::assertSame(['<turbo-stream action="refresh"></turbo-stream>'], $turboStreams->all());
    }

    public function testFlushForgetsTheStreams(): void
    {
        $turboStreams = $this->collectorFor(new Request())->remove('item_1')->remove('item_2');

        self::assertTrue($turboStreams->hasStreams());
        self::assertSame('<turbo-stream action="remove" target="item_1"></turbo-stream><turbo-stream action="remove" target="item_2"></turbo-stream>', $turboStreams->flush());
        self::assertFalse($turboStreams->hasStreams());
        self::assertSame('', $turboStreams->flush());
    }

    public function testCreatesAStreamResponse(): void
    {
        $turboStreams = $this->collectorFor(new Request())->remove('item_1');

        $response = $turboStreams->createResponse(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame(Response::HTTP_UNPROCESSABLE_ENTITY, $response->getStatusCode());
        self::assertSame(TurboManager::STREAM_CONTENT_TYPE, $response->headers->get('Content-Type'));
        self::assertSame('<turbo-stream action="remove" target="item_1"></turbo-stream>', $response->getContent());
        // The listener appends nothing more to it
        self::assertFalse($turboStreams->hasStreams());
    }

    public function testDropsTheStreamsWithoutARequest(): void
    {
        $turboStreams = (new TurboStreamCollector(new RequestStack(), new TurboStreamBuilder()))->remove('item_1');

        self::assertSame([], $turboStreams->all());
        self::assertSame('', $turboStreams->createResponse()->getContent());
    }

    private function collectorFor(Request $request): TurboStreamCollector
    {
        $stack = new RequestStack();
        $stack->push($request);

        return new TurboStreamCollector($stack, new TurboStreamBuilder());
    }
}
