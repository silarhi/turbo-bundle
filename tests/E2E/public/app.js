/*
 * This file is part of the Turbo Bundle package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

/*
 * The application of the end-to-end tests: Turbo and a TurboHandler whose listeners log each mount and unmount of a
 * [data-widget] element in window.e2eLog ("mount home", "unmount home"). A [data-decorate] widget also gets a badge, a
 * change to the DOM like a real listener would make: a snapshot cached before its cleanup would restore it twice.
 *
 * The options of the handler come from the query string of the first page: /?morphMutations&visitOnFrameMissing
 */

import '@hotwired/turbo'
import { TurboHandler } from '@silarhi/turbo'

window.e2eLog = []

function widgets(container) {
    return [...(container.matches('[data-widget]') ? [container] : []), ...container.querySelectorAll('[data-widget]')]
}

function mount(container) {
    for (const widget of widgets(container)) {
        window.e2eLog.push(`mount ${widget.id}`)
        if (widget.hasAttribute('data-decorate')) {
            const badge = document.createElement('span')
            badge.className = 'badge'
            badge.textContent = 'mounted'
            widget.append(badge)
        }
    }
}

function unmount(container) {
    for (const widget of widgets(container)) {
        window.e2eLog.push(`unmount ${widget.id}`)
        for (const badge of widget.querySelectorAll(':scope > .badge')) {
            badge.remove()
        }
    }
}

const options = Object.fromEntries([...new URLSearchParams(window.location.search).keys()].map((key) => [key, true]))

new TurboHandler({ onMount: mount, onUnmount: unmount, ...options }).start()
