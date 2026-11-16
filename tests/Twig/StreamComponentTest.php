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

use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\TestCase;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\Filesystem\Filesystem;
use Twig\Environment;
use Twig\Error\RuntimeError;

#[Group('bundle')]
class StreamComponentTest extends TestCase
{
    private StreamComponentKernel $kernel;

    protected function setUp(): void
    {
        $this->kernel = new StreamComponentKernel('test', false);
        $this->kernel->boot();
    }

    protected function tearDown(): void
    {
        $this->kernel->shutdown();
        (new Filesystem())->remove($this->kernel->getCacheDir());
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function componentProvider(): iterable
    {
        yield 'no content' => [
            '<twig:Turbo:Stream action="remove" target="project_1" />',
            '<turbo-stream action="remove" target="project_1"></turbo-stream>',
        ];
        yield 'content' => [
            '<twig:Turbo:Stream action="replace" target="project_1"><p>{{ name }}</p></twig:Turbo:Stream>',
            '<turbo-stream action="replace" target="project_1"><template><p>Café &lt;b&gt;</p></template></turbo-stream>',
        ];
        yield 'custom action with an attribute' => [
            '<twig:Turbo:Stream action="modalClose" target="modal" data-reason="{{ name }}" />',
            '<turbo-stream action="modalClose" target="modal" data-reason="Café &lt;b&gt;"></turbo-stream>',
        ];
        yield 'targets' => [
            '<twig:Turbo:Stream action="remove" targets=".notification" />',
            '<turbo-stream action="remove" targets=".notification"></turbo-stream>',
        ];
        yield 'refresh' => [
            '<twig:Turbo:Stream action="refresh" request-id="abc" />',
            '<turbo-stream action="refresh" request-id="abc"></turbo-stream>',
        ];
    }

    #[DataProvider('componentProvider')]
    public function testRendersTheStream(string $template, string $expected): void
    {
        self::assertSame($expected, $this->getTwig()->createTemplate($template)->render(['name' => 'Café <b>']));
    }

    public function testRefusesATargetAndTargets(): void
    {
        try {
            $this->getTwig()->createTemplate('<twig:Turbo:Stream action="remove" target="one" targets=".many" />')->render();
        } catch (RuntimeError $error) {
            self::assertInstanceOf(InvalidArgumentException::class, $error->getPrevious());

            return;
        }

        self::fail('A target and targets must be refused.');
    }

    private function getTwig(): Environment
    {
        $container = $this->kernel->getContainer()->get('test.service_container');
        self::assertInstanceOf(ContainerInterface::class, $container);

        $twig = $container->get('twig');
        self::assertInstanceOf(Environment::class, $twig);

        return $twig;
    }
}
