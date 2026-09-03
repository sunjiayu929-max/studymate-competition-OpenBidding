import { useCallback, useEffect, useRef, useState } from "react"
import { useReducedMotion } from "framer-motion"

import "./DigitalHumanVideo.css"
import {
  DIGITAL_HUMAN_MEDIA,
  DIGITAL_HUMAN_VIDEO,
  type DigitalHumanState,
} from "@/lib/digitalHuman"
import { cn } from "@/lib/utils"

interface DigitalHumanVideoProps {
  state: DigitalHumanState
  alt?: string
  className?: string
  mediaClassName?: string
  priority?: boolean
  stageBlend?: boolean
  floatingBlend?: boolean
  idleOnly?: boolean
  idleSrc?: string
  idlePoster?: string
  active?: boolean
  showFallbackStatus?: boolean
}

export function DigitalHumanVideo({
  state,
  alt = "因材智训真人讲师视频",
  className,
  mediaClassName,
  priority = false,
  stageBlend = false,
  floatingBlend = false,
  idleOnly = false,
  idleSrc = DIGITAL_HUMAN_VIDEO.idleSrc,
  idlePoster = DIGITAL_HUMAN_VIDEO.idlePoster,
  active = true,
  showFallbackStatus = false,
}: DigitalHumanVideoProps) {
  const reduceMotion = useReducedMotion()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const idleVideoRef = useRef<HTMLVideoElement | null>(null)
  const speakingVideoRef = useRef<HTMLVideoElement | null>(null)
  const wasSpeakingRef = useRef(false)
  const idleCycleRef = useRef(0)
  const idleRestartTimerRef = useRef<number | null>(null)
  const idleBoundaryTimerRef = useRef<number | null>(null)
  const idleRestingRef = useRef(false)
  const idlePlaybackAllowedRef = useRef(false)
  const enterIdleHoldRef = useRef<(
    idleVideo: HTMLVideoElement,
    playbackState: DigitalHumanState,
    source: "pre-end" | "ended-fallback",
  ) => void>(null)
  const scheduleIdleBoundaryTimerRef = useRef<(
    idleVideo: HTMLVideoElement,
    playbackState: DigitalHumanState,
  ) => void>(null)
  const [idleReady, setIdleReady] = useState(false)
  const [speakingReady, setSpeakingReady] = useState(false)
  const [idleFailed, setIdleFailed] = useState(false)
  const [speakingFailed, setSpeakingFailed] = useState(false)
  const [inViewport, setInViewport] = useState(true)
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  )

  const speaking = !idleOnly && state === "speaking"
  const speakingTrackVisible = speaking && speakingReady && !speakingFailed
  const idleTrackVisible = !speakingTrackVisible && idleReady && !idleFailed
  const activeReady = speaking ? speakingTrackVisible || idleTrackVisible : idleTrackVisible
  const activeFailed = speaking ? speakingFailed && idleFailed : idleFailed

  const clearIdleRestartTimer = useCallback(() => {
    if (idleRestartTimerRef.current === null) return
    window.clearTimeout(idleRestartTimerRef.current)
    idleRestartTimerRef.current = null
    rootRef.current?.setAttribute("data-idle-restart-pending", "false")
  }, [])

  const clearIdleBoundaryTimer = useCallback(() => {
    if (idleBoundaryTimerRef.current === null) return
    window.clearTimeout(idleBoundaryTimerRef.current)
    idleBoundaryTimerRef.current = null
    rootRef.current?.setAttribute("data-idle-boundary-armed", "false")
  }, [])

  const clearIdleTimers = useCallback(() => {
    clearIdleRestartTimer()
    clearIdleBoundaryTimer()
  }, [clearIdleBoundaryTimer, clearIdleRestartTimer])

  const enterIdleHold = useCallback((
    idleVideo: HTMLVideoElement,
    playbackState: DigitalHumanState,
    source: "pre-end" | "ended-fallback",
  ) => {
    if (idleRestingRef.current || !idlePlaybackAllowedRef.current) return
    idleRestingRef.current = true
    clearIdleTimers()
    idleVideo.pause()

    if (Number.isFinite(idleVideo.duration) && idleVideo.duration > 0.08) {
      try {
        idleVideo.currentTime = idleVideo.duration - DIGITAL_HUMAN_VIDEO.idleCadence.lastFrameOffsetSeconds
      } catch {
        /* metadata may still be loading */
      }
    }

    const cadenceIndex = idleCycleRef.current % DIGITAL_HUMAN_VIDEO.idleCadence.holdMilliseconds.length
    const holdMilliseconds = DIGITAL_HUMAN_VIDEO.idleCadence.holdMilliseconds[cadenceIndex]
    idleCycleRef.current += 1
    rootRef.current?.setAttribute("data-idle-resting", "true")
    rootRef.current?.setAttribute("data-idle-hold-source", source)
    rootRef.current?.setAttribute("data-idle-restart-pending", "true")

    idleRestartTimerRef.current = window.setTimeout(() => {
      idleRestartTimerRef.current = null
      rootRef.current?.setAttribute("data-idle-restart-pending", "false")
      if (!idlePlaybackAllowedRef.current) return

      const nextCadenceIndex = idleCycleRef.current % DIGITAL_HUMAN_VIDEO.idleCadence.playbackRates.length
      try {
        idleVideo.currentTime = 0
      } catch {
        /* metadata may still be loading */
      }
      idleVideo.playbackRate =
        DIGITAL_HUMAN_MEDIA[playbackState].playbackRate
        * DIGITAL_HUMAN_VIDEO.idleCadence.playbackRates[nextCadenceIndex]
      idleRestingRef.current = false
      rootRef.current?.setAttribute("data-idle-resting", "false")
      rootRef.current?.setAttribute("data-idle-cycle", String(idleCycleRef.current))
      void idleVideo.play()
        .then(() => scheduleIdleBoundaryTimerRef.current?.(idleVideo, playbackState))
        .catch(() => {})
    }, holdMilliseconds)
  }, [clearIdleTimers])

  const scheduleIdleBoundaryTimer = useCallback((idleVideo: HTMLVideoElement, playbackState: DigitalHumanState) => {
    clearIdleBoundaryTimer()
    if (
      !idlePlaybackAllowedRef.current
      || !Number.isFinite(idleVideo.duration)
      || idleVideo.duration <= DIGITAL_HUMAN_VIDEO.idleCadence.preEndLeadSeconds
    ) return

    const secondsUntilBoundary =
      idleVideo.duration
      - DIGITAL_HUMAN_VIDEO.idleCadence.preEndLeadSeconds
      - idleVideo.currentTime
    const delayMilliseconds = Math.max(
      0,
      secondsUntilBoundary / Math.max(0.1, idleVideo.playbackRate) * 1000,
    )
    rootRef.current?.setAttribute("data-idle-boundary-armed", "true")
    idleBoundaryTimerRef.current = window.setTimeout(() => {
      idleBoundaryTimerRef.current = null
      rootRef.current?.setAttribute("data-idle-boundary-armed", "false")
      enterIdleHoldRef.current?.(idleVideo, playbackState, "pre-end")
    }, delayMilliseconds)
  }, [clearIdleBoundaryTimer])

  enterIdleHoldRef.current = enterIdleHold
  scheduleIdleBoundaryTimerRef.current = scheduleIdleBoundaryTimer

  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry?.isIntersecting ?? true
        if (!visible) {
          idlePlaybackAllowedRef.current = false
          clearIdleTimers()
        }
        setInViewport(visible)
      },
      { rootMargin: "80px", threshold: 0.02 },
    )
    observer.observe(root)
    return () => observer.disconnect()
  }, [clearIdleTimers])

  useEffect(() => {
    const onVisibilityChange = () => {
      const visible = document.visibilityState !== "hidden"
      if (!visible) {
        idlePlaybackAllowedRef.current = false
        clearIdleTimers()
      }
      setDocumentVisible(visible)
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [clearIdleTimers])

  useEffect(() => {
    const idleVideo = idleVideoRef.current
    const speakingVideo = speakingVideoRef.current
    idlePlaybackAllowedRef.current = false
    clearIdleTimers()
    if (reduceMotion || !idleVideo || (!idleOnly && !speakingVideo)) return

    if (idleVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) setIdleReady(true)
    if (speakingVideo?.readyState && speakingVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) setSpeakingReady(true)

    const shouldPlay = active && inViewport && documentVisible && state !== "paused"
    if (!shouldPlay) {
      idleVideo.pause()
      speakingVideo?.pause()
      wasSpeakingRef.current = false
      return
    }

    if (speaking && speakingVideo) {
      idleVideo.pause()
      if (!wasSpeakingRef.current) {
        try {
          speakingVideo.currentTime = 0
        } catch {
          /* metadata may still be loading */
        }
      }
      speakingVideo.playbackRate = DIGITAL_HUMAN_MEDIA.speaking.playbackRate
      void speakingVideo.play().catch(() => {})
    } else {
      speakingVideo?.pause()
      idlePlaybackAllowedRef.current = true
      const resumeFromRest =
        idleRestingRef.current
        || (
          Number.isFinite(idleVideo.duration)
          && idleVideo.currentTime >= idleVideo.duration - DIGITAL_HUMAN_VIDEO.idleCadence.preEndLeadSeconds
        )
      idleRestingRef.current = false
      const cadenceIndex = idleCycleRef.current % DIGITAL_HUMAN_VIDEO.idleCadence.playbackRates.length
      idleVideo.playbackRate =
        DIGITAL_HUMAN_MEDIA[state].playbackRate * DIGITAL_HUMAN_VIDEO.idleCadence.playbackRates[cadenceIndex]
      if (idleVideo.ended || resumeFromRest) {
        try {
          idleVideo.currentTime = 0
        } catch {
          /* metadata may still be loading */
        }
      }
      void idleVideo.play()
        .then(() => scheduleIdleBoundaryTimer(idleVideo, state))
        .catch(() => {})
    }
    wasSpeakingRef.current = speaking
    return () => {
      idlePlaybackAllowedRef.current = false
      clearIdleTimers()
    }
  }, [
    active,
    clearIdleTimers,
    documentVisible,
    idleOnly,
    inViewport,
    reduceMotion,
    scheduleIdleBoundaryTimer,
    speaking,
    state,
  ])

  useEffect(() => () => {
    idlePlaybackAllowedRef.current = false
    clearIdleTimers()
  }, [clearIdleTimers])

  const handleIdleEnded = () => {
    const idleVideo = idleVideoRef.current
    if (!idleVideo || reduceMotion || !active || !inViewport || !documentVisible || speaking || state === "paused") return
    enterIdleHold(idleVideo, state, "ended-fallback")
  }

  const fallbackReason = activeFailed
    ? "视频加载失败，已切换为静态形象"
    : reduceMotion
      ? "已按系统设置减少动态"
      : null

  return (
    <div
      ref={rootRef}
      className={cn(
        "digital-human-video relative overflow-hidden",
        stageBlend && "digital-human-video--stage",
        floatingBlend && "digital-human-video--floating",
        className,
      )}
      data-state={state}
      data-active-track={speakingTrackVisible ? "speaking" : "idle"}
      data-video-ready={activeReady ? "true" : "false"}
      data-idle-ready={idleReady ? "true" : "false"}
      data-speaking-ready={speakingReady ? "true" : "false"}
      data-video-fallback={fallbackReason ? "true" : undefined}
      role="img"
      aria-label={`${alt}，当前状态：${DIGITAL_HUMAN_MEDIA[state].label}`}
    >
      <img
        src={idlePoster}
        alt=""
        draggable={false}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        className={cn(
          "digital-human-video__media absolute inset-0 h-full w-full object-contain",
          !reduceMotion && activeReady && !activeFailed ? "opacity-0" : "opacity-100",
          mediaClassName,
        )}
      />
      {!reduceMotion && (
        <>
          <video
            ref={idleVideoRef}
            className={cn(
              "digital-human-video__media digital-human-video__media--idle absolute inset-0 h-full w-full object-contain",
              idleTrackVisible ? "opacity-100" : "opacity-0",
              mediaClassName,
            )}
            src={idleSrc}
            muted
            playsInline
            preload="auto"
            controls={false}
            aria-hidden
            tabIndex={-1}
            disablePictureInPicture
            onEnded={handleIdleEnded}
            onCanPlay={() => setIdleReady(true)}
            onLoadedData={() => setIdleReady(true)}
            onError={() => {
              setIdleFailed(true)
              setIdleReady(false)
            }}
          />
          {!idleOnly && (
            <video
              ref={speakingVideoRef}
              className={cn(
                "digital-human-video__media digital-human-video__media--speaking absolute inset-0 h-full w-full object-contain",
                speakingTrackVisible ? "opacity-100" : "opacity-0",
                mediaClassName,
              )}
              src={DIGITAL_HUMAN_VIDEO.speakingSrc}
              muted
              playsInline
              loop
              preload={priority ? "auto" : "metadata"}
              controls={false}
              aria-hidden
              tabIndex={-1}
              disablePictureInPicture
              onCanPlay={() => setSpeakingReady(true)}
              onLoadedData={() => setSpeakingReady(true)}
              onError={() => {
                setSpeakingFailed(true)
                setSpeakingReady(false)
              }}
            />
          )}
        </>
      )}
      {showFallbackStatus && fallbackReason && (
        <span className="absolute bottom-3 right-3 rounded-full bg-[#18232D]/78 px-2.5 py-1 text-[9px] font-semibold text-white shadow-sm">
          {fallbackReason}
        </span>
      )}
    </div>
  )
}
