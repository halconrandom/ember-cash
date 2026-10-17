/**
 * Lecturas de households para Server Components. Todas pasan por RLS: solo
 * devuelven households donde el usuario actual es miembro.
 */
import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Miembro tal como lo devuelve get_household_members(). */
export type HouseholdMember = {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: "owner" | "member";
};

/** Household del usuario con su rol y la lista de miembros. */
export type MyHousehold = {
  id: string;
  name: string;
  myRole: "owner" | "member";
  members: HouseholdMember[];
};

/** Households del usuario actual, con miembros. */
export async function getMyHouseholds(userId: string): Promise<MyHousehold[]> {
  const supabase = await createClient();

  const { data: memberships, error } = await supabase
    .from("household_members")
    .select("role, households(id, name)")
    .eq("user_id", userId)
    .order("joined_at");
  if (error) throw new Error(`No se pudieron leer los households: ${error.message}`);

  return Promise.all(
    memberships
      .filter((m) => m.households !== null)
      .map(async (m) => {
        const household = m.households!;
        const { data: members, error: membersError } = await supabase.rpc("get_household_members", {
          hid: household.id,
        });
        if (membersError) {
          throw new Error(`No se pudieron leer los miembros: ${membersError.message}`);
        }
        return {
          id: household.id,
          name: household.name,
          myRole: m.role as MyHousehold["myRole"],
          members: members.map((row) => ({
            userId: row.user_id,
            displayName: row.display_name,
            avatarUrl: row.avatar_url,
            role: row.role as HouseholdMember["role"],
          })),
        };
      }),
  );
}

/** Máximo de miembros por household (constante definida en SQL). */
export async function getMaxHouseholdMembers(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("max_household_members");
  if (error) throw new Error(`No se pudo leer el máximo de miembros: ${error.message}`);
  return data;
}
