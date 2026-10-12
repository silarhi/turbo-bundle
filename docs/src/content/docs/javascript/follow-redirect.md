---
title: Keeping a redirect in its frame
description: Opt a turbo-frame out of the frame-redirect escalation with data-turbo-follow-redirect.
sidebar:
    order: 5
---

With the PHP [`TurboFrameListener`](/php/frame-redirects/), every redirect answered to a frame request becomes a full
page visit. Some frames should keep the stock Turbo behavior, where the redirect target is loaded inside the frame: a
paginated list, a wizard whose steps redirect to each other.

Add `data-turbo-follow-redirect` to that `<turbo-frame>`:

```html
<turbo-frame id="wizard" data-turbo-follow-redirect>
    <!-- … -->
</turbo-frame>
```

On `turbo:before-fetch-request`, the handler reads the `Turbo-Frame` header of the request, finds the frame with that
`id` in the document, and when it carries the attribute adds a `Turbo-Frame-Follow-Redirect: 1` header.
`TurboFrameListener` leaves every redirect of such requests untouched, and Turbo follows them inside the frame.

- The attribute is read on the frame the request targets: for a link with `data-turbo-frame="wizard"` outside the
  frame, it is the `wizard` frame.
- It wins over [`follow_delete_redirects`](/php/frame-redirects/#delete-redirects): a `DELETE` redirect from that
  frame is left untouched too. Answer it with a `303 See Other`, which the browser follows with a `GET`; a `302` is
  followed with the same `DELETE` method:

    ```php
    return $this->redirectToRoute('project_index', status: Response::HTTP_SEE_OTHER);
    ```
