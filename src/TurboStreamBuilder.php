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

use InvalidArgumentException;

use function sprintf;

/**
 * Builds the markup of a `<turbo-stream>`, of any action. Shared by the
 * `turbo_stream` Twig helpers and TurboStreamCollector; depends on nothing.
 */
final readonly class TurboStreamBuilder
{
    /**
     * @param string                                    $content    HTML of the `<template>`, not escaped. Empty, the stream gets no `<template>`
     * @param array<string, string|int|float|bool|null> $attributes more attributes of the stream:
     *                                                              `true` renders the name alone, `false` and `null` leave it out
     */
    public function build(string $action, ?string $target = null, string $content = '', ?string $targets = null, array $attributes = []): string
    {
        if (null !== $target && null !== $targets) {
            throw new InvalidArgumentException(sprintf('The "%s" Turbo Stream takes a target or targets, not both.', $action));
        }

        $html = '<turbo-stream';
        foreach (['action' => $action, 'target' => $target, 'targets' => $targets] + $attributes as $name => $value) {
            if (null === $value || false === $value) {
                continue;
            }
            $html .= true === $value ? ' ' . $name : sprintf(' %s="%s"', $name, htmlspecialchars((string) $value, \ENT_QUOTES | \ENT_SUBSTITUTE, 'UTF-8'));
        }

        return $html . '>' . ('' === $content ? '' : '<template>' . $content . '</template>') . '</turbo-stream>';
    }
}
