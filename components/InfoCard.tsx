import type { Gender } from "@/lib/tdee";

type Props = {
  gender: Gender;
  icon: string;
  title: string;
  body: string;
  className?: string;
};

export function InfoCard({ gender, icon, title, body, className = "" }: Props) {
  const tone =
    gender === "male"
      ? {
          border: "border-[#b6d5ff]/70",
          bg: "bg-[#f5faff]/90",
          iconBg: "bg-[#e6f2ff]",
          title: "text-[#0b2a4a]",
        }
      : {
          border: "border-[var(--border-cherry-soft)]",
          bg: "bg-white/90",
          iconBg: "bg-[var(--cherry-muted)]",
          title: "text-[var(--cherry)]",
        };

  return (
    <div
      className={[
        "rounded-2xl border-2 px-4 py-4 shadow-[0_8px_24px_var(--panel-shadow-soft)]",
        tone.border,
        tone.bg,
        className,
      ].join(" ")}
      dir="rtl"
    >
      <div className="flex items-start gap-3">
        <div
          className={[
            "flex size-11 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-sm",
            tone.iconBg,
          ].join(" ")}
          aria-hidden
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className={["text-lg font-extrabold tracking-tight", tone.title].join(" ")}>
            {title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text)]/85">
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}

