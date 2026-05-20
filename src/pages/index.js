import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (user) {
      router.replace('/sites');
      return;
    }

    fetch('/api/auth/status')
      .then((res) => res.json())
      .then((data) => {
        router.replace(data.registrationOpen && !data.hasUsers ? '/register' : '/login');
      })
      .catch(() => {
        router.replace('/login');
      });
  }, [user, loading, router]);

  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
    </div>
  );
}
