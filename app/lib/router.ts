import { useEffect, useState } from "react";

// Hash routes: "#/item/minecraft%3Adiamond?tab=uses" -> { parts: ["item", "minecraft:diamond"], query }
export type Route = { parts: string[]; query: URLSearchParams };

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "");
  const [pathPart, queryPart = ""] = clean.split("?");
  return {
    parts: pathPart.split("/").filter(Boolean).map((part) => decodeURIComponent(part)),
    query: new URLSearchParams(queryPart),
  };
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(location.hash));
      if (!location.hash.includes("keepScroll")) window.scrollTo(0, 0);
    };
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function href(...parts: (string | number | undefined | null)[]) {
  return `#/${parts.filter((part) => part !== undefined && part !== null && part !== "").map((part) => encodeURIComponent(String(part))).join("/")}`;
}

export function withQuery(link: string, query: Record<string, string | number | undefined | null>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  const text = params.toString();
  return text ? `${link}?${text}` : link;
}

export const itemHref = (key: string) => href("item", key);
export const recipeHref = (slug: string) => href("recipe", slug);
export const lootHref = (id: string) => href("loot", id);
export const structureHref = (id: string) => href("places", id);
export const advHref = (id: string, tab?: string) => withQuery(href("advancements"), { tab, sel: id });
