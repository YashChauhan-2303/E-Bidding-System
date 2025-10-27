import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, username: string, recaptchaToken?: string) => Promise<{ error: unknown }>;
  signIn: (email: string, password: string, recaptchaToken?: string) => Promise<{ error: unknown }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, username: string, recaptchaToken?: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            username,
            role: 'user',
            recaptchaToken: recaptchaToken ?? null
          }
        }
      });

      if (error) {
        toast.error(error.message);
        return { error };
      }

      toast.success('Account created successfully!');
      return { error: null };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
      return { error };
    }
  };

  const signIn = async (email: string, password: string, recaptchaToken?: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(error.message);
        return { error };
      }

      toast.success('Signed in successfully!');
      // After sign in, check if the user is an admin and redirect accordingly.
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData?.session?.user?.id;
        if (uid) {
          // check profiles first (mirrors useIsAdmin behavior)
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', uid)
            .maybeSingle();

          if (profile?.role === 'admin') {
            // Ensure the DB-side user_roles row exists by calling the security-definer helper
            // `public.make_user_admin`. This migration-created RPC runs with elevated
            // privileges and will insert the admin row so RLS permits admin actions.
            try {
              await supabase.rpc('make_user_admin', { _user_id: uid });
            } catch (e) {
              console.warn('make_user_admin rpc failed', e);
            }

            navigate('/admin');
            return { error: null };
          }

          // fallback to user_roles
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', uid)
            .eq('role', 'admin')
            .maybeSingle();

          if (roleData) {
            navigate('/admin');
            return { error: null };
          }
        }
      } catch (e) {
        // ignore and continue to default route
        console.warn('post-signin admin check failed', e);
      }

      navigate('/');
      return { error: null };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
      return { error };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Signed out successfully');
      navigate('/auth/sign-in');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}