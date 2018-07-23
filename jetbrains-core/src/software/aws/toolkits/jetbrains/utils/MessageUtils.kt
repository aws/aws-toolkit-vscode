package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.ui.Messages
import software.aws.toolkits.resources.message
import javax.swing.JComponent

class MessageUtils {
    companion object {
        @JvmStatic
        fun verifyLossOfChanges(parent: JComponent): Boolean {
            val result = Messages.showOkCancelDialog(
                    parent,
                    message("uncommitted_changes_dialog.message"),
                    message("uncommitted_changes_dialog.title"),
                    Messages.YES_BUTTON,
                    Messages.CANCEL_BUTTON,
                    Messages.getWarningIcon()
            )

            return result == Messages.OK
        }
    }
}
