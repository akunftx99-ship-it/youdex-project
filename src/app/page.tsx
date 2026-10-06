import { redirect } from "next/navigation";

/**
 * No auth wall. The root entry point lands straight on the trading dashboard —
 * the sign-in surface it used to gate behind no longer exists.
 */
export default function Home() {
  redirect("/app");
}
