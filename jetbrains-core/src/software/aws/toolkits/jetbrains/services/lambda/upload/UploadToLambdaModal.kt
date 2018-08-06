package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.ValidationInfo
import icons.AwsIcons
import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.resources.message
import javax.swing.DefaultComboBoxModel
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JTextField

class UploadToLambdaModal(
    private val project: Project,
    private val runtime: Runtime,
    private val handlerName: String,
    private val validator: UploadToLambdaValidator,
    private val okHandler: (FunctionUploadDetails) -> Unit
) : DialogWrapper(project) {
    private val view = CreateLambdaPanel()

    init {
        super.init()
        title = message("lambda.uploading.title")
    }

    override fun createCenterPanel(): JComponent? {
        val controller =
            UploadToLambdaController(view, handlerName, runtime, AwsClientManager.getInstance(project))
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
                description = view.description.text,
                envVars = view.envVars.envVars
            )
        )
    }
}

class UploadToLambdaValidator {
    fun doValidate(view: CreateLambdaPanel): ValidationInfo? {
        val name = view.name.blankAsNull() ?: return ValidationInfo(
            message("lambda.upload_validation.function_name"),
            view.name
        )
        validateFunctionName(name)?.run { return@doValidate ValidationInfo(this, view.name) }
        view.handler.blankAsNull() ?: return ValidationInfo(message("lambda.upload_validation.handler"), view.handler)
        view.runtime.selected() ?: return ValidationInfo(message("lambda.upload_validation.runtime"), view.runtime)
        view.iamRole.selected() ?: return ValidationInfo(message("lambda.upload_validation.iam_role"), view.iamRole)
        view.sourceBucket.selected() ?: return ValidationInfo(
            message("lambda.upload_validation.source_bucket"),
            view.sourceBucket
        )
        return null
    }

    private fun validateFunctionName(name: String): String? {
        if (!FUNCTION_NAME_PATTERN.matches(name)) {
            return message("lambda.upload_validation.function_name_invalid")
        }
        if (name.length > 64) {
            return message("lambda.upload_validation.function_name_too_long", 64)
        }
        return null
    }

    companion object {
        private val FUNCTION_NAME_PATTERN = "[a-zA-Z0-9-_]+".toRegex()
    }
}

class UploadToLambdaController(
    private val view: CreateLambdaPanel,
    private val handlerName: String,
    private val runtime: Runtime,
    clientManager: AwsClientManager
) {

    private val s3Client: S3Client = clientManager.getClient()
    private val iamClient: IamClient = clientManager.getClient()

    fun load() {
        view.handler.text = handlerName
        view.iamRole.populateValues {
            iamClient.listRoles().roles().filterNotNull()
                .map { IamRole(name = it.roleName(), arn = it.arn()) }
        }
        view.sourceBucket.populateValues { s3Client.listBuckets().buckets().filterNotNull().mapNotNull { it.name() } }
        view.runtime.populateValues(selected = runtime) { Runtime.knownValues().toList().sortedBy { it.name } }

        view.createRole.addActionListener {
            val iamRole = Messages.showInputDialog(
                message("lambda.upload.create_iam_dialog.input"),
                message("lambda.upload.create_iam_dialog.title"),
                AwsIcons.Logos.IAM_LARGE
            )
            iamRole?.run {
                view.iamRole.addAndSelectValue {
                    iamClient.createRole { request -> request.roleName(iamRole) }
                        .let { role -> IamRole(name = role.role().roleName(), arn = role.role().arn()) }
                }
            }
        }

        view.createBucket.addActionListener {
            val bucket = Messages.showInputDialog(
                message("lambda.upload.create_s3_dialog.input"),
                message("lambda.upload.create_s3_dialog.title"),
                AwsIcons.Logos.S3_LARGE
            )
            bucket?.run {
                view.sourceBucket.addAndSelectValue {
                    s3Client.createBucket { request -> request.bucket(bucket) }
                    bucket
                }
            }
        }
    }

    private fun <T> ComboBox<T>.populateValues(block: () -> List<T>) = this.populateValues(null, block)

    private fun <T> ComboBox<T>.populateValues(selected: T?, block: () -> List<T>) {
        ApplicationManager.getApplication().executeOnPooledThread {
            val values = block()
            ApplicationManager.getApplication().invokeLater({
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
            ApplicationManager.getApplication().invokeLater({
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