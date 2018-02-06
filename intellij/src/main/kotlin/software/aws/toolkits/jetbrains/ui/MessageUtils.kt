package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.ui.Messages
import javax.swing.JComponent

class MessageUtils {
    companion object {
        @JvmStatic
        fun verifyLossOfChanges(parent: JComponent): Boolean {
            val result = Messages.showOkCancelDialog(
                    parent,
                    "You have uncommitted changes, this will erase those changes. Continue?",
                    "Confirm?",
                    Messages.YES_BUTTON,
                    Messages.CANCEL_BUTTON,
                    Messages.getWarningIcon()
            )

            return result == Messages.OK
        }
    }
}
