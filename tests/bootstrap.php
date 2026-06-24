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

use Symfony\Component\ErrorHandler\ErrorHandler;

require \dirname(__DIR__) . '/vendor/autoload.php';

ErrorHandler::register(null, false);
