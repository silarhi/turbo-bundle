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

use Silarhi\TurboBundle\SilarhiTurboBundle;
use Symfony\Bundle\FrameworkBundle\FrameworkBundle;
use Symfony\Bundle\FrameworkBundle\Kernel\MicroKernelTrait;
use Symfony\Bundle\TwigBundle\TwigBundle;
use Symfony\Component\DependencyInjection\Loader\Configurator\ContainerConfigurator;
use Symfony\Component\HttpKernel\Kernel;
use Symfony\UX\TwigComponent\TwigComponentBundle;
use Twig\Environment;

require \dirname(__DIR__) . '/vendor/autoload.php';

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
        return sys_get_temp_dir() . '/turbo-component-' . getmypid();
    }

    protected function configureContainer(ContainerConfigurator $container): void
    {
        $container->extension('framework', ['secret' => 'test', 'test' => true, 'http_method_override' => false]);
        $container->extension('twig', ['strict_variables' => true]);
        $container->extension('twig_component', ['anonymous_template_directory' => 'components/', 'defaults' => []]);
    }
}

$kernel = new StreamComponentKernel('test', true);
$kernel->boot();
$twig = $kernel->getContainer()->get('test.service_container')->get('twig');
\assert($twig instanceof Environment);

$cases = [
    ['<twig:SilarhiTurbo:Stream action="remove" target="project_1" />', '<turbo-stream action="remove" target="project_1"></turbo-stream>'],
    ['<twig:SilarhiTurbo:Stream action="replace" target="project_1"><p>{{ name }}</p></twig:SilarhiTurbo:Stream>', '<turbo-stream action="replace" target="project_1"><template><p>Café &lt;b&gt;</p></template></turbo-stream>'],
    ['<twig:SilarhiTurbo:Stream action="modalClose" target="modal" data-reason="{{ name }}" />', '<turbo-stream action="modalClose" target="modal" data-reason="Café &lt;b&gt;"></turbo-stream>'],
    ['<twig:SilarhiTurbo:Stream action="remove" targets=".notification" />', '<turbo-stream action="remove" targets=".notification"></turbo-stream>'],
    ['<twig:SilarhiTurbo:Stream action="refresh" request-id="abc" />', '<turbo-stream action="refresh" request-id="abc"></turbo-stream>'],
];

try {
    foreach ($cases as [$template, $expected]) {
        $actual = $twig->createTemplate($template)->render(['name' => 'Café <b>']);
        if ($actual !== $expected) {
            throw new RuntimeException(\sprintf("Component output mismatch.\nExpected: %s\nActual: %s", $expected, $actual));
        }
    }
    try {
        $twig->createTemplate('<twig:SilarhiTurbo:Stream action="remove" target="one" targets=".many" />')->render();
        throw new RuntimeException('Expected mutually exclusive targets to be rejected.');
    } catch (Twig\Error\RuntimeError $error) {
        if (!$error->getPrevious() instanceof InvalidArgumentException) {
            throw $error;
        }
    }
    echo "OK (6 Twig component integration checks)\n";
} finally {
    $kernel->shutdown();
}
