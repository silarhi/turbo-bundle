import { defineSilarhiDocs } from '@silarhi/docs-kit'

export default defineSilarhiDocs({
    slug: 'turbo-bundle',
    title: 'Turbo Bundle',
    description:
        'Framework-agnostic Hotwire Turbo helpers: a lifecycle orchestrator for the browser and frame-redirect following for Symfony.',
    sidebar: [
        { label: 'Getting started', items: [{ autogenerate: { directory: 'getting-started' } }] },
        { label: 'JavaScript', items: [{ autogenerate: { directory: 'javascript' } }] },
        { label: 'PHP', items: [{ autogenerate: { directory: 'php' } }] },
        { label: 'Reference', items: [{ autogenerate: { directory: 'reference' } }] },
    ],
})
