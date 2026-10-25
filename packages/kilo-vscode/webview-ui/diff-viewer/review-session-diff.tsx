import {
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  For,
  getOwner,
  onCleanup,
  runWithOwner,
  Show,
} from "solid-js"
import { Accordion } from "@kilocode/kilo-ui/accordion"
import { Button } from "@kilocode/kilo-ui/button"
import { Diff } from "@kilocode/kilo-ui/diff"
import { DiffChanges } from "@kilocode/kilo-ui/diff-changes"
import { FileIcon } from "@kilocode/kilo-ui/file-icon"
import { Icon } from "@kilocode/kilo-ui/icon"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { createDefaultOptions, type DiffProps } from "@kilocode/kilo-ui/pierre"
import { StickyAccordionHeader } from "@kilocode/kilo-ui/sticky-accordion-header"
import { Tooltip } from "@kilocode/kilo-ui/tooltip"
import { processFile, type AnnotationSide, type FileDiffMetadata, type FileDiffOptions } from "@pierre/diffs"
import type { WorktreeFileDiff } from "../src/types/messages"
import { KILO_FILE_PATH_MIME } from "../src/utils/path-mentions"
import "./review-session-diff.css"

type Labels = {
  keep: string
  undo: string
  keepAll: string
  addFileToChat: string
  showEntireFile: string
  showDiffOnly: string
  expandAll: string
  expandTwenty: string
  hiddenLines: (count: number) => string
}

type Review = {
  diff: WorktreeFileDiff
  labels: Labels
  busy?: boolean
  expanded: boolean
  onDecision?: (action: "accept" | "reject", hunk?: string) => void
}

export function SessionReviewHeader(
  props: Review & {
    open: boolean
    comments: number
    onExpand: () => void
    onOpenFile?: () => void
    onAddFileToChat?: () => void
  },
) {
  const blocked = () => props.busy || !props.diff.rejectable || !props.onDecision
  const directory = () => props.diff.file.slice(0, props.diff.file.lastIndexOf("/") + 1)
  const name = () => props.diff.file.slice(props.diff.file.lastIndexOf("/") + 1)
  return (
    <StickyAccordionHeader class="session-review-header">
      <Accordion.Trigger class="session-review-toggle" aria-label={props.diff.file}>
        <span class="session-review-file-icon">
          <FileIcon node={{ path: props.diff.file, type: "file" }} />
        </span>
        <span class="session-review-chevron">
          <Icon name={props.open ? "chevron-down" : "chevron-right"} size="small" />
        </span>
      </Accordion.Trigger>
      <Button
        variant="ghost"
        class="session-review-file"
        aria-label={props.diff.file}
        disabled={!props.onOpenFile}
        draggable
        onDragStart={(event: DragEvent) => {
          event.dataTransfer?.setData(KILO_FILE_PATH_MIME, props.diff.file)
          event.dataTransfer?.setData("text/plain", props.diff.file)
          event.stopPropagation()
        }}
        onClick={() => props.onOpenFile?.()}
      >
        <span class="session-review-name">{name()}</span>
        <Show when={directory()}>
          <span class="session-review-directory">{directory()}</span>
        </Show>
        <DiffChanges changes={props.diff} />
        <Show when={props.comments > 0}>
          <span class="am-diff-file-badge">{props.comments}</span>
        </Show>
      </Button>
      <div class="session-review-file-actions">
        <Tooltip value={props.labels.addFileToChat} placement="top">
          <IconButton
            icon="plus"
            size="small"
            variant="ghost"
            label={props.labels.addFileToChat}
            disabled={props.busy || !props.onAddFileToChat}
            onClick={() => props.onAddFileToChat?.()}
          />
        </Tooltip>
        <Tooltip value={props.expanded ? props.labels.showDiffOnly : props.labels.showEntireFile} placement="top">
          <IconButton
            icon={props.expanded ? "collapse" : "expand"}
            size="small"
            variant="ghost"
            label={props.expanded ? props.labels.showDiffOnly : props.labels.showEntireFile}
            disabled={
              props.diff.summarized || !props.diff.rejectable || props.diff.kind === "image" || !props.diff.patch
            }
            onClick={props.onExpand}
          />
        </Tooltip>
        <Tooltip value={props.labels.undo} placement="top">
          <IconButton
            icon="discard"
            size="small"
            variant="ghost"
            label={props.labels.undo}
            disabled={blocked()}
            onClick={() => {
              if (!blocked()) props.onDecision?.("reject")
            }}
          />
        </Tooltip>
        <Tooltip value={props.labels.keepAll} placement="top">
          <IconButton
            icon="check"
            size="small"
            variant="ghost"
            label={props.labels.keep}
            disabled={blocked()}
            onClick={() => {
              if (!blocked()) props.onDecision?.("accept")
            }}
          />
        </Tooltip>
      </div>
    </StickyAccordionHeader>
  )
}

// Expanded context belongs to a gap, never to a decision hunk. Match only the
// original patch ranges, on the source side Pierre reports for the hovered row.
export function sessionHunk(
  file: FileDiffMetadata,
  ids: WorktreeFileDiff["hunks"],
  line: number,
  side: AnnotationSide,
) {
  if (!ids?.length || ids.length !== file.hunks.length || ids.some((hunk) => !hunk.id)) return
  if (new Set(ids.map((hunk) => hunk.id)).size !== ids.length) return
  const index = file.hunks.findIndex((hunk) => {
    const start = side === "additions" ? hunk.additionStart : hunk.deletionStart
    const count = side === "additions" ? hunk.additionCount : hunk.deletionCount
    return line >= start && line < start + count
  })
  if (index < 0) return
  return { index, id: ids.at(index)!.id }
}

export function ReviewSessionDiff<T>(
  props: Review & {
    visible: boolean
    options: DiffProps<T>
  },
) {
  const owner = getOwner()
  const mounts = new Map<string, () => void>()
  onCleanup(() => {
    for (const dispose of mounts.values()) dispose()
    mounts.clear()
  })
  let container!: HTMLDivElement
  const [hover, setHover] = createSignal<{ index: number; id: string; top: number }>()
  const metadata = createMemo(() => {
    if (!props.visible || props.diff.summarized || !props.diff.patch) return
    const cacheKey = `${props.diff.file}:${props.diff.stamp ?? ""}:${props.diff.patch}`
    if (!props.diff.rejectable) return processFile(props.diff.patch, { cacheKey })
    return processFile(props.diff.patch, {
      cacheKey,
      oldFile: { name: props.diff.file, contents: props.diff.before },
      newFile: { name: props.diff.file, contents: props.diff.after },
    })
  })
  const targets = createMemo(() => {
    const file = metadata()
    if (!file) return []
    return file.hunks.flatMap((hunk) => {
      const side = hunk.additionCount > 0 ? "additions" : "deletions"
      const line = side === "additions" ? hunk.additionStart : hunk.deletionStart
      const target = sessionHunk(file, props.diff.hunks, line, side)
      return target ? [target] : []
    })
  })
  const blocked = () => props.busy || !props.diff.rejectable || !props.onDecision
  const decide = (action: "accept" | "reject", id: string) => {
    if (blocked() || !targets().some((target) => target.id === id)) return
    props.onDecision?.(action, id)
  }
  createEffect(() => {
    metadata()
    props.diff.hunks
    setHover(undefined)
  })
  const enter: NonNullable<FileDiffOptions<T>["onLineEnter"]> = (event) => {
    props.options.onLineEnter?.(event)
    if (event.numberColumn || (event.lineType !== "change-addition" && event.lineType !== "change-deletion"))
      return setHover(undefined)
    const file = metadata()
    const target = file && sessionHunk(file, props.diff.hunks, event.lineNumber, event.annotationSide)
    if (!target) return setHover(undefined)
    const bounds = container.getBoundingClientRect()
    const root = event.lineElement.getRootNode() as ShadowRoot
    const changed = Array.from(
      root.querySelectorAll<HTMLElement>(
        "[data-code] [data-line-type='change-addition'], [data-code] [data-line-type='change-deletion']",
      ),
    ).filter((row) => {
      const side = row.dataset.lineType === "change-deletion" ? "deletions" : "additions"
      const line = Number(side === "deletions" && row.dataset.altLine != null ? row.dataset.altLine : row.dataset.line)
      return sessionHunk(file, props.diff.hunks, line, side)?.id === target.id
    })
    const bottom = Math.max(
      event.lineElement.getBoundingClientRect().bottom,
      ...changed.map((row) => row.getBoundingClientRect().bottom),
    )
    const top = Math.max(0, bottom - bounds.top + 2)
    setHover({ ...target, top })
  }
  const separators: NonNullable<FileDiffOptions<T>["hunkSeparators"]> = (gap, instance) => {
    mounts.get(gap.slotName)?.()
    return runWithOwner(owner, () =>
      createRoot((dispose) => {
        mounts.set(gap.slotName, dispose)
        return (
          <div class="session-review-gap" data-gap={gap.hunkIndex}>
            <Button
              variant="ghost"
              size="small"
              disabled={!gap.expandable}
              aria-label={props.labels.expandTwenty}
              onClick={() => instance.expandHunk(gap.hunkIndex, gap.expandable?.down ? "down" : "up", 20)}
            >
              {props.labels.hiddenLines(gap.lines)}
            </Button>
            <Show when={gap.expandable}>
              <Button
                variant="ghost"
                size="small"
                onClick={() => instance.expandHunk(gap.hunkIndex, "both", Number.POSITIVE_INFINITY)}
              >
                {props.labels.expandAll}
              </Button>
            </Show>
          </div>
        ) as HTMLElement
      }),
    )
  }
  return (
    <div
      class="session-review-diff"
      ref={container}
      onPointerLeave={() => setHover(undefined)}
      onPointerMove={(event) => {
        const nodes = event.composedPath().filter((node): node is HTMLElement => node instanceof HTMLElement)
        if (nodes.some((node) => node.classList.contains("session-review-hunk-actions"))) return
        if (
          !nodes.some(
            (node) =>
              node.closest("[data-code]") &&
              (node.dataset.lineType === "change-addition" || node.dataset.lineType === "change-deletion"),
          )
        )
          setHover(undefined)
      }}
    >
      <Show when={metadata()} fallback={<div class="session-review-placeholder" />}>
        {(file) => (
          <Diff<T>
            {...props.options}
            before={undefined}
            after={undefined}
            patch={undefined}
            fileDiff={file()}
            visible={props.visible}
            expandUnchanged={props.expanded && !file().isPartial}
            expansionLineCount={20}
            unsafeCSS={`${props.options.unsafeCSS ?? createDefaultOptions<T>(props.options.diffStyle).unsafeCSS}
              [data-separator="custom"] {
                display: contents;
                margin-block: 0;
                padding-block: 0;
                white-space: normal;
              }
            `}
            hunkSeparators={separators}
            onLineEnter={enter}
            onLineLeave={(event) => props.options.onLineLeave?.(event)}
          />
        )}
      </Show>
      <Show when={hover()}>
        {(target) => (
          <div
            class="session-review-hunk-actions"
            role="group"
            data-hunk={target().id}
            style={{ "--session-review-action-top": `${target().top}px` }}
          >
            <Button size="small" variant="secondary" disabled={blocked()} onClick={() => decide("reject", target().id)}>
              {props.labels.undo}
            </Button>
            <Button size="small" variant="primary" disabled={blocked()} onClick={() => decide("accept", target().id)}>
              {props.labels.keep}
            </Button>
          </div>
        )}
      </Show>
      <div class="session-review-keyboard-actions">
        <For each={targets()}>
          {(target) => (
            <div role="group" data-hunk={target.id}>
              <span>{target.index + 1}</span>
              <Button size="small" variant="secondary" disabled={blocked()} onClick={() => decide("reject", target.id)}>
                {props.labels.undo}
              </Button>
              <Button size="small" variant="primary" disabled={blocked()} onClick={() => decide("accept", target.id)}>
                {props.labels.keep}
              </Button>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
