package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.psi.PsiFile
import software.amazon.awssdk.services.iam.IAMClient
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.Icons
import java.util.regex.Pattern
import javax.swing.DefaultComboBoxModel
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JTextField

class UploadToLambdaModal(
    private val project: Project,
    private val psi: PsiFile,
    private val runtime: Runtime,
    private val handlerName: String,
    private val validator: UploadToLambdaValidator,
    private val okHandler: (FunctionUploadDetails) -> Unit
) : DialogWrapper(project) {
    private val view = CreateLambdaPanel()

    init {
        super.init()
        title = "Uploading to Lambda"
    }

    override fun createCenterPanel(): JComponent? {
        val controller = UploadToLambdaController(view, psi, handlerName, runtime, AwsClientManager.getInstance(project))
        controller.load()
        return view.content
    }

    override fun doValidate(): ValidationInfo? = validator.doValidate(view)

    override fun doOKAction() {
        super.doOKAction()
        okHandler(
                FunctionUploadDetails(
                        name = view.name.text!!,
                        handler = view.handler.text!!,
                        iamRole = view.iamRole.selected()!!,
                        s3Bucket = view.sourceBucket.selected()!!,
                        runtime = view.runtime.selected()!!,
                        description = view.description.text
                )
        )
    }
}

class UploadToLambdaValidator {
    fun doValidate(view: CreateLambdaPanel): ValidationInfo? {
        val name = view.name.blankAsNull() ?: return ValidationInfo("Function Name must be specified", view.name)
        validateFunctionName(name)?.run { return@doValidate ValidationInfo(this, view.name) }
        view.handler.blankAsNull() ?: return ValidationInfo("Handler must be specified", view.handler)
        view.runtime.selected() ?: return ValidationInfo("Runtime must be specified", view.runtime)
        view.iamRole.selected() ?: return ValidationInfo("IAM role must be specified", view.iamRole)
        view.sourceBucket.selected() ?: return ValidationInfo("Bucket must be specified", view.sourceBucket)
        return null
    }


    private fun validateFunctionName(name: String): String? {
        if (!FUNCTION_NAME_PATTERN.matches(name)) {
            return "Function names can only contain alphanumerics, hyphen (-) and underscore (_)"
        }
        if (name.length > 64) {
            return "Function names must not exceed 64 characters in length"
        }
        return null
    }

    companion object {
        private val FUNCTION_NAME_PATTERN = "[a-zA-Z0-9-_]+".toRegex()
    }
}

class UploadToLambdaController(
    private val view: CreateLambdaPanel,
    private val psi: PsiFile,
    private val handlerName: String,
    private val runtime: Runtime,
    clientManager: AwsClientManager
) {

    private val s3Client: S3Client = clientManager.getClient()
    private val iamClient: IAMClient = clientManager.getClient()

    fun load() {
        view.handler.text = handlerName
        view.iamRole.populateValues {
            iamClient.listRoles().roles().filterNotNull()
                    .map { IamRole(name = it.roleName(), arn = it.arn()) }
        }
        view.sourceBucket.populateValues { s3Client.listBuckets().buckets().filterNotNull().mapNotNull { it.name() } }
        view.runtime.populateValues(selected = runtime) { Runtime.knownValues().toList().sortedBy { it.name } }

        view.createRole.addActionListener {
            val iamRole = Messages.showInputDialog("Role Name:", "Create IAM Role", Icons.AWS_ICON)
            iamRole?.run {
                view.iamRole.addAndSelectValue {
                    iamClient.createRole { it.roleName(iamRole) }.let { IamRole(name = it.role().roleName(), arn = it.role().arn()) }
                }
            }
        }

        view.createBucket.addActionListener {
            val bucket = Messages.showInputDialog("S3 Bucket Name:", "Create S3 Bucket", Icons.Services.S3_SERVICE_ICON)
            bucket?.run {
                view.sourceBucket.addAndSelectValue {
                    s3Client.createBucket { it.bucket(bucket) }
                    bucket
                }
            }
        }
    }

    private fun <T> ComboBox<T>.populateValues(block: () -> List<T>) = this.populateValues(null, block)

    private fun <T> ComboBox<T>.populateValues(selected: T?, block: () -> List<T>) {
        ApplicationManager.getApplication().executeOnPooledThread {
            val values = block()
            ApplicationManager.getApplication().invokeLater ({
                val model = this.model as DefaultComboBoxModel<T>
                model.removeAllElements()
                values.forEach { model.addElement(it) }
                this.selectedItem = selected
                this.isEnabled = values.isNotEmpty()
            }, ModalityState.any())
        }
    }

    private fun <T> ComboBox<T>.addAndSelectValue(fetch: () -> T) {
        ApplicationManager.getApplication().executeOnPooledThread {
            val value = fetch()
            ApplicationManager.getApplication().invokeLater ({
                val model = this.model as DefaultComboBoxModel<T>
                model.addElement(value)
                model.selectedItem = value
            }, ModalityState.any())
        }
    }
}

private fun JTextField?.blankAsNull(): String? = if (this?.text?.isNotBlank() == true) {
    this.text
} else {
    null
}

@Suppress("UNCHECKED_CAST")
private fun <T> JComboBox<T>?.selected(): T? = this?.selectedItem as? T