import type { ReactElement } from "react";
import { Panel } from "../components/ui";
import { useWiki } from "../lib/data";
import type { ChangelogBlock } from "../lib/types";

function Blocks({ blocks }: { blocks: ChangelogBlock[] }) {
  const out: ReactElement[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) out.push(<ul key={out.length}>{bullets.map((text, i) => <li key={i}>{text}</li>)}</ul>);
    bullets = [];
  };
  for (const block of blocks) {
    if (block.type === "bullet") bullets.push(block.text);
    else {
      flush();
      out.push(block.type === "heading" ? <h3 key={out.length}>{block.text}</h3> : <p key={out.length}>{block.text}</p>);
    }
  }
  flush();
  return <>{out}</>;
}

export function ChangelogPage() {
  const { index, data } = useWiki();
  const repo = data.release.repositoryChangelog;
  return (
    <main>
      <div className="pagehead">
        <span className="kicker">CHANGELOG</span>
        <h1>Release notes</h1>
        <p>As published on Modrinth{repo?.length ? ", plus the development changelog from the official repository" : ""}.</p>
      </div>
      {repo?.length ? (
        <Panel kicker="GITHUB MAIN · UNRELEASED" title="In development">
          <Blocks blocks={repo} />
        </Panel>
      ) : null}
      {index.changelog.map((entry) => (
        <Panel key={entry.version} kicker={`${entry.published} · ${entry.channel.toUpperCase()} · MINECRAFT ${entry.minecraft.join(", ")}`} title={`${entry.version}: ${entry.name}`}>
          <Blocks blocks={entry.blocks} />
        </Panel>
      ))}
    </main>
  );
}
