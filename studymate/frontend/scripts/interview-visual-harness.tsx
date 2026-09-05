import { createRoot } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"

import { AIInterview } from "@/pages/AIInterview"
import { setTargetRole } from "@/store/targetRole"

setTargetRole({ domainId: "software", roleId: "fde" })
createRoot(document.querySelector<HTMLElement>("#interview-visual-root")!).render(
  <MemoryRouter initialEntries={["/ai-interview"]}><AIInterview /></MemoryRouter>,
)
