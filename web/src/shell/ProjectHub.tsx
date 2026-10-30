import React, { useMemo, useState } from "react";
import { PROJECT_TOOLS, openProjectTool, type ProjectTool } from "../lib/commands";
import { Icon } from "../components/Icon";

const GROUPS: Array<ProjectTool["group"]> = [
  "Planning",
  "Agent setup",
  "History & maintenance",
];

interface ProjectHubProps {
  projectName: string | null;
  projectRoot: string | null;
  boardName: string | null;
}

export function ProjectHub({ projectName, projectRoot, boardName }: ProjectHubProps) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = useMemo(
    () =>
      GROUPS.map((group) => ({
        group,
        tools: PROJECT_TOOLS.filter(
          (tool) =>
            tool.group === group &&
            (!q ||
              [tool.label, tool.group, tool.id, tool.keywords || "", tool.hint]
                .join(" ")
                .toLowerCase()
                .includes(q))
        ),
      })).filter((group) => group.tools.length > 0),
    [q]
  );

  return (
    <div className="project-hub">
      <header className="project-hub-head">
        <div>
          <h1>Project tools</h1>
          <p>
            {projectName || "This project"}
            {boardName ? ` · ${boardName}.board` : ""}
            {projectRoot ? <span className="project-hub-path">{projectRoot}</span> : null}
          </p>
        </div>
        <label className="surfaces-search project-hub-search">
          <Icon name="search" size={13} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search project tools"
            placeholder="Search project tools…"
          />
        </label>
      </header>

      {groups.length === 0 ? (
        <p className="project-hub-empty">No project tools match “{query}”.</p>
      ) : (
        groups.map(({ group, tools }) => (
          <section key={group} className="project-hub-group">
            <h2>{group}</h2>
            <div className="project-hub-grid">
              {tools.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className="project-hub-row"
                  onClick={() => openProjectTool(tool)}
                >
                  <span className="project-hub-icon"><Icon name={tool.icon} size={16} /></span>
                  <span className="project-hub-copy">
                    <strong>{tool.label}</strong>
                    <small>{tool.hint}</small>
                  </span>
                  <Icon name="chevR" size={14} className="project-hub-chev" />
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
