import { GlyphText, Locked, Panel } from "../components/ui";
import { useWiki } from "../lib/data";
import { roman, seconds, titleCase } from "../lib/format";
import { href, lootHref } from "../lib/router";
import { useSpoilers } from "../lib/spoilers";

export function MechanicsPage() {
  const { data } = useWiki();
  const { hidden } = useSpoilers();
  const p = data.mechanics.progression;
  const groups = data.mechanics.groups.filter((group) => !group.migration && (group.effects.length || group.messages.length || group.gamerules.length || group.attributes.length));
  const migration = data.mechanics.groups.filter((group) => group.migration);
  return (
    <main>
      <div className="pagehead">
        <span className="kicker">MECHANICS</span>
        <h1>How the pack changes the rules</h1>
        <p>Read from the pack's {data.mechanics.functionCount} functions. Everything below is taken from a command in the pack; each section names its source.</p>
      </div>
      {p ? (
        <Panel kicker="DEATH SYSTEM" title="Hearts and dying">
          <dl className="facts">
            {p.maximumHearts !== null ? (
              <>
                <dt>Most hearts</dt>
                <dd>{p.maximumHearts} ❤</dd>
              </>
            ) : null}
            <dt>Lost per death</dt>
            <dd>
              {Object.entries(p.heartsLostPerDeath).map(([difficulty, value]) => `${titleCase(difficulty)}: ${value} ❤`).join(" · ") || "Needs verification"}
            </dd>
            {p.minimumHearts ? (
              <>
                <dt>Never below</dt>
                <dd>{Object.entries(p.minimumHearts).filter(([, value]) => value !== null).map(([difficulty, value]) => `${titleCase(difficulty)}: ${value} ❤`).join(" · ")}</dd>
              </>
            ) : null}
            {p.startingMinimumHearts !== null ? (
              <>
                <dt>Starting minimum</dt>
                <dd>{p.startingMinimumHearts} ❤</dd>
              </>
            ) : null}
            {p.crystalHeartGain !== null ? (
              <>
                <dt>Heart gained</dt>
                <dd>+{p.crystalHeartGain} ❤ per heart item used</dd>
              </>
            ) : null}
            <dt>Sources</dt>
            <dd>
              {Object.values(p.sources).map((source) => (
                <code key={source} style={{ marginRight: 6 }}>{source}</code>
              ))}
            </dd>
          </dl>
        </Panel>
      ) : null}
      {data.mechanics.gamerules.length ? (
        <Panel kicker="GAME RULES" title="Game rules the pack sets">
          <div className="scrollx">
          <table className="data">
            <tbody>
              {data.mechanics.gamerules.map((rule) => (
                <tr key={rule.rule}>
                  <td>{titleCase(rule.rule)}</td>
                  <td>
                    <code>{rule.value}</code>
                  </td>
                  <td className="muted">{rule.function}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Panel>
      ) : null}
      {groups.map((group) => {
        const key = `mechanic:${group.id}`;
        if (hidden(key)) {
          return (
            <Panel key={group.id} kicker="LOCKED" title="???">
              <Locked spoilerKey={key} />
            </Panel>
          );
        }
        return (
          <Panel key={group.id} kicker={`${group.id} · ${group.files} FUNCTIONS${group.runsEveryTick ? " · RUNS EVERY TICK" : ""}`} title={group.name}>
            <dl className="facts">
              {group.effects.length ? (
                <>
                  <dt>Effects applied</dt>
                  <dd>
                    {group.effects.map((effect, i) => (
                      <div key={i}>
                        {effect.name} {effect.level > 1 ? roman(effect.level) : ""} for {effect.seconds.map((value) => seconds(value)).join(" / ")}
                        {effect.conditional ? <span className="muted"> (under conditions)</span> : null}
                      </div>
                    ))}
                  </dd>
                </>
              ) : null}
              {group.attributes.length ? (
                <>
                  <dt>Attributes</dt>
                  <dd>{group.attributes.join("; ")}</dd>
                </>
              ) : null}
              {group.gamerules.length ? (
                <>
                  <dt>Game rules</dt>
                  <dd>{group.gamerules.map((rule) => `${rule.rule} = ${rule.value}`).join(", ")}</dd>
                </>
              ) : null}
              {group.loot.length ? (
                <>
                  <dt>Gives loot</dt>
                  <dd>
                    {group.loot.map((table) => (
                      <a key={table} href={lootHref(table)} style={{ marginRight: 9 }}>
                        {table}
                      </a>
                    ))}
                  </dd>
                </>
              ) : null}
              {group.messages.length ? (
                <>
                  <dt>In-game messages</dt>
                  <dd>
                    {group.messages.slice(0, 8).map((message, i) => (
                      <div key={i} className="hint">
                        “<GlyphText text={message} />”
                      </div>
                    ))}
                  </dd>
                </>
              ) : null}
              {group.calledFrom.length ? (
                <>
                  <dt>Called from</dt>
                  <dd className="muted">{group.calledFrom.slice(0, 4).join(", ")}</dd>
                </>
              ) : null}
            </dl>
          </Panel>
        );
      })}
      {migration.length ? (
        <Panel kicker="NOT A WAY TO GET ITEMS" title="Item migration">
          <p style={{ margin: 0 }}>
            {migration.map((group) => group.id).join(", ")} update or remove items from older versions of the pack. The items they hand out are replacements for old copies, not a way to obtain them. See <a href={href("items")}>Items</a> for real sources.
          </p>
        </Panel>
      ) : null}
    </main>
  );
}
