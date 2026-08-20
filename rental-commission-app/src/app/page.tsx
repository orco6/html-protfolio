import { redirect } from 'next/navigation';

import { getSessionUser } from '@/lib/auth';

export default async function RootPage() {
  const user = await getSessionUser();
  redirect(!user ? '/login' : user.role === 'admin' ? '/admin' : '/report');
}
