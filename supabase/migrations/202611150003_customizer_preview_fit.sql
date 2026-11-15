-- JP eyewear customizer: frame-aligned lens preview assets.
-- The mask must use the same square canvas and alignment as the frame image.

alter table public.customizer_frames
  add column if not exists lens_mask_url text,
  add column if not exists lens_mask_file_id text;

comment on column public.customizer_frames.lens_mask_url is
  'Optional transparent image whose alpha channel marks the lens areas on the frame image canvas.';

comment on column public.customizer_frames.lens_mask_file_id is
  'ImageKit file id for lens_mask_url.';
