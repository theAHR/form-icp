"use client";
import { useMemo } from "react";
import DatePicker, { DateObject } from "react-multi-date-picker";
import type { Value } from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import gregorian from "react-date-object/calendars/gregorian";
import "react-multi-date-picker/styles/colors/green.css";

function toPickerValue(iso?: string): DateObject | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  const g = new DateObject({
    calendar: gregorian,
    year: y,
    month: m,
    day: d,
  });
  if (!g.isValid) return undefined;
  return g.convert(persian);
}

function toIso(value: Value): string {
  if (!value) return "";
  const obj = Array.isArray(value) ? value[0] : value;
  if (!obj || typeof obj === "string" || obj instanceof Date) return "";
  const g = new DateObject(obj).convert(gregorian);
  if (!g.isValid) return "";
  const y = g.year;
  const m = String(g.month.number).padStart(2, "0");
  const d = String(g.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function PersianDateInput({
  id,
  name,
  value,
  onChange,
  onBlur,
  required,
  disabled,
  invalid,
}: {
  id?: string;
  name?: string;
  value?: string;
  onChange: (iso: string) => void;
  onBlur?: () => void;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const pickerValue = useMemo(() => toPickerValue(value), [value]);
  return (
    <div className={"persian-date-field" + (invalid ? " has-error" : "")}>
      <DatePicker
        id={id}
        value={pickerValue}
        onChange={(v) => onChange(toIso(v))}
        onClose={onBlur}
        calendar={persian}
        locale={persian_fa}
        calendarPosition="bottom-right"
        containerClassName="persian-date"
        inputClass={
          "persian-date-input" + (invalid ? " input-invalid" : "")
        }
        className="green"
        format="YYYY/MM/DD"
        editable={false}
        disabled={disabled}
        placeholder="سال/ماه/روز"
      />
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
    </div>
  );
}
