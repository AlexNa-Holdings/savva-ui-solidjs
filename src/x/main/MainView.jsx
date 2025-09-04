// src/x/main/MainView.jsx
import { useApp } from "../../context/AppContext.jsx";
import TabsBar from "./TabsBar.jsx";
import Container from "../layout/Container.jsx";
import ToTopButton from "../ui/ToTopButton.jsx";
import NewContentBanner from "./NewContentBanner.jsx";

export default function MainView() {
  const { t } = useApp();

  return (
    <Container>
      <ToTopButton />
      <NewContentBanner />
      <div class="w-full">
        <TabsBar />
      </div>
    </Container>
  );
}