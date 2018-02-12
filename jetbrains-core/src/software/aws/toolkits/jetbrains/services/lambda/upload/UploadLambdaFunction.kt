package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.notification.NotificationListener
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.psi.PsiElement
import software.amazon.awssdk.services.s3.model.Bucket
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackagerProvider
import software.aws.toolkits.jetbrains.services.lambda.LambdaVirtualFile
import software.aws.toolkits.jetbrains.utils.notifyInfo

class UploadLambdaFunction(private val handlerName: String, private val element: PsiElement) : AnAction() {

    override fun update(e: AnActionEvent?) {
        e?.presentation?.isEnabledAndVisible =
                e?.getData(LangDataKeys.PSI_FILE)?.language?.let { LambdaPackagerProvider.supportedLanguages().contains(it) } == true
    }

    override fun actionPerformed(event: AnActionEvent?) {
        val module = event?.getData(LangDataKeys.MODULE) ?: return
        val psiFile = event.getData(LangDataKeys.PSI_FILE) ?: return
        val project = module.project

        val uploadModal = UploadToLambdaModal(project, element.containingFile, handlerName) { functionDetails ->
            LambdaCreatorFactory.create(AwsClientManager.getInstance(project), element.language).createLambda(functionDetails, module, psiFile) {
                val notificationListener = NotificationListener { _, _ ->
                    val editorManager = FileEditorManager.getInstance(project)
                    val lambdaVirtualFile = LambdaVirtualFile(it)
                    editorManager.openFile(lambdaVirtualFile, true)
                }
                notifyInfo(
                        "<a href=\"$it\">AWS Lambda function '${functionDetails.name}' created</a>.",
                        listener = notificationListener,
                        project = event.project
                )
            }
        }
        uploadModal.show()
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