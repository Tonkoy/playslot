/**
 * Slides its content open and shut (height via grid rows 0fr → 1fr, so no
 * measuring in JS; content fades in). Always rendered so it can animate;
 * `inert` keeps folded content out of the tab order and screen readers.
 */
export function Collapse({ open, children, id }: { open: boolean; children: React.ReactNode; id?: string }) {
  return (
    <div id={id} className={`collapse${open ? ' is-open' : ''}`} inert={!open}>
      <div className="collapse-inner">{children}</div>
    </div>
  );
}

/** A small chevron that turns when its toggle is open. */
export function Chevron({ open }: { open: boolean }) {
  return (
    <span aria-hidden className={`chev${open ? ' is-open' : ''}`}>
      ›
    </span>
  );
}
