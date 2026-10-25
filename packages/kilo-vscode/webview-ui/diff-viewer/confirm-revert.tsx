import { Button } from "@kilocode/kilo-ui/button"
import { Dialog } from "@kilocode/kilo-ui/dialog"
import { useDialog } from "@kilocode/kilo-ui/context/dialog"
import { useLanguage } from "../src/context/language"
import type { WorktreeFileDiff } from "../src/types/messages"

export function createRevertConfirmation(props: {
  sessionKey?: string
  diffs: WorktreeFileDiff[]
  canRevert?: boolean
  active?: boolean
  revision?: string
  onRevertFile?: (file: string) => void
}) {
  const dialog = useDialog()
  const { t } = useLanguage()
  return (file: string) => {
    const key = props.sessionKey
    const sourceRevision = props.revision
    const diff = props.diffs.find((item) => item.file === file)
    const callback = props.onRevertFile
    if (!diff || !callback || props.canRevert === false) return
    const diffRevision = JSON.stringify([diff.stamp, diff.before, diff.after, diff.patch])
    const valid = () => {
      const current = props.diffs.find((item) => item.file === file)
      return (
        props.active !== false &&
        props.canRevert !== false &&
        key === props.sessionKey &&
        sourceRevision === props.revision &&
        !!current &&
        JSON.stringify([current.stamp, current.before, current.after, current.patch]) === diffRevision
      )
    }
    dialog.show(() => (
      <Dialog title={t("review.revertTitle")} fit>
        <div class="dialog-confirm-body">
          <span>{t("review.revertWarning", { file })}</span>
          <div class="dialog-confirm-actions">
            <Button variant="secondary" onClick={() => dialog.close()}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={!valid()}
              onClick={() => {
                if (!valid()) return
                dialog.close()
                callback(file)
              }}
            >
              {t("agentManager.diff.revertFile")}
            </Button>
          </div>
        </div>
      </Dialog>
    ))
  }
}
