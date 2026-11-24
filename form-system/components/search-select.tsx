"use client";
import { useMemo, useState } from "react";
import { Button } from "./ui/button";

export function SearchSelect({
  id,
  value,
  options,
  placeholder,
  invalid,
  onChange,
  onBlur,
}: {
  id?: string;
  value: string;
  options: string[];
  placeholder?: string;
  invalid?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const term = q.trim();
    if (!term) return options.slice(0, 80);
    return options.filter((o) => o.includes(term)).slice(0, 80);
  }, [options, q]);
  return (
    <div className="search-select">
      {value ? (
        <div className="search-select-value">
          <span>{value}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange("");
              setQ("");
              setOpen(true);
            }}
          >
            تغییر
          </Button>
        </div>
      ) : (
        <input
          id={id}
          value={q}
          placeholder={placeholder ?? "جستجو و انتخاب…"}
          aria-invalid={invalid}
          className={invalid ? "input-invalid" : undefined}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setTimeout(() => setOpen(false), 150);
            onBlur?.();
          }}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
        />
      )}
      {open && !value && (
        <div className="search-select-menu" role="listbox">
          {filtered.map((o) => (
            <button
              type="button"
              key={o}
              role="option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(o);
                setQ("");
                setOpen(false);
              }}
            >
              {o}
            </button>
          ))}
          {!filtered.length && (
            <div className="muted" style={{ padding: "8px 12px" }}>
              موردی یافت نشد.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
