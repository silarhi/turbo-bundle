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

use function dirname;

use PHPUnit\Framework\TestCase;
use Silarhi\TurboBundle\EventListener\TurboFrameListener;
use Silarhi\TurboBundle\SilarhiTurboBundle;
use Silarhi\TurboBundle\TurboManager;
use Silarhi\TurboBundle\Twig\TurboExtension;
use Symfony\Component\Config\Definition\ConfigurationInterface;
use Symfony\Component\Config\Definition\Exception\InvalidConfigurationException;
use Symfony\Component\Config\Definition\Processor;
use Symfony\Component\DependencyInjection\ContainerBuilder;
use Symfony\Component\DependencyInjection\Extension\ConfigurationExtensionInterface;
use Symfony\Component\DependencyInjection\Extension\ExtensionInterface;
use Symfony\Component\DependencyInjection\ParameterBag\ParameterBag;
use Symfony\Component\DependencyInjection\Reference;
use Symfony\Component\EventDispatcher\DependencyInjection\RegisterListenersPass;
use Symfony\Component\EventDispatcher\EventDispatcher;
use Symfony\Component\EventDispatcher\EventDispatcherInterface;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\HttpKernelInterface;
use Symfony\Component\HttpKernel\KernelEvents;
use Twig\Environment;
use Twig\Loader\ArrayLoader;

class SilarhiTurboBundleTest extends TestCase
{
    public function testExtensionIsExposedUnderTheSilarhiTurboAlias(): void
    {
        self::assertSame('silarhi_turbo', $this->extension()->getAlias());
    }

    public function testConfigurationDefaults(): void
    {
        self::assertSame([
            'base_template' => 'base-frame.html.twig',
            'follow_delete_redirects' => true,
        ], $this->processConfiguration([]));
    }

    public function testConfigurationAcceptsCustomValues(): void
    {
        self::assertSame([
            'base_template' => 'layout/_frame.html.twig',
            'follow_delete_redirects' => false,
        ], $this->processConfiguration([
            'base_template' => 'layout/_frame.html.twig',
            'follow_delete_redirects' => false,
        ]));
    }

    public function testConfigurationRejectsAnEmptyBaseTemplate(): void
    {
        $this->expectException(InvalidConfigurationException::class);
        $this->expectExceptionMessage('silarhi_turbo.base_template');

        $this->processConfiguration(['base_template' => '']);
    }

    public function testConfigurationRejectsANonBooleanFollowDeleteRedirects(): void
    {
        $this->expectException(InvalidConfigurationException::class);
        $this->expectExceptionMessage('silarhi_turbo.follow_delete_redirects');

        $this->processConfiguration(['follow_delete_redirects' => 'yes']);
    }

    public function testConfigurationRejectsUnknownKeys(): void
    {
        $this->expectException(InvalidConfigurationException::class);
        $this->expectExceptionMessage('unknown_option');

        $this->processConfiguration(['unknown_option' => true]);
    }

    public function testRegistersTheTurboManagerAsAnAutowiredService(): void
    {
        $container = $this->loadExtension([]);

        self::assertTrue($container->hasDefinition(TurboManager::class));
        self::assertTrue($container->getDefinition(TurboManager::class)->isAutowired());
    }

    public function testRegistersTheFrameListenerAsAnEventSubscriberWithDefaultConfiguration(): void
    {
        $definition = $this->loadExtension([])->getDefinition(TurboFrameListener::class);

        self::assertTrue($definition->hasTag('kernel.event_subscriber'));
        self::assertEquals([new Reference(TurboManager::class), true], $definition->getArguments());
    }

    public function testPassesFollowDeleteRedirectsToTheFrameListener(): void
    {
        $definition = $this->loadExtension(['follow_delete_redirects' => false])->getDefinition(TurboFrameListener::class);

        self::assertEquals([new Reference(TurboManager::class), false], $definition->getArguments());
    }

    public function testRegistersTheTwigExtensionWithDefaultConfiguration(): void
    {
        $definition = $this->loadExtension([])->getDefinition(TurboExtension::class);

        self::assertTrue($definition->hasTag('twig.extension'));
        self::assertEquals([new Reference(TurboManager::class), 'base-frame.html.twig'], $definition->getArguments());
    }

    public function testPassesTheConfiguredBaseTemplateToTheTwigExtension(): void
    {
        $definition = $this->loadExtension(['base_template' => 'layout/_frame.html.twig'])->getDefinition(TurboExtension::class);

        self::assertEquals([new Reference(TurboManager::class), 'layout/_frame.html.twig'], $definition->getArguments());
    }

    public function testLaterConfigurationsOverrideEarlierOnes(): void
    {
        $container = $this->loadExtension(
            ['base_template' => 'first.html.twig', 'follow_delete_redirects' => false],
            ['base_template' => 'second.html.twig'],
        );

        self::assertSame('second.html.twig', $container->getDefinition(TurboExtension::class)->getArgument(1));
        self::assertFalse($container->getDefinition(TurboFrameListener::class)->getArgument(1));
    }

    public function testCompiledContainerWiresTheListenerIntoTheEventDispatcher(): void
    {
        $container = $this->compiledContainer([]);

        $request = new Request();
        $request->headers->set('Turbo-Frame', 'main');
        $this->requestStack($container)->push($request);

        $event = new ResponseEvent(
            self::createStub(HttpKernelInterface::class),
            $request,
            HttpKernelInterface::MAIN_REQUEST,
            new RedirectResponse('/target'),
        );
        $dispatcher = $container->get('event_dispatcher');
        self::assertInstanceOf(EventDispatcherInterface::class, $dispatcher);
        $dispatcher->dispatch($event, KernelEvents::RESPONSE);

        self::assertSame(Response::HTTP_NO_CONTENT, $event->getResponse()->getStatusCode());
        self::assertSame('/target', $event->getResponse()->headers->get('Turbo-Location'));
    }

    public function testCompiledContainerHonoursDisabledFollowDeleteRedirects(): void
    {
        $container = $this->compiledContainer(['follow_delete_redirects' => false]);

        $request = Request::create('/resource', 'DELETE');
        $request->headers->set('X-Turbo-Request-Id', 'abc');
        $this->requestStack($container)->push($request);

        $event = new ResponseEvent(
            self::createStub(HttpKernelInterface::class),
            $request,
            HttpKernelInterface::MAIN_REQUEST,
            new RedirectResponse('/list'),
        );
        $dispatcher = $container->get('event_dispatcher');
        self::assertInstanceOf(EventDispatcherInterface::class, $dispatcher);
        $dispatcher->dispatch($event, KernelEvents::RESPONSE);

        self::assertTrue($event->getResponse()->isRedirection());
    }

    public function testCompiledContainerProvidesATwigExtensionUsingTheConfiguredBaseTemplate(): void
    {
        $container = $this->compiledContainer(['base_template' => 'layout/_frame.html.twig']);

        $request = new Request();
        $request->headers->set('Turbo-Frame', 'main');
        $this->requestStack($container)->push($request);

        $extension = $container->get('test.twig_extension');
        self::assertInstanceOf(TurboExtension::class, $extension);

        $twig = new Environment(new ArrayLoader([
            'page.html.twig' => '{{ "page.html.twig"|turbo_frame("main") }}',
        ]));
        $twig->addExtension($extension);

        self::assertSame('layout/_frame.html.twig', $twig->render('page.html.twig'));
    }

    private function extension(): ExtensionInterface
    {
        $extension = (new SilarhiTurboBundle())->getContainerExtension();
        self::assertInstanceOf(ExtensionInterface::class, $extension);

        return $extension;
    }

    /**
     * @param array<string, mixed> $config
     *
     * @return array<mixed>
     */
    private function processConfiguration(array $config): array
    {
        $extension = $this->extension();
        self::assertInstanceOf(ConfigurationExtensionInterface::class, $extension);

        $configuration = $extension->getConfiguration([], $this->containerBuilder());
        self::assertInstanceOf(ConfigurationInterface::class, $configuration);

        return (new Processor())->processConfiguration($configuration, [$config]);
    }

    /**
     * @param array<string, mixed> ...$configs
     */
    private function loadExtension(array ...$configs): ContainerBuilder
    {
        $container = $this->containerBuilder();
        $this->extension()->load($configs, $container);

        return $container;
    }

    /**
     * Mirrors the kernel parameters a real Kernel sets: Symfony 6.4 reads
     * `kernel.environment` and `kernel.build_dir` when loading an AbstractBundle extension.
     */
    private function containerBuilder(): ContainerBuilder
    {
        return new ContainerBuilder(new ParameterBag([
            'kernel.environment' => 'test',
            'kernel.debug' => false,
            'kernel.build_dir' => sys_get_temp_dir() . '/silarhi_turbo_bundle_test',
            'kernel.cache_dir' => sys_get_temp_dir() . '/silarhi_turbo_bundle_test',
            'kernel.project_dir' => dirname(__DIR__),
        ]));
    }

    /**
     * @param array<string, mixed> $config
     */
    private function compiledContainer(array $config): ContainerBuilder
    {
        $container = $this->loadExtension($config);
        $container->register(RequestStack::class, RequestStack::class)->setPublic(true);
        $container->register('event_dispatcher', EventDispatcher::class)->setPublic(true);
        $container->setAlias('test.twig_extension', TurboExtension::class)->setPublic(true);
        $container->addCompilerPass(new RegisterListenersPass());
        $container->compile();

        return $container;
    }

    private function requestStack(ContainerBuilder $container): RequestStack
    {
        $requestStack = $container->get(RequestStack::class);
        self::assertInstanceOf(RequestStack::class, $requestStack);

        return $requestStack;
    }
}
