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

use Psr\Log\AbstractLogger;
use Stringable;

final class RecordingLogger extends AbstractLogger
{
    /** @var list<array{level: mixed, message: string, context: array<mixed>}> */
    public array $logs = [];

    /**
     * No native type on $message: psr/log 1, the lowest version symfony/http-kernel
     * allows, declares none, and a typed parameter would narrow its signature.
     *
     * @param string|Stringable $message
     * @param array<mixed>      $context
     */
    public function log(mixed $level, $message, array $context = []): void
    {
        $this->logs[] = ['level' => $level, 'message' => (string) $message, 'context' => $context];
    }
}
