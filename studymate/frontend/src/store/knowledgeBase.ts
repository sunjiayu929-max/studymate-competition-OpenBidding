const STORAGE_KEY = "sm:selected-knowledge-base"

export function getSelectedKnowledgeBaseId(): number | null {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isInteger(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export function setSelectedKnowledgeBaseId(value: number | null) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, String(value))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* optional */
  }
  window.dispatchEvent(new Event("studymate:knowledge-base-change"))
}

if (typeof window !== "undefined") {
  window.addEventListener("studymate:user-session-reset", () => setSelectedKnowledgeBaseId(null))
}
