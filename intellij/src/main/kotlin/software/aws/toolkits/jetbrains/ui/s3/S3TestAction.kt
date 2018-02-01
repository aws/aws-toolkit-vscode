package software.aws.toolkits.jetbrains.ui.s3

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.ui.Messages
import software.aws.toolkits.jetbrains.ui.explorer.ExplorerDataKeys


class S3TestAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val data = e.getData(ExplorerDataKeys.SELECTED_RESOURCE_NODES)
        if (data != null) {
            data.forEach {
                ApplicationManager.getApplication().invokeLater {
                    Messages.showInfoMessage("Bucket ${it.value} selected", "Test")
                }
            }
            return
        }

        val data2 = e.getData(ExplorerDataKeys.SELECTED_SERVICE_NODE)
        if (data2 != null) {
            ApplicationManager.getApplication().invokeLater {
                Messages.showInfoMessage("Service ${data2.value} selected", "Test")
            }
            return
        }
    }
}