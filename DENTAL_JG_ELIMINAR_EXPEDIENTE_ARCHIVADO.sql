-- DENTAL JG: eliminación explícita y protegida de un expediente histórico.
-- Ejecutar una sola vez en Supabase > SQL Editor, después de respaldar.
-- Solo permite borrar una fila de patient_account_archive a usuarios con rol admin.
-- No borra pagos activos ni filas de otros clientes.

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_archived_patient(p_archive_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada.';
  END IF;

  IF to_regclass('public.app_user_roles') IS NULL THEN
    RAISE EXCEPTION 'No existe public.app_user_roles; no se eliminó ningún expediente.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.app_user_roles r
    WHERE lower(coalesce(to_jsonb(r)->>'role','')) = 'admin'
      AND (
        to_jsonb(r)->>'user_id' = v_uid::text
        OR to_jsonb(r)->>'id_usuario' = v_uid::text
      )
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Solo Administración puede eliminar expedientes archivados.';
  END IF;

  IF to_regclass('public.patient_account_archive') IS NULL THEN
    RAISE EXCEPTION 'No existe public.patient_account_archive.';
  END IF;

  DELETE FROM public.patient_account_archive WHERE id = p_archive_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró el expediente archivado solicitado.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_archived_patient(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_archived_patient(uuid) TO authenticated;

COMMIT;
