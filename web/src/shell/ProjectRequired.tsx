import React from "react";
import { isDesktop } from "../lib/desktop";
import { Icon } from "../components/Icon";

export function ProjectRequired({ onOpen }: { onOpen: () => void }) {
  const desktop = isDesktop();
  return (
    <div className="project-required">
      <span className="project-required-mark"><Icon name="folder" size={22} /></span>
      <h1>Choose a code folder to start</h1>
      <p>
        Bark needs a project folder before it can plan a thread or inspect changes. Your
        conversation starts after the folder is open.
      </p>
      {desktop ? (
        <button className="bark-primary" onClick={onOpen}><Icon name="folder" size={14} />Open code folder…</button>
      ) : (
        <p className="project-required-note">Folder selection is available in the Bark app.</p>
      )}
    </div>
  );
}
