
-- 1. Add new columns to missions table
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS address text DEFAULT '';
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS mission_with text DEFAULT '';

-- 2. Create mission_photos table
CREATE TABLE IF NOT EXISTS public.mission_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  image_url text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.mission_photos ENABLE ROW LEVEL SECURITY;

-- Users can view photos of their own missions
CREATE POLICY "Users can view own mission photos"
ON public.mission_photos FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Admins can view all mission photos
CREATE POLICY "Admins can view all mission photos"
ON public.mission_photos FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Users can upload photos to their own missions
CREATE POLICY "Users can insert own mission photos"
ON public.mission_photos FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can delete their own photos
CREATE POLICY "Users can delete own mission photos"
ON public.mission_photos FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- 3. Create storage bucket for mission photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('mission-photos', 'mission-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for mission-photos bucket
CREATE POLICY "Anyone can view mission photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'mission-photos');

CREATE POLICY "Authenticated users can upload mission photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'mission-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own mission photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'mission-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 4. Fix settlements RLS - add proper targeted policies 
-- (existing policies use subqueries on user_roles which is fine but let's ensure clean coverage)
-- Drop duplicates first
DROP POLICY IF EXISTS "Admins can manage settlements" ON public.settlements;
DROP POLICY IF EXISTS "Users can view own settlements" ON public.settlements;
DROP POLICY IF EXISTS "Admins can do everything on settlements" ON public.settlements;
DROP POLICY IF EXISTS "Users can view their own settlements" ON public.settlements;

-- Recreate clean policies
CREATE POLICY "Users can view own settlements"
ON public.settlements FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all settlements"
ON public.settlements FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert settlements"
ON public.settlements FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update settlements"
ON public.settlements FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete settlements"
ON public.settlements FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Users can acknowledge their own settlements
CREATE POLICY "Users can update own settlement acknowledgment"
ON public.settlements FOR UPDATE
TO authenticated
USING (user_id = auth.uid());
