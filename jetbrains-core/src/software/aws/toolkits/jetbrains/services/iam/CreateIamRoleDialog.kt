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
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.utils.ui.formatAndSet
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
            setOKButtonText(message("iam.create.role.in_progress"))
            isOKActionEnabled = false

            ApplicationManager.getApplication().executeOnPooledThread {
                try {
                    createIamRole(roleName(), policyDocument(), assumeRolePolicy())
                    ApplicationManager.getApplication().invokeLater({
                        close(OK_EXIT_CODE)
                    }, ModalityState.stateForComponent(view.component))
                } catch (e: Exception) {
                    LOG.warn(e) { "Failed to create IAM role '${roleName()}'" }
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
                LOG.warn(deleteException) { "Failed to delete IAM role $roleName" }
            }
            throw exception
        }

        iamRole = IamRole(role.arn())
    }

    @TestOnly
    internal fun createIamRoleForTesting() {
        createIamRole(roleName(), policyDocument(), assumeRolePolicy())
    }

    @TestOnly
    internal fun getViewForTesting(): CreateRolePanel = view

    private companion object {
        val LOG = getLogger<CreateIamRoleDialog>()
    }
}
