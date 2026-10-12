---
title: Configuration
description: Every option of the silarhi_turbo configuration, with its default value, and the services the bundle registers.
sidebar:
    order: 1
---

The configuration applies when `SilarhiTurboBundle` is registered. Every option is optional (default values shown):

```yaml
# config/packages/silarhi_turbo.yaml
silarhi_turbo:
    base_template: 'base-frame.html.twig' # template the turbo_frame filter falls back to
    follow_delete_redirects: true # convert DELETE-request redirects to a Turbo-Location visit
```

| Option                    | Type    | Default                  | Effect                                                                                                                                                                                |
| ------------------------- | ------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base_template`           | string  | `'base-frame.html.twig'` | Template the [`turbo_frame` filter](/php/turbo-frame-filter/) returns inside a matching frame, when neither a base template argument nor a `-frame` sibling applies. Cannot be empty. |
| `follow_delete_redirects` | boolean | `true`                   | Convert a redirect answered to a Turbo `DELETE` request into a `Turbo-Location` visit ([`DELETE` redirects](/php/frame-redirects/#delete-redirects)).                                 |

Unknown keys are rejected.

## Registered services

| Service id (class)                                     | Tag                       | Registered                    |
| ------------------------------------------------------ | ------------------------- | ----------------------------- |
| `Silarhi\TurboBundle\TurboManager`                     | (autowired)               | always                        |
| `Silarhi\TurboBundle\EventListener\TurboFrameListener` | `kernel.event_subscriber` | always                        |
| `Silarhi\TurboBundle\Twig\TurboExtension`              | `twig.extension`          | when `twig/twig` is installed |

The services are private: inject `TurboManager` by its class name to read the Turbo headers of the current request
in your own code ([PHP API](/reference/php-api/#turbomanager)).
