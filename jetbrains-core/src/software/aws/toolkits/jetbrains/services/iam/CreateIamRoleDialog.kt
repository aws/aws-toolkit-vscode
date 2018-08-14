package software.aws.toolkits.jetbrains.services.iam

import com.intellij.json.JsonLanguage
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.command.CommandProcessor
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.psi.codeStyle.CodeStyleManager
import com.intellij.psi.codeStyle.LanguageCodeStyleSettingsProvider
import com.intellij.ui.EditorTextField
import org.intellij.lang.annotations.Language
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.services.iam.IamClient
import software.aws.toolkits.jetbrains.services.lambda.upload.IamRole
import software.aws.toolkits.resources.message
import java.awt.Component
import javax.swing.JComponent

class CreateIamRoleDialog(
    private val project: Project,
    private val iamClient: IamClient,
    private val parent: Component? = null,
    @Language("JSON") defaultPolicyDocument: String,
    @Language("JSON") defaultAssumeRolePolicyDocument: String
) : DialogWrapper(project, parent, false, IdeModalityType.PROJECT) {

    private val view = CreateRolePanel(project)

    var iamRole: IamRole? = null
        private set

    init {
        title = message("iam.create.role.title")
        setOKButtonText(message("iam.create.role.create"))

        formatDocument(defaultPolicyDocument, view.policyDocument)
        formatDocument(defaultAssumeRolePolicyDocument, view.assumeRolePolicyDocument)

        init()
    }

    private fun formatDocument(jsonDocument: String, editor: EditorTextField) {
        // Initial docs can't be undo'ed
        CommandProcessor.getInstance().runUndoTransparentAction {
            runWriteAction {
                val formatted =
                    LanguageCodeStyleSettingsProvider.createFileFromText(
                        JsonLanguage.INSTANCE,
                        project,
                        jsonDocument
                    )?.let {
                        CodeStyleManager.getInstance(project).reformat(it)
                        it.text
                    } ?: jsonDocument

                val document = editor.document
                document.replaceString(0, document.textLength, formatted)
            }
        }
    }

    override fun createCenterPanel(): JComponent? {
        return view.component
    }

    override fun getPreferredFocusedComponent(): JComponent? {
        return view.roleName
    }

    override fun doValidate(): ValidationInfo? {
        if (roleName().isEmpty()) {
            return ValidationInfo(message("iam.create.role.missing.role.name"), view.roleName)
        }

        return null
    }

    override fun doOKAction() {
        if (okAction.isEnabled) {
            setOKButtonText(message("iam.create.role.in_progress"))
            isOKActionEnabled = false

            ApplicationManager.getApplication().executeOnPooledThread {
                try {
                    createIamRole(roleName(), policyDocument(), assumeRolePolicy())
                    ApplicationManager.getApplication().invokeLater({
                        close(OK_EXIT_CODE)
                    }, ModalityState.stateForComponent(view.component))
                } catch (e: Exception) {
                    setErrorText(e.message)
                    setOKButtonText(message("iam.create.role.create"))
                    isOKActionEnabled = true
                }
            }
        }
    }

    private fun roleName() = view.roleName.text.trim()

    private fun policyDocument() = view.policyDocument.text.trim()

    private fun assumeRolePolicy() = view.assumeRolePolicyDocument.text.trim()

    private fun createIamRole(roleName: String, policy: String, assumeRolePolicy: String) {
        val role = iamClient.createRole {
            it.roleName(roleName)
            it.assumeRolePolicyDocument(assumeRolePolicy)
        }.role()

        try {
            iamClient.putRolePolicy {
                it.roleName(roleName)
                    .policyName(roleName)
                    .policyDocument(policy)
            }
        } catch (exception: Exception) {
            try {
                iamClient.deleteRole {
                    it.roleName(role.roleName())
                }
            } catch (deleteException: Exception) {
                LOGGER.warn("Failed to delete IAM role $roleName", deleteException)
            }
            throw exception
        }

        iamRole = IamRole(name = role.roleName(), arn = role.arn())
    }

    @TestOnly
    fun createIamRoleForTesting() {
        createIamRole(roleName(), policyDocument(), assumeRolePolicy())
    }

    @TestOnly
    fun getViewForTesting(): CreateRolePanel {
        return view
    }

    private companion object {
        val LOGGER = Logger.getInstance(CreateIamRoleDialog::class.java)
    }
}