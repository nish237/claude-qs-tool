// Project storage — backed by Supabase (table: public.projects).
//
// Row Level Security on that table means every query here is automatically
// scoped to the signed-in user; there is nothing extra to filter on this side.
// See supabase/schema.sql for the table and policies.
import { createClient } from '@/lib/supabase/client';

// ── camelCase (app) <-> snake_case (database) ────────────────────────────
function toRow(project, userId) {
  return {
    id: project.id,
    user_id: userId,
    name: project.name ?? 'Unnamed Project',
    company_name: project.companyName ?? null,
    company_email: project.companyEmail ?? null,
    company_phone: project.companyPhone ?? null,
    scale: project.scale ?? null,
    unit: project.unit ?? null,
    pix_per_unit: project.pixPerUnit ?? null,
    file_name: project.fileName ?? null,
    results: project.results ?? null,
    rates: project.rates ?? {},
    manual_items: project.manualItems ?? [],
    export_secs: project.exportSecs ?? null,
    audit_log: project.auditLog ?? [],
    // created_at is only meaningful on first insert — the update trigger
    // in schema.sql ignores any change to it on later saves.
    ...(project.createdAt ? { created_at: project.createdAt } : {}),
  };
}

function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    companyName: row.company_name,
    companyEmail: row.company_email,
    companyPhone: row.company_phone,
    scale: row.scale,
    unit: row.unit,
    pixPerUnit: row.pix_per_unit,
    fileName: row.file_name,
    results: row.results,
    rates: row.rates ?? {},
    manualItems: row.manual_items ?? [],
    exportSecs: row.export_secs,
    auditLog: row.audit_log ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function requireUser(supabase) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    throw new Error('Not signed in — please sign in to save projects.');
  }
  return data.user;
}

export async function saveProject(project) {
  const supabase = createClient();
  const user = await requireUser(supabase);

  const row = toRow(project, user.id);
  const { error } = await supabase.from('projects').upsert(row);
  if (error) {
    throw new Error(`Could not save project: ${error.message}`);
  }
}

export async function getAllProjects() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Could not load projects: ${error.message}`);
  }
  return (data || []).map(fromRow);
}

export async function getProject(id) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load project: ${error.message}`);
  }
  return fromRow(data);
}

export async function deleteProject(id) {
  const supabase = createClient();
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) {
    throw new Error(`Could not delete project: ${error.message}`);
  }
}
