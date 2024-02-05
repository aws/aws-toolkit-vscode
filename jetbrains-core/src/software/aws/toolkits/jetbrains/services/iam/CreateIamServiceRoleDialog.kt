// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.iam

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.columns
import com.intellij.ui.dsl.builder.panel
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import software.amazon.awssdk.services.iam.IamClient
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.resources.message
import java.awt.Component
import javax.swing.JComponent
import kotlin.math.max

class CreateIamServiceRoleDialog(
    project: Project,
    private val iamClient: IamClient,
    private val serviceUri: String,
    private val managedPolicyName: String,
    name: String = "",
    parent: Component? = null,
) : DialogWrapper(project, parent, false, IdeModalityType.IDE) {
    private val coroutineScope = projectCoroutineScope(project)
    var name: String = name
        private set
    internal val view = panel {
        // make the width the widest string. Columns don't map entirely to text width (since text is variable width) but it looks better
        val size = max(serviceUri.length, managedPolicyName.length)
        row(message("iam.create.role.name.label")) {
            textField().bindText(::name).columns(size).errorOnApply(message("iam.create.role.missing.role.name")) { it.text.isNullOrBlank() }
        }
        row(message("iam.create.role.managed_policies")) {
            textField().bindText({ managedPolicyName }, {}).columns(size).apply { component.isEditable = false }
        }
        row(message("iam.create.role.trust.editor.name")) {
            textField().bindText({ serviceUri }, {}).columns(size).apply { component.isEditable = false }
        }
    }

    init {
        title = message("iam.create.role.title")
        setOKButtonText(message("general.create_button"))

        init()
    }

    override fun createCenterPanel(): JComponent = view

    override fun doOKAction() {
        if (!okAction.isEnabled) {
            return
        }
        setOKButtonText(message("general.create_in_progress"))
        isOKActionEnabled = false
        view.apply()

        coroutineScope.launch {
            try {
                createIamRole()
                runBlocking(getCoroutineUiContext()) {
                    close(OK_EXIT_CODE)
                }
            } catch (e: Exception) {
                LOG.warn(e) { "Failed to create IAM role '$name'" }
                setErrorText(e.message)
                setOKButtonText(message("general.create_button"))
                isOKActionEnabled = true
            }
        }
    }

    internal fun createIamRole() {
        val role = iamClient.createRole { it.roleName(name).assumeRolePolicyDocument(assumeRolePolicy(serviceUri)) }.role()
        try {
            iamClient.attachRolePolicy { it.roleName(role.roleName()).policyArn(managedPolicyNameToArn(managedPolicyName)) }
        } catch (exception: Exception) {
            try {
                iamClient.deleteRole {
                    it.roleName(role.roleName())
                }
            } catch (deleteException: Exception) {
                LOG.warn(deleteException) { "Failed to delete IAM role ${role.roleName()}" }
            }
            throw exception
        }
    }

    private companion object {
        private val LOG = getLogger<CreateIamServiceRoleDialog>()
    }
}
