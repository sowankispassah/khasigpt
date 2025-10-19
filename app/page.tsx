import type { ReactNode } from "react";
import ChatLayout from "./(chat)/layout";
import ChatPage from "./(chat)/page";

export default async function RootPage() {
  const page = await ChatPage();
  return ChatLayout({ children: page as ReactNode });
}

