import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"

import { CompetencyTraining } from "@/pages/CompetencyTraining"
import { Home } from "@/pages/Home"
import { LearnerMatchReportPage } from "@/pages/LearnerMatchReportPage"
import { setTargetRole } from "@/store/targetRole"

let root: Root | null = null

function render(page: "competency" | "home" | "report") {
  const container = document.querySelector<HTMLElement>("#report-test-root")
  if (!container) throw new Error("Report test root is missing")
  root ??= createRoot(container)
  root.render(
    <MemoryRouter initialEntries={[page === "competency" ? "/competency" : page === "report" ? "/learner-report" : "/"]} key={page}>
      {page === "competency" ? <CompetencyTraining /> : page === "report" ? <LearnerMatchReportPage /> : <Home />}
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

export function mountLearnerReport() {
  setTargetRole({ domainId: "software", roleId: "fde" })
  render("report")
}
