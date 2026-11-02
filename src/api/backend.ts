import { getSupabase } from "@/lib/supabase";
import { createEntities } from "@/api/entities";

// The browser's data layer: Supabase tables for entities, Supabase Storage for files.
const PRIVATE_BUCKET = "private-files";
const PUBLIC_BUCKET = "public-files";

const entityRoots = new WeakMap<object, ReturnType<typeof createEntities>["entities"]>();
const entities = new Proxy({} as Record<string, any>, {
  get(_target, name) {
    if (typeof name !== "string") return undefined;
    const client = getSupabase();
    let entityRoot = entityRoots.get(client);
    if (!entityRoot) {
      entityRoot = createEntities(client).entities;
      entityRoots.set(client, entityRoot);
    }
    return entityRoot[name];
  },
});

async function uploadTo(bucket: string, file: File) {
  const supabase = getSupabase();
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user?.id;
  if (!uid) throw new Error("Sign in before uploading files.");
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", uid)
    .single();
  if (profileError) throw profileError;
  if (!profile.organization_id) throw new Error("Complete company registration before uploading files.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${profile.organization_id}/${uid}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return path;
}

export const backend = {
  entities,
  files: {
    /** Private upload (receipts). Returns { file_uri } for use with signedUrl. */
    uploadPrivate: async ({ file }: { file: File }) => ({ file_uri: await uploadTo(PRIVATE_BUCKET, file) }),
    /** Short-lived link to a private file. */
    signedUrl: async ({ file_uri, expires_in = 600 }: { file_uri: string; expires_in?: number }) => {
      const { data, error } = await getSupabase().storage.from(PRIVATE_BUCKET).createSignedUrl(file_uri, expires_in);
      if (error) throw error;
      return { signed_url: data.signedUrl };
    },
    /** Public upload (logos, signatures). Returns { file_url }. */
    uploadPublic: async ({ file }: { file: File }) => {
      const path = await uploadTo(PUBLIC_BUCKET, file);
      const { data } = getSupabase().storage.from(PUBLIC_BUCKET).getPublicUrl(path);
      return { file_url: data.publicUrl };
    },
  },
};
