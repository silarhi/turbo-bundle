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

use Rector\Config\RectorConfig;
use Rector\Symfony\CodeQuality\Rector\Class_\EventSubscriberToAttributeRector;

return RectorConfig::configure()
    ->withPaths([
        'src',
        'tests',
    ])
    ->withPhpSets()
    ->withComposerBased()
    ->withPreparedSets(
        deadCode: true,
        codeQuality: true,
        typeDeclarations: true,
    )
    ->withSkip([
        // The listeners stay EventSubscriberInterface: they work on any event dispatcher, without the framework
        EventSubscriberToAttributeRector::class,
    ]);
