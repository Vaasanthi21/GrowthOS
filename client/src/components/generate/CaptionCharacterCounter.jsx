import React from "react";

const PLATFORM_LIMITS = {
  linkedin: { minOptimal: 1200, maxOptimal: 1500, hardLimit: 3000, name: "LinkedIn" },
  instagram: { minOptimal: 125, maxOptimal: 150, hardLimit: 2200, name: "Instagram" },
  facebook: { minOptimal: 40, maxOptimal: 80, hardLimit: 63206, name: "Facebook" },
  twitter: { minOptimal: 240, maxOptimal: 270, hardLimit: 280, name: "Twitter / X" },
  whatsapp: { minOptimal: 100, maxOptimal: 200, hardLimit: 1000, name: "WhatsApp" },
};

export default function CaptionCharacterCounter({ text = "", platform = "instagram", className = "" }) {
  const count = String(text || "").length;
  const key = String(platform || "instagram").toLowerCase();
  const spec = PLATFORM_LIMITS[key] || PLATFORM_LIMITS.instagram;

  let status = "optimal"; // "optimal" | "warning" | "exceeded"
  let label = "Optimal length";

  if (count > spec.hardLimit) {
    status = "exceeded";
    label = `Exceeds ${spec.name} limit (${spec.hardLimit} max)`;
  } else if (count > spec.maxOptimal) {
    status = "warning";
    label = `Above target (${spec.minOptimal}–${spec.maxOptimal} chars ideal)`;
  } else if (count < spec.minOptimal && spec.minOptimal > 100) {
    status = "warning";
    label = `Short for ${spec.name} (${spec.minOptimal}–${spec.maxOptimal} chars ideal)`;
  } else {
    status = "optimal";
    label = `Optimal for ${spec.name}`;
  }

  const badgeStyles = {
    optimal: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    exceeded: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  };

  const dotStyles = {
    optimal: "bg-emerald-500",
    warning: "bg-amber-500",
    exceeded: "bg-rose-500",
  };

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs border font-medium transition-colors ${badgeStyles[status]} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[status]}`} />
      <span>{count} chars</span>
      <span className="text-[10px] opacity-75">({label})</span>
    </div>
  );
}
