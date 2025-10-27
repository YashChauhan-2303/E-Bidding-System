import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Gavel, Loader2 } from 'lucide-react';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [recaptchaResponse, setRecaptchaResponse] = useState<string | undefined>(undefined);
  const [recaptchaReady, setRecaptchaReady] = useState(false);
  const { signIn, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Use reCAPTCHA v2 token captured from the rendered widget
    const recaptchaToken = recaptchaResponse;
    await signIn(email, password, recaptchaToken);
    setLoading(false);
  };

  // reCAPTCHA v2 widget handling for sign-in with wait/retry
  useEffect(() => {
    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
    if (!siteKey) return;

    let mounted = true;

    const waitForGrecaptchaAndRender = async () => {
      type Grecaptcha = {
        render?: (container: string | HTMLElement, params?: { sitekey: string; callback?: (token: string) => void }) => number;
        reset?: (id?: number) => void;
      };

      const ensureGre = async (retries = 15, delay = 200): Promise<boolean> => {
        for (let i = 0; i < retries; i++) {
          const win = window as unknown as { grecaptcha?: Grecaptcha };
          if (win.grecaptcha && win.grecaptcha.render) return true;
          await new Promise((r) => setTimeout(r, delay));
        }
        return false;
      };

      if (!(window as unknown as { grecaptcha?: unknown }).grecaptcha) {
        const s = document.createElement('script');
        s.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
        s.async = true;
        document.head.appendChild(s);
      }

      const ok = await ensureGre();
      if (!ok) {
        console.warn('reCAPTCHA did not become available in time');
        return;
      }

      if (!mounted) return;

      try {
        const win = window as unknown as { grecaptcha?: Grecaptcha };
        if (!win.grecaptcha?.render) return;
        const widgetId = win.grecaptcha.render('signin-recaptcha', {
          sitekey: siteKey,
          callback: (token: string) => setRecaptchaResponse(token),
        });
        (window as unknown as { __recaptchaRef?: { widgetId?: number } }).__recaptchaRef = { widgetId };
        setRecaptchaReady(true);
      } catch (err) {
        console.warn('reCAPTCHA render failed', err);
      }
    };

    waitForGrecaptchaAndRender();

    return () => {
      mounted = false;
      try {
        const win = window as unknown as { grecaptcha?: { reset?: (id?: number) => void } };
        const ref = (window as unknown as { __recaptchaRef?: { widgetId?: number } }).__recaptchaRef;
        if (win.grecaptcha?.reset && ref?.widgetId !== undefined) {
          try {
            win.grecaptcha.reset(ref.widgetId);
          } catch (err) {
            console.warn('failed to reset recaptcha', err);
          }
        }
      } catch (err) {
        console.warn('error during recaptcha cleanup', err);
      }
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-hero p-4">
      <Card className="w-full max-w-md shadow-auction">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary">
            <Gavel className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-2xl">Welcome Back</CardTitle>
          <CardDescription>Sign in to your BidSpark account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div id="signin-recaptcha" className="mt-2" />
            {!recaptchaReady && (
              <p className="text-sm text-muted-foreground mt-2">Loading reCAPTCHA...</p>
            )}
            <Button type="submit" className="w-full bg-gradient-primary shadow-glow" disabled={loading || !recaptchaResponse}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
            {!recaptchaResponse && (
              <p className="text-xs text-red-600 mt-2">Please complete the reCAPTCHA before signing in.</p>
            )}
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link to="/auth/sign-up" className="text-primary hover:underline">
              Sign up
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}