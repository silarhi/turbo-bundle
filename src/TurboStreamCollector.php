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

namespace Silarhi\TurboBundle;

use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Component\HttpFoundation\Response;

/**
 * Collects Turbo Streams during the request, from any service: TurboStreamListener
 * appends them to the Turbo Stream response the controller answers, whatever
 * renders it. A controller can also answer with them alone:
 *
 *     $turboStreams->update('cart-count', (string) $cart->count());
 *     // …
 *     return $turboStreams->remove('cart_item_' . $id)->createResponse();
 *
 * The content is HTML and is not escaped: escape what comes from the user.
 *
 * The streams live on the main request, so a sub-request (a fragment, an inline
 * ESI) adds to them too. Without a request (a console command, a message
 * handler) nothing answers them: they are dropped. Another response (a
 * redirect, a full page) drops them too.
 */
final readonly class TurboStreamCollector
{
    public const STREAMS_ATTRIBUTE = '_turbo_streams';

    public function __construct(
        private RequestStack $requestStack,
        private TurboStreamBuilder $turboStreamBuilder,
    ) {
    }

    public function append(string $target, string $html): static
    {
        return $this->action('append', $target, $html);
    }

    public function prepend(string $target, string $html): static
    {
        return $this->action('prepend', $target, $html);
    }

    public function replace(string $target, string $html, bool $morph = false): static
    {
        return $this->action('replace', $target, $html, attributes: ['method' => $morph ? 'morph' : null]);
    }

    public function update(string $target, string $html, bool $morph = false): static
    {
        return $this->action('update', $target, $html, attributes: ['method' => $morph ? 'morph' : null]);
    }

    public function before(string $target, string $html): static
    {
        return $this->action('before', $target, $html);
    }

    public function after(string $target, string $html): static
    {
        return $this->action('after', $target, $html);
    }

    public function remove(string $target): static
    {
        return $this->action('remove', $target);
    }

    /**
     * Turbo 8 skips the refresh in the tab whose request has this id
     * (TurboManager::getTurboRequestId()).
     */
    public function refresh(?string $requestId = null): static
    {
        return $this->action('refresh', attributes: ['request-id' => $requestId]);
    }

    /**
     * A stream of any action, a custom one included. Pass `targets` (a CSS selector)
     * instead of `target` (an element id) to act on several elements.
     *
     * @param array<string, string|int|float|bool|null> $attributes
     */
    public function action(string $action, ?string $target = null, string $html = '', ?string $targets = null, array $attributes = []): static
    {
        return $this->add($this->turboStreamBuilder->build($action, $target, $html, $targets, $attributes));
    }

    /**
     * Adds streams already rendered, for example by a template.
     */
    public function add(string $streams): static
    {
        $request = $this->getMainRequest();
        if ($request instanceof Request && '' !== $streams) {
            $request->attributes->set(self::STREAMS_ATTRIBUTE, [...$this->all(), $streams]);
        }

        return $this;
    }

    /**
     * @return list<string>
     */
    public function all(): array
    {
        /** @var list<string> $streams */
        $streams = $this->getMainRequest()?->attributes->get(self::STREAMS_ATTRIBUTE, []) ?? [];

        return $streams;
    }

    public function hasStreams(): bool
    {
        return [] !== $this->all();
    }

    /**
     * Returns the streams collected so far, and forgets them.
     */
    public function flush(): string
    {
        $streams = implode('', $this->all());
        $this->getMainRequest()?->attributes->remove(self::STREAMS_ATTRIBUTE);

        return $streams;
    }

    /**
     * A Turbo Stream response with the streams collected so far.
     */
    public function createResponse(int $status = Response::HTTP_OK): Response
    {
        return new Response($this->flush(), $status, ['Content-Type' => TurboManager::STREAM_CONTENT_TYPE]);
    }

    private function getMainRequest(): ?Request
    {
        return $this->requestStack->getMainRequest();
    }
}
