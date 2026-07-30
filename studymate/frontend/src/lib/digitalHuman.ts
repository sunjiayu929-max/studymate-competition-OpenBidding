export type DigitalHumanState = "idle" | "listening" | "thinking" | "speaking" | "paused"

export interface DigitalHumanMediaSpec {
  state: DigitalHumanState
  label: string
  playbackRate: number
  accent: "neutral" | "listening" | "thinking" | "speaking" | "paused"
}

const BASE = "/digital-human"

export const DIGITAL_HUMAN_MEDIA: Record<DigitalHumanState, DigitalHumanMediaSpec> = {
  idle: {
    state: "idle",
    label: "待机",
    playbackRate: 1,
    accent: "neutral",
  },
  listening: {
    state: "listening",
    label: "聆听",
    playbackRate: 1,
    accent: "listening",
  },
  thinking: {
    state: "thinking",
    label: "思考",
    playbackRate: 0.9,
    accent: "thinking",
  },
  speaking: {
    state: "speaking",
    label: "讲解",
    playbackRate: 1,
    accent: "speaking",
  },
  paused: {
    state: "paused",
    label: "暂停",
    playbackRate: 0,
    accent: "paused",
  },
}

export const DIGITAL_HUMAN_VIDEO = {
  idleSrc: `${BASE}/studymate-lecturer-idle.mp4`,
  idlePoster: `${BASE}/studymate-lecturer-idle-poster.jpg`,
  idleDurationSeconds: 2,
  speakingSrc: "/avatars/lecturer_talk.mp4",
  speakingPoster: "/avatars/lecturer_talk_poster.jpg",
  speakingDurationSeconds: 33.36,
  floatingIdleSrc: `${BASE}/studymate-tutor-idle-transparent.webm`,
  floatingIdlePoster: `${BASE}/studymate-tutor-idle-transparent-poster.png`,
  floatingWidth: 360,
  floatingHeight: 480,
  width: 960,
  height: 540,
  idleCadence: {
    playbackRates: [0.96, 1, 0.93, 1.02],
    holdMilliseconds: [360, 780, 520, 1040],
    preEndLeadSeconds: 0.08,
    lastFrameOffsetSeconds: 0.04,
  },
} as const

export const DIGITAL_HUMAN_FULLBODY_POSTER = `${BASE}/studymate-tutor-transparent.png`
