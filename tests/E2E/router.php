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

/*
 * Router of `php -S` for the end-to-end tests: serves the scripts of the pages under /e2e/ (Turbo and Tom Select from
 * assets/node_modules, the TurboHandler built in assets/dist, and the test application), and hands everything else to
 * the E2E application.
 */

use Silarhi\TurboBundle\Tests\E2E\E2eApp;
use Symfony\Component\HttpFoundation\Request;

$scripts = [
    '/e2e/turbo.js' => __DIR__ . '/../../assets/node_modules/@hotwired/turbo/dist/turbo.es2017-esm.js',
    '/e2e/turbo-handler.js' => __DIR__ . '/../../assets/dist/index.mjs',
    '/e2e/app.js' => __DIR__ . '/public/app.js',
    '/e2e/tom-select.js' => __DIR__ . '/../../assets/node_modules/tom-select/dist/js/tom-select.complete.min.js',
    '/e2e/tom-select.css' => __DIR__ . '/../../assets/node_modules/tom-select/dist/css/tom-select.css',
];

$uri = $_SERVER['REQUEST_URI'] ?? '/';
$path = \is_string($uri) ? parse_url($uri, \PHP_URL_PATH) : null;
if (\is_string($path) && isset($scripts[$path])) {
    if (!is_file($scripts[$path])) {
        http_response_code(404);

        return true;
    }

    header('Content-Type: ' . (str_ends_with($path, '.css') ? 'text/css' : 'text/javascript'));
    readfile($scripts[$path]);

    return true;
}

require __DIR__ . '/../../vendor/autoload.php';

$kernel = E2eApp::kernel();
$request = Request::createFromGlobals();
$response = $kernel->handle($request);
$response->send();
$kernel->terminate($request, $response);
