// src/components/main/MainView.jsx
import { useApp } from "../../context/AppContext";
import TabsBar from "./TabsBar";
import Container from "../layout/Container";
import ToTopButton from "../ui/ToTopButton";

export default function MainView() {
  const { t } = useApp();

  return (
    <Container>
      <ToTopButton />
      <div class="w-full">
        <TabsBar />
      </div>
    </Container>
  );
}