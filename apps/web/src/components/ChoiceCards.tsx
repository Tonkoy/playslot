'use client';

/** One of two or three ways to do something, each with a line saying what it means. */
export function ChoiceCards<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; title: string; help: string }[];
}) {
  return (
    <div>
      <div className="acct-field" style={{ marginBottom: 8 }}>
        {label}
      </div>
      <div className="og-choices" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              className={`og-choice${on ? ' is-on' : ''}`}
              onClick={() => onChange(o.value)}
            >
              <b>{o.title}</b>
              <small>{o.help}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
