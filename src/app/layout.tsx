import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'RTM Build Planner',
  description: 'Build planner and damage simulator for RTM: Refuge',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
