import React, { useState, useRef } from 'react';

export function VNFormattedInput({ 
  value, 
  onChange, 
  readOnly, 
  className = "", 
  placeholder = "0", 
  align = "center",
  onBlur,
  onKeyDown,
  onCommit,
  allowNullWhenEmpty = false,
  isCurrency = false
}: { 
  value?: number | null; 
  onChange?: (val: number | null) => void; 
  readOnly?: boolean; 
  className?: string; 
  placeholder?: string; 
  align?: "left" | "center" | "right";
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onCommit?: (val: number | null) => void;
  allowNullWhenEmpty?: boolean;
  isCurrency?: boolean;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [tempValue, setTempValue] = useState("");
  const committedRef = useRef(false);

  const formatVN = (val?: number | null) => {
    if (val === undefined || val === null) return "";
    const isFractional = typeof val === 'number' && Math.abs(val - Math.round(val)) > 1e-4;
    return new Intl.NumberFormat('vi-VN', {
      minimumFractionDigits: (isCurrency && isFractional) ? 2 : 0,
      maximumFractionDigits: 3
    }).format(val);
  };

  if (readOnly) {
    return (
      <span className={`block w-full text-${align} ${className}`}>
        {formatVN(value)}
      </span>
    );
  }

  const resolveFinalVal = (valStr: string): number | null => {
    const trimmed = valStr.trim();
    if (trimmed === "") {
      return allowNullWhenEmpty ? null : 0;
    }
    const parsed = parseFloat(trimmed);
    return isNaN(parsed) ? (allowNullWhenEmpty ? null : 0) : parsed;
  };

  return (
    <input
      type={isFocused ? "number" : "text"}
      step="any"
      className={`w-full bg-transparent border-none focus:ring-0 p-0 text-xs text-${align} ${className}`}
      placeholder={placeholder}
      value={isFocused ? tempValue : formatVN(value)}
      onFocus={() => {
        setIsFocused(true);
        setTempValue(value === null || value === undefined || value === 0 ? "" : String(value));
        committedRef.current = false;
      }}
      onBlur={(e) => {
        setIsFocused(false);
        const finalVal = resolveFinalVal(tempValue);
        if (onChange) onChange(finalVal);
        if (onBlur) onBlur(e);
        if (onCommit && !committedRef.current) {
          committedRef.current = true;
          onCommit(finalVal);
        }
      }}
      onChange={(e) => setTempValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
          const finalVal = resolveFinalVal(tempValue);
          if (onChange) onChange(finalVal);
          if (onCommit && !committedRef.current) {
            committedRef.current = true;
            onCommit(finalVal);
          }
        }
        if (onKeyDown) onKeyDown(e);
      }}
    />
  );
}
