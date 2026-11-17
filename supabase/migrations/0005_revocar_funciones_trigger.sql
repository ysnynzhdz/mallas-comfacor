-- MALLAS COMFACOR · Migración 0005 · Las funciones de disparadores no se pueden llamar desde la API
revoke execute on function public.handle_new_user(), public.audit_row_change(), public.protect_self_admin(),
  public.touch_updated_at() from public, anon, authenticated;
