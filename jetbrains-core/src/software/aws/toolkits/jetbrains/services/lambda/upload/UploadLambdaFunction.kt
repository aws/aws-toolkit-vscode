package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.notification.Notification
import com.intellij.notification.NotificationListener
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.fileEditor.FileEditorManager
import software.amazon.awssdk.services.s3.model.Bucket
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackagerProvider
import software.aws.toolkits.jetbrains.services.lambda.LambdaVirtualFile

class UploadLambdaFunction : AnAction() {

    override fun update(e: AnActionEvent?) {
        e?.presentation?.isEnabledAndVisible = e?.getData(LangDataKeys.PSI_FILE)?.language?.let { LambdaPackagerProvider.supportedLanguages().contains(it) } == true
    }

    override fun actionPerformed(event: AnActionEvent?) {
        if (event == null) return
        val project = event.project ?: return
        val psi = event.getData(LangDataKeys.PSI_FILE)
        if (psi == null) {
            handleError("Couldn't determine language")
            return
        }

        val uploadModal = UploadToLambdaModal(project, psi) { functionDetails ->
            LambdaCreatorFactory.create(AwsClientManager.getInstance(project), psi.language).createLambda(functionDetails, project) {
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

data class FunctionUploadDetails(
    val name: String,
    val handler: String,
    val iamRole: IamRole,
    val s3Bucket: Bucket,
    val description: String?
)

data class IamRole(val name: String, val arn: String) {
    override fun toString(): String {
        return name
    }
}