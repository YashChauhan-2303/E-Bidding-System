-- Fix infinite recursion by creating security definer function
CREATE OR REPLACE FUNCTION public.is_item_seller(_item_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.items
    WHERE id = _item_id
      AND seller_id = _user_id
  )
$$;

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Items are viewable by everyone for live auctions" ON public.items;
DROP POLICY IF EXISTS "Live and ended auctions are viewable by everyone" ON public.auctions;

-- Recreate items SELECT policy (simpler, no recursion)
CREATE POLICY "Items are viewable by seller or for approved auctions"
ON public.items
FOR SELECT
USING (
  seller_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM auctions 
    WHERE auctions.item_id = items.id 
    AND auctions.status IN ('live', 'ended', 'pending')
  )
);

-- Recreate auctions SELECT policy using security definer function
CREATE POLICY "Auctions viewable for live/ended/pending or by seller"
ON public.auctions
FOR SELECT
USING (
  status IN ('live', 'ended', 'pending')
  OR public.is_item_seller(item_id, auth.uid())
);

-- Create storage bucket for item images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'item-images',
  'item-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
);

-- Storage policies for item images
CREATE POLICY "Anyone can view item images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'item-images');

CREATE POLICY "Authenticated users can upload item images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'item-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own item images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'item-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own item images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'item-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);