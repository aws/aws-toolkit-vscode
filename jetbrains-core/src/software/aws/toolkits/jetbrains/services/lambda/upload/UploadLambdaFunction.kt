package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.notification.NotificationListener
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.psi.PsiElement
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.s3.model.Bucket
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.Icons
import software.aws.toolkits.jetbrains.core.Icons.Services.LAMBDA_NEW_FUNCTION
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackagerProvider
import software.aws.toolkits.jetbrains.services.lambda.LambdaVirtualFile
import software.aws.toolkits.jetbrains.utils.notifyInfo

class UploadLambdaFunction(private val handlerName: String, private val element: PsiElement) : AnAction("Create new AWS Lambda...", null, LAMBDA_NEW_FUNCTION) {

    override fun update(e: AnActionEvent?) {
        e?.presentation?.isEnabledAndVisible =
                e?.getData(LangDataKeys.PSI_FILE)?.language?.let { LambdaPackagerProvider.supportedLanguages().contains(it) } == true
    }

    override fun actionPerformed(event: AnActionEvent?) {
        val module = event?.getData(LangDataKeys.MODULE) ?: return
        val psiFile = event.getData(LangDataKeys.PSI_FILE) ?: return
        val project = module.project

        val packager = LambdaPackagerProvider.getInstance(psiFile.language)
        val uploadModal = UploadToLambdaModal(project, psiFile, packager.determineRuntime(module, psiFile), handlerName, UploadToLambdaValidator()) { functionDetails ->
            LambdaCreatorFactory.create(AwsClientManager.getInstance(project), packager).createLambda(functionDetails, module, psiFile) {
                val notificationListener = NotificationListener { _, _ ->
                    val editorManager = FileEditorManager.getInstance(project)
                    val lambdaVirtualFile = LambdaVirtualFile(it)
                    editorManager.openFile(lambdaVirtualFile, true)
                }
                notifyInfo(
                        "AWS Lambda function '<a href=\"$it\">${functionDetails.name}</a>' created.",
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
    val s3Bucket: String,
    val runtime: Runtime,
    val description: String?
)

data class IamRole(val name: String, val arn: String) {
    override fun toString(): String {
        return name
    }
}