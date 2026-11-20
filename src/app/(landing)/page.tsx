import { redirect } from 'next/navigation';

// Middleware handles the redirect to /es or /en.
// This fallback exists in case middleware is bypassed.
export default function RootPage() {
  redirect('/es');
}
