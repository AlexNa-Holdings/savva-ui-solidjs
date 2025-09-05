// src/x/npo/NpoTOokens.jsx
export default function NpoTOokens(props) {
  const { t } = props;
  return (
    <div class="text-sm text-[hsl(var(--muted-foreground))]">
      {t("npo.page.tokens.placeholder")}
    </div>
  );
}
