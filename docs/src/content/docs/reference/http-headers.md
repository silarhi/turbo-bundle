---
title: HTTP headers
description: The headers exchanged between Turbo, TurboHandler and TurboFrameListener.
sidebar:
    order: 4
---

The two halves only meet on redirect following, through these headers:

| Header                        | Direction | Set by                                                                         | Read by                                                                                            |
| ----------------------------- | --------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `Turbo-Frame`                 | request   | Turbo, on frame requests: the id of the frame                                  | `TurboManager`, the `turbo_frame` filter, `TurboHandler`                                           |
| `X-Turbo-Request-Id`          | request   | Turbo, on its fetch requests                                                   | `TurboManager::isTurboRequest()`, for [`DELETE` redirects](/php/frame-redirects/#delete-redirects) |
| `Turbo-Frame-Follow-Redirect` | request   | `TurboHandler`, value `1`, for frames with `data-turbo-follow-redirect`        | `TurboManager::followTurboFrameRedirect()`                                                         |
| `Turbo-Location`              | response  | `TurboFrameListener`, on a `204` replacing a redirect: the original `Location` | `TurboHandler`, which calls `onRedirect`                                                           |

Any backend can drive `TurboHandler` by answering `Turbo-Location`, and any client can use `TurboFrameListener` by
following it: see [Without `@silarhi/turbo`](/php/frame-redirects/#without-silarhiturbo).
