// src/components/ui/PostTime.jsx
import { createMemo } from "solid-js";
import { useApp } from "../../context/AppContext";

const MINUTE = 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const WEEK = DAY * 7;

// Technical comments for the i18n script. Do not remove.
// t("time.minute.singular")
// t("time.minute.plural")
// t("time.hour.singular")
// t("time.hour.plural")
// t("time.day.singular")
// t("time.day.plural")

export default function PostTime(props) {
  const { t, lang } = useApp();

  const parsedDate = createMemo(() => {
    const ts = props.timestamp;
    if (!ts) return null;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  });

  const fullDateTime = createMemo(() => {
    const d = parsedDate();
    if (!d) return "";
    return new Intl.DateTimeFormat(lang(), {
      dateStyle: 'long',
      // timeStyle: 'short',
    }).format(d);
  });

  const shortDate = createMemo(() => {
    const d = parsedDate();
    if (!d) return "";
    return new Intl.DateTimeFormat(lang(), {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  });

  const displayText = createMemo(() => {
    const d = parsedDate();
    if (!d) return "";

    if (props.format === 'short') {
      return shortDate();
    }

    // Default to 'long' format (relative time)
    const now = new Date();
    const diffSeconds = Math.round((now.getTime() - d.getTime()) / 1000);

    if (diffSeconds < MINUTE) {
      return t("time.now");
    }
    if (diffSeconds < HOUR) {
      const n = Math.floor(diffSeconds / MINUTE);
      const key = n === 1 ? "time.minute.singular" : "time.minute.plural";
      return t(key, { n });
    }
    if (diffSeconds < DAY) {
      const n = Math.floor(diffSeconds / HOUR);
      const key = n === 1 ? "time.hour.singular" : "time.hour.plural";
      return t(key, { n });
    }
    if (diffSeconds < WEEK) {
      const n = Math.floor(diffSeconds / DAY);
      const key = n === 1 ? "time.day.singular" : "time.day.plural";
      return t(key, { n });
    }

    return fullDateTime();
  });

  return (
    <div
      class="text-xs text-[hsl(var(--muted-foreground))]"
      title={fullDateTime()}
    >
      {displayText()}
    </div>
  );
}