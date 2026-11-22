import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/request-identity";
import { AccountDeletion } from "../AccountDeletion";
export const dynamic="force-dynamic";
export default async function DeleteAccountPage(){
  if(!await getCurrentUser())redirect('/login?next=%2Faccount%2Fdelete');
  return <main className="reader-page"><AccountDeletion/></main>;
}
