package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.notification.NotificationListener
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.module.Module
import com.intellij.psi.PsiFile
import icons.AwsIcons
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackagerProvider
import software.aws.toolkits.jetbrains.services.lambda.LambdaVirtualFile
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message

class UploadLambdaFunction(private val handlerName: String) : AnAction(message("lambda.create_new"), null, AwsIcons.Actions.LAMBDA_FUNCTION_NEW) {

    override fun update(e: AnActionEvent?) {
        e?.presentation?.isEnabledAndVisible =
                e?.getData(LangDataKeys.PSI_FILE)?.language?.let { LambdaPackagerProvider.supportedLanguages().contains(it) } == true
    }

    override fun actionPerformed(event: AnActionEvent?) {
        val module = event?.getData(LangDataKeys.MODULE) ?: return
        val psiFile = event.getData(LangDataKeys.PSI_FILE) ?: return
        val project = module.project

        val packager = LambdaPackagerProvider.getInstance(psiFile.language)
        val lambdaCreator = LambdaCreatorFactory.create(AwsClientManager.getInstance(project), packager)
        UploadToLambdaModal(project,
            packager.determineRuntime(module, psiFile),
            handlerName,
            UploadToLambdaValidator()
        ) { performUpload(module, psiFile, lambdaCreator, it) }.show()
    }

    private fun performUpload(module: Module, psiFile: PsiFile, creator: LambdaCreator, functionDetails: FunctionUploadDetails) {
        creator.createLambda(functionDetails, module, psiFile)
                .whenComplete { function, error ->
                    when {
                        function != null -> {
                            val notificationListener = NotificationListener { _, _ ->
                                val editorManager = FileEditorManager.getInstance(module.project)
                                val lambdaVirtualFile = LambdaVirtualFile(function)
                                editorManager.openFile(lambdaVirtualFile, true)
                            }
                            notifyInfo(
                                    message("lambda.function_created.notification", "<a href=\"$function\">${functionDetails.name}</a>"),
                                    listener = notificationListener,
                                    project = module.project
                            )
                        }
                        error is Exception -> error.notifyError(title = "")
                    }
                }
    }
}

data class FunctionUploadDetails(
    val name: String,
    val handler: String,
    val iamRole: IamRole,
    val s3Bucket: String,
    val runtime: Runtime,
    val description: String?,
    val envVars: Map<String, String>
)

data class IamRole(val name: String, val arn: String) {
    override fun toString(): String {
        return name
    }
}