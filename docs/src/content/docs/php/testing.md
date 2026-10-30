---
title: Testing
description: Send the headers of Turbo requests and assert Turbo Stream and Turbo-Location responses in your functional tests.
sidebar:
    order: 4
---

`Silarhi\TurboBundle\Test\TurboAssertionsTrait` gives your PHPUnit tests the headers Turbo sends and assertions on the
responses it gets. Use it in a `WebTestCase`:

```php
use Silarhi\TurboBundle\Test\TurboAssertionsTrait;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class ProjectControllerTest extends WebTestCase
{
    use TurboAssertionsTrait;

    public function testDeleteRemovesTheProject(): void
    {
        $client = static::createClient();
        $client->request('DELETE', '/projects/1', server: self::getTurboStreamHeaders());

        self::assertTurboStreamResponse($client->getResponse());
        self::assertTurboStream($client->getResponse(), 'remove', 'project_1');
    }

    public function testEditInTheModalVisitsTheProject(): void
    {
        $client = static::createClient();
        $client->request('GET', '/projects/1/edit', server: self::getTurboFrameHeaders('modal'));
        $client->submitForm('Save', ['project[name]' => 'Renamed'], serverParameters: self::getTurboFrameHeaders('modal'));

        self::assertTurboLocation($client->getResponse(), '/projects/1');
    }
}
```

The assertions take the response to check, so they also work in a plain `TestCase`, with a response from an
`HttpKernel` or built by hand. They need `phpunit/phpunit`, and the `dom` extension for `assertTurboStream()`.

## Request headers

Both helpers return `$server` parameters, for `$client->request(server: …)`, `submitForm(serverParameters: …)` or
`Request::create(server: …)`. Each call generates a new `X-Turbo-Request-Id`, as Turbo 8 does.

| Helper                           | Headers                                                       | Simulates                                                 |
| -------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| `getTurboFrameHeaders($frameId)` | `Turbo-Frame`, `X-Turbo-Request-Id`                           | a request made by `<turbo-frame id="$frameId">`           |
| `getTurboStreamHeaders()`        | `Accept: text/vnd.turbo-stream.html, …`, `X-Turbo-Request-Id` | a form submission by Turbo 8, which accepts Turbo Streams |

Add them up for a form submitted inside a frame (the request id of the first one wins):

```php
server: self::getTurboFrameHeaders('modal') + self::getTurboStreamHeaders()
```

## Assertions

| Assertion                                               | Passes when                                                                                                                        |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `assertTurboStreamResponse($response)`                  | the `Content-Type` is `text/vnd.turbo-stream.html`                                                                                 |
| `assertTurboStream($response, $action, $target = null)` | the response has a `<turbo-stream>` with this `action`, and this `target` or `targets` when given                                  |
| `assertTurboLocation($response, $expectedUrl)`          | the response is the `204` with a `Turbo-Location` that [`TurboFrameListener`](/php/frame-redirects/) answers instead of a redirect |

`assertTurboStream()` reads the streams whatever the content type, as a frame response can carry
[streams outside its frame](/javascript/frame-streams/). On failure, it lists the streams it found:

```text
Failed asserting that the response has a "replace project_2" Turbo Stream. Found: "replace project_1", "remove .notification".
```

Each assertion takes an optional last `$message` argument, as PHPUnit's do.

A redirect that [`TurboFrameListener` turns into a `303`](/php/frame-redirects/#303-see-other-for-the-other-redirects)
is checked with the `assertResponseRedirects($expectedLocation, 303)` of `WebTestCase`.
