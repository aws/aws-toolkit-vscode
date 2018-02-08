package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.ui.InputValidator
import com.intellij.openapi.ui.Messages
import software.aws.toolkits.jetbrains.core.explorer.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo

class LambdaDeleteAction : SingleResourceNodeAction<LambdaFunctionNode>() {

    override fun actionPerformed(selected: LambdaFunctionNode, e: AnActionEvent?) {

        ApplicationManager.getApplication().invokeLater {
            val response = Messages.showInputDialog(selected.project,
                    "Are you sure you want to delete Lambda function '${selected.functionName()}'?\nType the function name below to confirm.",
                    "Delete Lambda ${selected.functionName()}",
                    Messages.getWarningIcon(),
                    null,
                    object : InputValidator {
                        override fun checkInput(inputString: String?): Boolean = inputString == selected.functionName()

                        override fun canClose(inputString: String?): Boolean = checkInput(inputString)
                    }
            )

            if (response != null) {
                ApplicationManager.getApplication().executeOnPooledThread {
                    try {
                        selected.client.deleteFunction { it.functionName(response) }
                        notifyInfo("Deleted AWS Lambda function '$response'")
                    } catch (e: Exception) {
                        e.notifyError("Failed to delete AWS Lambda function '$response'", selected.project)
                    }
                    //TODO: Figure out how to refresh the tree
                }
            }
        }

    }
}