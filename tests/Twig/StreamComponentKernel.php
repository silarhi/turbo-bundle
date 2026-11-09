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

namespace Silarhi\TurboBundle\Tests\Twig;

use Silarhi\TurboBundle\SilarhiTurboBundle;
use Symfony\Bundle\FrameworkBundle\FrameworkBundle;
use Symfony\Bundle\FrameworkBundle\Kernel\MicroKernelTrait;
use Symfony\Bundle\TwigBundle\TwigBundle;
use Symfony\Component\DependencyInjection\Loader\Configurator\ContainerConfigurator;
use Symfony\Component\HttpKernel\Kernel;
use Symfony\UX\TwigComponent\TwigComponentBundle;

/**
 * Not in StreamComponentTest.php: PHPUnit loads the test files of excluded groups
 * too, and this class needs symfony/framework-bundle as soon as it is declared.
 */
final class StreamComponentKernel extends Kernel
{
    use MicroKernelTrait;

    public function registerBundles(): iterable
    {
        yield new FrameworkBundle();
        yield new TwigBundle();
        yield new TwigComponentBundle();
        yield new SilarhiTurboBundle();
    }

    public function getCacheDir(): string
    {
        return sys_get_temp_dir() . '/silarhi_turbo_bundle_component_' . getmypid();
    }

    public function getLogDir(): string
    {
        return $this->getCacheDir() . '/log';
    }

    protected function configureContainer(ContainerConfigurator $container): void
    {
        $container->extension('framework', ['secret' => 'test', 'test' => true, 'http_method_override' => false]);
        $container->extension('twig', ['strict_variables' => true]);
        $container->extension('twig_component', ['anonymous_template_directory' => 'components/', 'defaults' => []]);
    }
}
