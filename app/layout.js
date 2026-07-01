import './globals.css'
import { Toaster } from '@/components/ui/sonner'

export const metadata = {
  title: 'AmarktAI Network — Enterprise AI Capability Infrastructure',
  description: 'The central AI orchestration, background jobs, and asset storage pipeline. Connected apps stay lightweight.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased selection:bg-cyan-400/30">
        {children}
        <Toaster theme="dark" position="bottom-right" richColors />
      </body>
    </html>
  )
}
