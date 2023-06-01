// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.welcomescreen

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.ui.DialogBuilder
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.setEmptyState
import com.intellij.ui.components.JBLoadingPanel
import com.intellij.ui.dsl.builder.COLUMNS_SHORT
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.columns
import com.intellij.ui.dsl.builder.panel
import software.amazon.awssdk.services.codecatalyst.CodeCatalystClient
import software.amazon.awssdk.services.codecatalyst.model.InstanceType
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.credentials.sono.lazilyGetUserId
import software.aws.toolkits.jetbrains.gateway.GatewayProduct
import software.aws.toolkits.jetbrains.gateway.Workspace
import software.aws.toolkits.jetbrains.gateway.cawsEnvironmentSize
import software.aws.toolkits.jetbrains.gateway.cawsEnvironmentTimeout
import software.aws.toolkits.jetbrains.gateway.ideVersionComboBox
import software.aws.toolkits.jetbrains.services.caws.InactivityTimeout
import software.aws.toolkits.jetbrains.services.caws.loadParameterDescriptions
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodecatalystTelemetry
import software.aws.toolkits.telemetry.CodecatalystUpdateDevEnvironmentLocationType
import java.awt.BorderLayout
import software.aws.toolkits.telemetry.Result as TelemetryResult

class WorkspaceConfigurationDialog private constructor(cawsClient: CodeCatalystClient, isFreeTier: Boolean, ws: Workspace, disposable: Disposable) :
    JBLoadingPanel(BorderLayout(), disposable) {
    val context = ReconfigureWorkspaceSettings(ws)
    val panel = panel {

        row(message("caws.workspace.details.alias.label")) {
            textField()
                .bindText(context::alias)
                .columns(COLUMNS_SHORT)
                .applyToComponent {
                    setEmptyState(message("general.optional"))
                }
        }

        row(message("caws.workspace.ide_label")) {
            ideVersionComboBox(disposable, context::gatewayProduct)
        }

        group(message("caws.workspace.settings"), indent = false) {
            if (isFreeTier) {
                row {
                    comment(message("caws.compute.size.in.free.tier.comment"))
                }
            }
            cawsEnvironmentSize(
                loadParameterDescriptions().environmentParameters,
                context::instanceType,
                isFreeTier
            )

            row {
                cawsEnvironmentTimeout(context::inactivityTimeout)
            }.contextHelp(message("caws.workspace.details.inactivity_timeout_comment"))
        }
    }.also {
        it.apply()
    }

    init {
        contentPanel.add(panel, BorderLayout.CENTER)
    }

    companion object {
        private val LOG = getLogger<WorkspaceConfigurationDialog>()
        fun buildDialog(cawsClient: CodeCatalystClient, isFreeTier: Boolean, initialWs: Workspace, workspaceList: WorkspaceList) =
            DialogBuilder().also { dialog ->
                val content = WorkspaceConfigurationDialog(cawsClient, isFreeTier, initialWs, dialog)
                dialog.addOkAction()
                dialog.addCancelAction()
                dialog.setTitle(
                    message(
                        "caws.configure_workspace_title",
                        initialWs.alias ?: initialWs.branch ?: initialWs.identifier.friendlyString,
                        initialWs.identifier.project.project
                    )
                )
                dialog.setCenterPanel(content)
                dialog.setPreferredFocusComponent(content)
                dialog.setOkText(message("general.update_button"))
                dialog.setOkOperation {
                    ApplicationManager.getApplication().executeOnPooledThread {
                        val errors = content.panel.validateAll()
                        errors.firstOrNull()?.let {
                            dialog.setErrorText(it.message, it.component)
                            return@executeOnPooledThread
                        }
                        content.panel.apply()

                        reconfigureIdeFromContext(dialog, cawsClient, initialWs, content.context, workspaceList)
                    }
                }
                dialog.setCancelOperation {
                    dialog.dialogWrapper.close(DialogWrapper.CANCEL_EXIT_CODE)
                    CodecatalystTelemetry.updateDevEnvironmentSettings(
                        project = null,
                        userId = lazilyGetUserId(),
                        codecatalystUpdateDevEnvironmentLocationType = CodecatalystUpdateDevEnvironmentLocationType.Local,
                        result = TelemetryResult.Cancelled
                    )
                }
            }

        private fun DialogBuilder.setOkText(text: String) {
            runInEdt(ModalityState.any()) {
                okAction.apply {
                    setText(text)
                    // forces text to be applied to action
                    (this as DialogBuilder.OkActionDescriptor).getAction(dialogWrapper)
                }
            }
        }

        private fun reconfigureIdeFromContext(
            dialogBuilder: DialogBuilder,
            cawsClient: CodeCatalystClient,
            ws: Workspace,
            context: ReconfigureWorkspaceSettings,
            workspaceList: WorkspaceList
        ) {
            val oldSettings = ReconfigureWorkspaceSettings(ws)
            if (oldSettings == context) {
                dialogBuilder.setErrorText(message("general.no_changes"))
                return
            }

            dialogBuilder.okActionEnabled(false)
            dialogBuilder.setOkText(message("general.update_in_progress"))
            val userId = lazilyGetUserId()
            try {
                cawsClient.updateDevEnvironment {
                    it.spaceName(ws.identifier.project.space)
                    it.projectName(ws.identifier.project.project)
                    it.id(ws.identifier.id)

                    if (oldSettings.alias != context.alias) {
                        it.alias(context.alias)
                    }

                    if (oldSettings.instanceType != context.instanceType) {
                        it.instanceType(context.instanceType)
                    }

                    if (oldSettings.inactivityTimeout != context.inactivityTimeout) {
                        it.inactivityTimeoutMinutes(context.inactivityTimeout.asMinutes())
                    }

                    context.gatewayProduct?.let { product ->
                        if (oldSettings.gatewayProduct != context.gatewayProduct) {
                            it.ides({ ide ->
                                ide.name(product.apiType)
                                ide.runtime(product.ecrImage)
                            })
                        }
                    }
                }
                CodecatalystTelemetry.updateDevEnvironmentSettings(
                    project = null,
                    userId = userId,
                    codecatalystUpdateDevEnvironmentLocationType = CodecatalystUpdateDevEnvironmentLocationType.Local,
                    result = TelemetryResult.Succeeded
                )
            } catch (e: Exception) {
                dialogBuilder.setErrorText(e.message)
                dialogBuilder.okActionEnabled(true)
                dialogBuilder.setOkText(message("general.update_button"))

                LOG.warn(e) { "reconfigureIdeFromContext failed" }

                CodecatalystTelemetry.updateDevEnvironmentSettings(
                    project = null,
                    userId = userId,
                    codecatalystUpdateDevEnvironmentLocationType = CodecatalystUpdateDevEnvironmentLocationType.Local,
                    result = TelemetryResult.Failed
                )
                return
            }

            workspaceList.markWorkspaceAsDirty(ws)

            runInEdt(ModalityState.any()) {
                dialogBuilder.dialogWrapper.close(DialogWrapper.OK_EXIT_CODE)
            }
        }
    }
}

data class ReconfigureWorkspaceSettings(
    var alias: String,
    var gatewayProduct: GatewayProduct?,
    var instanceType: InstanceType,
    var inactivityTimeout: InactivityTimeout
) {
    constructor(ws: Workspace) :
        this(
            alias = ws.alias ?: "",
            gatewayProduct = GatewayProduct.fromWorkspace(ws),
            instanceType = ws.instanceType,
            inactivityTimeout = ws.inactivityTimeout
        )
}
