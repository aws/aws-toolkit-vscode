// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.iam

import com.intellij.json.JsonLanguage
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import org.intellij.lang.annotations.Language
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.iam.model.Role
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.iam.Iam.createRoleWithPolicy
import software.aws.toolkits.jetbrains.utils.ui.formatAndSet
import software.aws.toolkits.resources.message
import java.awt.Component
import javax.swing.JComponent

class CreateIamRoleDialog(
    project: Project,
    private val iamClient: IamClient,
    parent: Component? = null,
    @Language("JSON") defaultPolicyDocument: String,
    @Language("JSON") defaultAssumeRolePolicyDocument: String
) : DialogWrapper(project, parent, false, IdeModalityType.IDE) {

    private val view = CreateRolePanel(project)

    var iamRole: Role? = null

    init {
        title = message("iam.create.role.title")
        setOKButtonText(message("general.create_button"))

        view.policyDocument.formatAndSet(defaultPolicyDocument, JsonLanguage.INSTANCE)
        view.assumeRolePolicyDocument.formatAndSet(defaultAssumeRolePolicyDocument, JsonLanguage.INSTANCE)

        init()
    }

    override fun createCenterPanel(): JComponent? = view.component

    override fun getPreferredFocusedComponent(): JComponent? = view.roleName

    override fun doValidate(): ValidationInfo? {
        if (roleName().isEmpty()) {
            return ValidationInfo(message("iam.create.role.missing.role.name"), view.roleName)
        }

        return null
    }

    override fun doOKAction() {
        if (okAction.isEnabled) {
            setOKButtonText(message("general.create_in_progress"))
            isOKActionEnabled = false

            ApplicationManager.getApplication().executeOnPooledThread {
                try {
                    createIamRole()
                    ApplicationManager.getApplication().invokeLater(
                        {
                            close(OK_EXIT_CODE)
                        },
                        ModalityState.stateForComponent(view.component)
                    )
                } catch (e: Exception) {
                    LOG.warn(e) { "Failed to create IAM role '${roleName()}'" }
                    setErrorText(e.message)
                    setOKButtonText(message("general.create_button"))
                    isOKActionEnabled = true
                }
            }
        }
    }

    private fun roleName() = view.roleName.text.trim()

    private fun policyDocument() = view.policyDocument.text.trim()

    private fun assumeRolePolicy() = view.assumeRolePolicyDocument.text.trim()

    private fun createIamRole() {
        iamRole = iamClient.createRoleWithPolicy(roleName(), assumeRolePolicy(), policyDocument())
    }

    @TestOnly
    internal fun createIamRoleForTesting() {
        createIamRole()
    }

    @TestOnly
    internal fun getViewForTesting(): CreateRolePanel = view

    private companion object {
        val LOG = getLogger<CreateIamRoleDialog>()
    }
}
