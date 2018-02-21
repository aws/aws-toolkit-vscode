package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.ui.InputValidator
import com.intellij.openapi.ui.Messages
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo

abstract class DeleteResourceAction<in T : AwsExplorerResourceNode<*>> : SingleResourceNodeAction<T>() {
    final override fun actionPerformed(selected: T, e: AnActionEvent?) {
        val resourceName = selected.toString()
        val resourceType = selected.resourceType()
        ApplicationManager.getApplication().invokeLater {
            val response = Messages.showInputDialog(selected.project,
                    "Are you sure you want to delete $resourceType '$resourceName'?\n\nType the $resourceType name below to confirm.",
                    "Delete $resourceType $resourceName",
                    Messages.getWarningIcon(),
                    null,
                    object : InputValidator {
                        override fun checkInput(inputString: String?): Boolean = inputString == resourceName

                        override fun canClose(inputString: String?): Boolean = checkInput(inputString)
                    }
            )

            if (response != null) {
                ApplicationManager.getApplication().executeOnPooledThread {
                    try {
                        performDelete(selected)
                        notifyInfo("Deleted $resourceType '$response'")
                    } catch (e: Exception) {
                        e.notifyError("Failed to delete $resourceType '$response'", selected.project)
                    }
                }
            }
        }
    }

    abstract fun performDelete(selected: T)
}