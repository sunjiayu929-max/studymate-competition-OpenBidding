import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"

import { CompetencyTraining } from "@/pages/CompetencyTraining"
import { Home } from "@/pages/Home"
import { setTargetRole } from "@/store/targetRole"

let root: Root | null = null

function render(page: "competency" | "home") {
  const container = document.querySelector<HTMLElement>("#report-test-root")
  if (!container) throw new Error("Report test root is missing")
  root ??= createRoot(container)
  root.render(
    <MemoryRouter initialEntries={[page === "competency" ? "/competency" : "/"]} key={page}>
      {page === "competency" ? <CompetencyTraining /> : <Home />}
    </MemoryRouter>,
  )
}

export function mountCompetency() {
  setTargetRole({ domainId: "software", roleId: "fde" })
  render("competency")
}

export function mountHome() {
  setTargetRole({ domainId: "software", roleId: "fde" })
  render("home")
}
