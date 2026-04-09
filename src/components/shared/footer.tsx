import Link from 'next/link';

export function Footer() {
  return (
    <footer style={{ borderColor: 'var(--border)', background: 'var(--muted)' }} className="border-t">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white"
                style={{ background: 'linear-gradient(135deg, #0d9488, #6366f1)' }}>
                AF
              </div>
              <span className="font-bold">AgentFlow</span>
            </div>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              AI agents as a service.<br />
              One API, infinite possibilities.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Product</h4>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              <li><Link href="/playground" className="hover:underline">Playground</Link></li>
              <li><Link href="/pricing" className="hover:underline">Pricing</Link></li>
              <li><Link href="/docs" className="hover:underline">API Docs</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Developers</h4>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              <li><Link href="/docs" className="hover:underline">Documentation</Link></li>
              <li><Link href="/dashboard" className="hover:underline">API Keys</Link></li>
              <li><Link href="/docs#sdks" className="hover:underline">SDKs</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Company</h4>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              <li><Link href="#" className="hover:underline">About</Link></li>
              <li><Link href="#" className="hover:underline">Blog</Link></li>
              <li><Link href="#" className="hover:underline">Contact</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 text-center text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
          &copy; {new Date().getFullYear()} AgentFlow. Powered by AIBackHub.
        </div>
      </div>
    </footer>
  );
}
