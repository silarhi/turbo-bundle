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
use Silarhi\TurboBundle\Twig\TurboExtension;
use Symfony\Component\Config\Definition\Configurator\DefinitionConfigurator;
use Symfony\Component\DependencyInjection\ContainerBuilder;
use Symfony\Component\DependencyInjection\Loader\Configurator\ContainerConfigurator;

use function Symfony\Component\DependencyInjection\Loader\Configurator\service;

use Symfony\Component\HttpKernel\Bundle\AbstractBundle;
use Twig\Extension\AbstractExtension;

/**
 * Optional zero-config wiring for full Symfony applications.
 *
 * Register it in `config/bundles.php` to get TurboManager + TurboFrameListener
 * (and, when Twig is installed, the `turbo_frame` filter). Projects without the
 * framework can skip this class entirely and instantiate the classes directly.
 *
 * Configuration (default values shown):
 *
 *     # config/packages/silarhi_turbo.yaml
 *     silarhi_turbo:
 *         base_template: 'base-frame.html.twig'
 *         follow_delete_redirects: true
 */
final class SilarhiTurboBundle extends AbstractBundle
{
    public function configure(DefinitionConfigurator $definition): void
    {
        $definition->rootNode()
            ->children()
                ->scalarNode('base_template')
                    ->info('Template the `turbo_frame` filter returns when rendering inside a matching Turbo Frame.')
                    ->defaultValue('base-frame.html.twig')
                    ->cannotBeEmpty()
                ->end()
                ->booleanNode('follow_delete_redirects')
                    ->info('Convert a redirect issued by a DELETE Turbo request into a Turbo-Location visit.')
                    ->defaultTrue()
                ->end()
            ->end();
    }

    /**
     * @param array<array-key, mixed> $config
     */
    public function loadExtension(array $config, ContainerConfigurator $container, ContainerBuilder $builder): void
    {
        /** @var array{base_template: string, follow_delete_redirects: bool} $config */
        $services = $container->services();

        $services->set(TurboManager::class)
            ->autowire();

        $services->set(TurboFrameListener::class)
            ->args([service(TurboManager::class), $config['follow_delete_redirects']])
            ->tag('kernel.event_subscriber');

        if (class_exists(AbstractExtension::class)) {
            $services->set(TurboExtension::class)
                ->args([service(TurboManager::class), $config['base_template']])
                ->tag('twig.extension');
        }
    }
}
