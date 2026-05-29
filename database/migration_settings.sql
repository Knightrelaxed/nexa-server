-- Migration to support Category archiving
ALTER TABLE public.categories
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- Ensure existing categories are not archived
UPDATE public.categories SET is_archived = FALSE WHERE is_archived IS NULL;
