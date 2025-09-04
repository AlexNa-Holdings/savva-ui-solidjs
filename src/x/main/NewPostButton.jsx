// src/x/main/NewPostButton.jsx
import { navigate } from "../../routing/hashRouter.js";
import { useApp } from "../../context/AppContext.jsx";
import { EditIcon as NewPostIcon } from "../ui/icons/ActionIcons.jsx";

export default function NewPostButton() {
  const app = useApp();
  const { t } = app;

  const handleNewPost = () => {
    app.setSavedScrollY(window.scrollY);
    navigate("/editor/new");
  };

  return (
    <button
      class="p-1.5 rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
      onClick={handleNewPost}
      title={t("header.newPost")}
    >
      <NewPostIcon class="w-5 h-5" />
    </button>
  );
}