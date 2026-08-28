import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Royal Sales IA — Marketing & Sales OS',
    short_name: 'Royal Sales IA',
    description:
      'El sistema operativo con IA para equipos de marketing y ventas de alto rendimiento.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#12131a',
    theme_color: '#12131a',
    categories: ['business', 'productivity', 'marketing'],
    icons: [
      {
        src: '/royal-sales-icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/royal-sales-icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
