-- Create user_roles table with security definer functions
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Policy to view roles (everyone can see roles)
CREATE POLICY "User roles are viewable by everyone"
ON public.user_roles
FOR SELECT
USING (true);

-- Only admins can insert/update/delete roles (we'll enforce this in edge functions)
CREATE POLICY "Only system can manage roles"
ON public.user_roles
FOR ALL
USING (false);

-- Security definer function to check if user has a role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Security definer function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- Function to make a user admin (for initial setup)
CREATE OR REPLACE FUNCTION public.make_user_admin(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Admin policies for auctions
CREATE POLICY "Admins can update any auction"
ON public.auctions
FOR UPDATE
USING (public.is_admin());

-- Admin policies for items
CREATE POLICY "Admins can view all items"
ON public.items
FOR SELECT
USING (public.is_admin());

CREATE POLICY "Admins can update any item"
ON public.items
FOR UPDATE
USING (public.is_admin());

CREATE POLICY "Admins can delete any item"
ON public.items
FOR DELETE
USING (public.is_admin());