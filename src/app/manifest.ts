import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Northside Physio',
    short_name: 'Northside',
    description: 'Book and manage physiotherapy appointments at Northside Physio, Bengaluru.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F7F5F0',
    theme_color: '#2D6A4F',
    lang: 'en-IN',
    categories: ['health', 'medical', 'lifestyle'],
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Book an appointment', short_name: 'Book', url: '/book', icons: [{ src: '/icons/192', sizes: '192x192' }] },
      { name: 'Staff schedule', short_name: 'Schedule', url: '/staff', icons: [{ src: '/icons/192', sizes: '192x192' }] },
    ],
  }
}
