// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.datagrip.actions

import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.progress.PerformInBackgroundOption
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task.Backgroundable
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.ui.SimpleListCellRenderer
import software.amazon.awssdk.services.secretsmanager.model.SecretListEntry
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.datagrip.DatabaseSecret
import software.aws.toolkits.jetbrains.datagrip.auth.SecretsManagerDbSecret
import software.aws.toolkits.jetbrains.services.secretsmanager.SecretsManagerResources
import software.aws.toolkits.jetbrains.services.secretsmanager.arnToName
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import javax.swing.JComponent
import javax.swing.JPanel

class SecretsManagerDialogWrapper(private val selected: AwsExplorerNode<*>) : DialogWrapper(selected.nodeProject) {
    private lateinit var secrets: ResourceSelector<SecretListEntry>
    lateinit var dbSecret: SecretsManagerDbSecret
        private set
    lateinit var dbSecretArn: String
        private set

    init {
        title = message("datagrip.secretsmanager.action.title")
        setOKButtonText(message("general.select_button"))
        init()
    }

    override fun createCenterPanel(): JComponent? {
        secrets = ResourceSelector.builder()
            .resource(SecretsManagerResources.secrets)
            .customRenderer(SimpleListCellRenderer.create("") { it.name() })
            .awsConnection(selected.nodeProject)
            .build().also {
                // When it is changed, make sure the OK button is re-enabled
                it.addActionListener {
                    isOKActionEnabled = true
                }
            }
        val panel = JPanel(BorderLayout())
        panel.add(secrets)
        return panel
    }

    override fun doOKAction() {
        if (!okAction.isEnabled) {
            return
        }
        object : Backgroundable(
            selected.nodeProject,
            message("datagrip.secretsmanager.validating"),
            false,
            PerformInBackgroundOption.ALWAYS_BACKGROUND
        ) {
            override fun run(indicator: ProgressIndicator) {
                try {
                    validateConfiguration()
                } catch (e: Exception) {
                    notifyError(
                        project = selected.nodeProject,
                        title = message("datagrip.secretsmanager.validation.exception"),
                        content = e.message ?: e.toString()
                    )
                }
            }
        }.queue()
    }

    private fun validateConfiguration() {
        val selectedSecret = secrets.selected()
        val response = DatabaseSecret.getSecret(selected.nodeProject, selectedSecret)
        if (response == null) {
            runInEdt(ModalityState.any()) {
                super.doCancelAction()
                notifyError(content = message("datagrip.secretsmanager.validation.failed_to_get", selectedSecret?.arn().toString()))
            }
            return
        }
        // Cache content and arn so we don't have to retrieve them again
        dbSecret = response.first
        dbSecretArn = response.second
        // validate the content of the secret
        val validationInfo = DatabaseSecret.validateSecret(selected, response.first, response.second.arnToName())

        runInEdt(ModalityState.any()) {
            if (validationInfo == null) {
                super.doOKAction()
            } else {
                val result = Messages.showOkCancelDialog(
                    selected.nodeProject,
                    message("datagrip.secretsmanager.action.confirm_continue", validationInfo.message),
                    message("datagrip.secretsmanager.action.confirm_continue_title"),
                    Messages.getOkButton(),
                    Messages.getCancelButton(),
                    Messages.getWarningIcon()
                )
                if (result == Messages.OK) {
                    super.doOKAction()
                }
            }
        }
    }
}
