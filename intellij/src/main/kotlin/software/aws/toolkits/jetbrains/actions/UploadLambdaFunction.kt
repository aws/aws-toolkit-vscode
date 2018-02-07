package software.aws.toolkits.jetbrains.actions

import com.intellij.lang.java.JavaLanguage
import com.intellij.notification.Notification
import com.intellij.notification.NotificationListener
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.fileEditor.FileEditorManager
import software.aws.toolkits.jetbrains.aws.lambda.LambdaCreatorFactory
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.ui.lambda.LambdaVirtualFile
import software.aws.toolkits.jetbrains.ui.modals.UploadToLambdaModal

class UploadLambdaFunction : AnAction() {

    override fun update(e: AnActionEvent?) {
        e?.presentation?.isEnabledAndVisible = e?.getData(LangDataKeys.PSI_FILE)?.language?.`is`(JavaLanguage.INSTANCE) == true
    }

    override fun actionPerformed(event: AnActionEvent?) {
        if (event == null) return
        val project = event.project ?: return
        val psi = event.getData(LangDataKeys.PSI_FILE)
        if (psi == null) {
            handleError("Couldn't determine language")
            return
        }

        if (!psi.language.`is`(JavaLanguage.INSTANCE)) {
            handleError("Invalid language, only Java supported at present, language detected as '${psi.language}'")
            return
        }

        val uploadModal = UploadToLambdaModal(project, psi) { functionDetails ->
            LambdaCreatorFactory.create(AwsClientManager.getInstance(project)).createLambda(functionDetails, project) {
                val notificationListener = NotificationListener { _, _ ->
                    val editorManager = FileEditorManager.getInstance(project)
                    val lambdaVirtualFile = LambdaVirtualFile(AwsClientManager.getInstance(project).getClient(), it)
                    editorManager.openFile(lambdaVirtualFile, true)
                }
                Notifications.Bus.notify(
                        Notification(
                                "AWS Toolkit",
                                "AWS Lambda Created",
                                "${functionDetails.name} created <a href=\"$it\">open it</a>",
                                NotificationType.INFORMATION,
                                notificationListener
                        )
                )
            }
        }
        uploadModal.show()
    }

    private fun handleError(msg: String) {
        Notifications.Bus.notify(Notification("AWS Tookit", "Upload Lambda Failed", msg, NotificationType.ERROR))
    }
}