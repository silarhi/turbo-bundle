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

use Silarhi\TurboBundle\EventListener\TurboFrameListener;
use Symfony\Component\DependencyInjection\ContainerBuilder;
use Symfony\Component\DependencyInjection\Loader\Configurator\ContainerConfigurator;

use function Symfony\Component\DependencyInjection\Loader\Configurator\service;

use Symfony\Component\HttpKernel\Bundle\AbstractBundle;

/**
 * Optional zero-config wiring for full Symfony applications.
 *
 * Register it in `config/bundles.php` to get TurboManager + TurboFrameListener
 * as services. Projects without the framework can skip this class entirely and
 * instantiate the two classes directly.
 */
final class TurboBundle extends AbstractBundle
{
    /**
     * @param array<array-key, mixed> $config
     */
    public function loadExtension(array $config, ContainerConfigurator $configurator, ContainerBuilder $container): void
    {
        $services = $configurator->services();

        $services
            ->set(TurboManager::class)
            ->autowire();

        $services
            ->set(TurboFrameListener::class)
            ->args([service(TurboManager::class)])
            ->tag('kernel.event_subscriber');
    }
}
