package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.codeInsight.actions.FileInEditorProcessor
import com.intellij.codeInsight.actions.LastRunReformatCodeOptionsProvider
import com.intellij.codeInsight.actions.TextRangeType
import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.fileTypes.ex.FakeFileType
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiDocumentManager
import com.intellij.testFramework.LightVirtualFile
import com.intellij.ui.EditorTextField
import com.intellij.util.io.decodeBase64
import com.intellij.util.io.toByteArray
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.CreateFunctionResponse
import software.amazon.awssdk.services.lambda.model.FunctionConfiguration
import software.amazon.awssdk.services.lambda.model.InvocationType
import software.amazon.awssdk.services.lambda.model.LambdaException
import software.amazon.awssdk.services.lambda.model.LogType
import software.aws.toolkits.jetbrains.core.Icons.Services.LAMBDA_FUNCTION_ICON
import software.aws.toolkits.jetbrains.utils.filesystem.LightFileEditor
import java.nio.charset.StandardCharsets
import javax.swing.DefaultComboBoxModel
import javax.swing.Icon
import javax.swing.JComponent

class LambdaEditor(private val project: Project, private val model: LambdaVirtualFile) : LightFileEditor() {
    private val view = LambdaEditorPanel(project)

    init {
        view.title.text = "Function: ${model.function.name}"
        view.lastModified.text = model.function.lastModified
        view.handler.text = model.function.handler
        view.arn.text = model.function.arn
        view.invoke.addActionListener { invokeFunction() }
        view.exampleRequests.model = DefaultComboBoxModel(
                arrayOf(
                        LambdaInputSample("First Sample", """{"hello":"world"}"""),
                        LambdaInputSample("Second sample", """["hello"]""")
                )
        )
        view.exampleRequests.selectedItem = null
        view.exampleRequests.addActionListener {
            (view.exampleRequests.selectedItem as? LambdaInputSample)?.run {
                view.input.text = this.content
                formatEditor(view.input)
            }
        }
    }

    private fun invokeFunction() {
        view.setBusy(true)

        makeRequest { response, log ->
            ApplicationManager.getApplication().invokeLater {
                view.response.text = response
                view.logOutput.text = log
                formatEditor(view.response)
                view.setBusy(false)
            }
        }
    }

    private fun makeRequest(block: (String?, String?) -> Unit) {
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val resp = model.lambdaClient.invoke {
                    it.functionName(model.function.name).invocationType(InvocationType.REQUEST_RESPONSE).logType(LogType.TAIL)
                            .payload(view.input.text)
                }
                block(resp.payload()?.toByteArray()?.toString(StandardCharsets.UTF_8), resp.logResult()?.decodeBase64()?.toString(StandardCharsets.UTF_8))
            } catch (e: LambdaException) {
                block("", e.message)
            }
        }
    }

    private fun formatEditor(textField: EditorTextField) {
        PsiDocumentManager.getInstance(project).getPsiFile(textField.document)?.run {
            val provider = LastRunReformatCodeOptionsProvider(PropertiesComponent.getInstance())
            val currentRunOptions = provider.getLastRunOptions(this)
            currentRunOptions.setProcessingScope(TextRangeType.WHOLE_FILE)
            FileInEditorProcessor(this, null, currentRunOptions).processCode()
        }
    }

    override fun getName(): String = "Lambda Viewer"

    override fun getComponent(): JComponent = view.contentPanel
}

class LambdaViewerProvider() : FileEditorProvider {
    override fun getEditorTypeId(): String = "lambdaInvoker"
    override fun accept(project: Project, file: VirtualFile): Boolean = file is LambdaVirtualFile
    override fun createEditor(project: Project, file: VirtualFile): FileEditor =
            LambdaEditor(project, file as LambdaVirtualFile)

    override fun getPolicy(): FileEditorPolicy = FileEditorPolicy.HIDE_DEFAULT_EDITOR
}

class LambdaVirtualFile(internal val lambdaClient: LambdaClient, internal val function: LambdaFunction) : LightVirtualFile(function.name) {
    init {
        fileType = LambdaFileType()
    }
}

data class LambdaFunction(val name: String, val arn: String, val lastModified: String, val handler: String)

fun FunctionConfiguration.toDataClass() = LambdaFunction(
        name = this.functionName(),
        arn = this.functionArn(),
        lastModified = this.lastModified(),
        handler = this.handler()
)

fun CreateFunctionResponse.toDataClass() = LambdaFunction(
        name = this.functionName(),
        arn = this.functionArn(),
        lastModified = this.lastModified(),
        handler = this.handler()
)

data class LambdaInputSample(val name: String, val content: String) {
    override fun toString() = name
}

class LambdaFileType : FakeFileType() {
    override fun getName(): String = "AWS Lambda"
    override fun getIcon(): Icon? = LAMBDA_FUNCTION_ICON
    override fun getDescription(): String = "AWS Lambda"
    override fun isMyFileType(file: VirtualFile): Boolean = file is LambdaVirtualFile
}