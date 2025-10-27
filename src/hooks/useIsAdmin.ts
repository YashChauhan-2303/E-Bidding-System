import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useIsAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAdmin() {
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      // First check the `profiles` table - your screenshots show role was set there
      try {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

        if (!profileError && profileData?.role === 'admin') {
          setIsAdmin(true);
          setLoading(false);
          return;
        }
      } catch (e) {
        // ignore and fallback to user_roles check
        console.warn('profiles check failed', e);
      }

      // Fallback: check the user_roles table (this is the original source of truth)
      try {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();

        setIsAdmin(!!roleData);
      } catch (e) {
        console.warn('user_roles check failed', e);
        setIsAdmin(false);
      }
      setLoading(false);
    }

    checkAdmin();
  }, [user]);

  return { isAdmin, loading };
}
