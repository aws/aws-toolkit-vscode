// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.apprunner.ui

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogPanel
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.ui.components.JBRadioButton
import com.intellij.ui.layout.GrowPolicy
import com.intellij.ui.layout.or
import com.intellij.ui.layout.panel
import com.intellij.ui.layout.selected
import software.amazon.awssdk.services.apprunner.model.ConnectionSummary
import software.amazon.awssdk.services.apprunner.model.Runtime
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.services.apprunner.resources.APPRUNNER_ECR_DEFAULT_ROLE_NAME
import software.aws.toolkits.jetbrains.services.apprunner.resources.APPRUNNER_ECR_MANAGED_POLICY
import software.aws.toolkits.jetbrains.services.apprunner.resources.APPRUNNER_SERVICE_ROLE_URI
import software.aws.toolkits.jetbrains.services.apprunner.resources.AppRunnerResources
import software.aws.toolkits.jetbrains.services.iam.CreateIamServiceRoleDialog
import software.aws.toolkits.jetbrains.services.iam.IamResources
import software.aws.toolkits.jetbrains.services.iam.IamRole
import software.aws.toolkits.jetbrains.ui.KeyValueTextField
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import software.aws.toolkits.jetbrains.ui.intTextField
import software.aws.toolkits.jetbrains.utils.toHumanReadable
import software.aws.toolkits.jetbrains.utils.ui.contextualHelp
import software.aws.toolkits.jetbrains.utils.ui.installOnParent
import software.aws.toolkits.jetbrains.utils.ui.selected
import software.aws.toolkits.jetbrains.utils.ui.visibleIf
import software.aws.toolkits.resources.message
import javax.swing.DefaultComboBoxModel

class CreationPanel(private val project: Project, ecrUri: String? = null) {
    internal companion object {
        // These are not in the model so we unfortunately have to keep our own list
        val memoryValues = listOf("2 GB", "3 GB", "4 GB")
        val cpuValues = listOf("1 vCPU", "2 vCPU")
    }

    val environmentVariables = KeyValueTextField()
    lateinit var connection: ResourceSelector<ConnectionSummary>
        private set
    lateinit var ecrPolicy: ResourceSelector<IamRole>
        private set
    var name: String = ""
        private set
    var cpu: String = cpuValues.first()
        private set
    var memory: String = memoryValues.first()
        private set
    var port: Int = 80
        private set
    var containerUri: String = ecrUri ?: ""
        private set
    var startCommand: String? = null
        internal set(value) {
            field = value?.ifBlank { null }
        }
    var repository: String = ""
        internal set(value) {
            // Remove the trailing slash or else it will show up in the service with two //
            field = value.trim().removeSuffix("/")
        }
    var branch: String = ""
        internal set
    var runtime: Runtime? = null
        internal set
    var buildCommand: String = ""
        private set

    internal val ecr = JBRadioButton(message("apprunner.creation.panel.source.ecr"), true)
    internal val ecrPublic = JBRadioButton(message("apprunner.creation.panel.source.ecr_public"), false)
    internal val repo = JBRadioButton(message("apprunner.creation.panel.source.repository"), false)

    internal val automaticDeployment = JBRadioButton(message("apprunner.creation.panel.deployment.automatic"), true).apply {
        toolTipText = message("apprunner.creation.panel.deployment.automatic.tooltip")
    }
    internal val manualDeployment = JBRadioButton(message("apprunner.creation.panel.deployment.manual"), false).apply {
        toolTipText = message("apprunner.creation.panel.deployment.manual.tooltip")
    }

    internal val repoConfigFromSettings = JBRadioButton(message("apprunner.creation.panel.repository.api"), true).apply {
        toolTipText = message("apprunner.creation.panel.repository.api.tooltip")
    }
    internal val repoConfigFromFile = JBRadioButton(message("apprunner.creation.panel.repository.file"), false).apply {
        toolTipText = message("apprunner.creation.panel.repository.file.tooltip")
    }

    val imagePanel = panel {
        row(message("apprunner.creation.panel.image.uri")) {
            textField(::containerUri)
                .apply { component.emptyText.text = "111111111111.dkr.ecr.us-east-1.amazonaws.com/name:tag" }
                .withErrorOnApplyIf(message("apprunner.creation.panel.image.uri.missing")) { it.text.isBlank() }
                .constraints(pushX)
        }

        row(message("apprunner.creation.panel.start_command")) {
            textField({ startCommand ?: "" }, { startCommand = it })
                .apply { component.toolTipText = message("apprunner.creation.panel.start_command.image.tooltip") }
                .constraints(pushX)
        }

        row(message("apprunner.creation.panel.port")) {
            intTextField(::port, range = IntRange(1, 65535))
        }

        row {
            label(message("apprunner.creation.panel.image.access_role"))
                .apply {
                    component.toolTipText = message("apprunner.creation.panel.image.access_role.tooltip")
                }
                .visibleIf(ecr.selected)
            ecrPolicy = ResourceSelector.builder()
                .resource { IamResources.LIST_ALL }
                .awsConnection(project)
                .build()
                .apply {
                    selectedItem { it.name == APPRUNNER_ECR_DEFAULT_ROLE_NAME }
                    toolTipText = message("apprunner.creation.panel.image.access_role.tooltip")
                }
            ecrPolicy(grow)
                .growPolicy(GrowPolicy.MEDIUM_TEXT)
                .withErrorOnApplyIf(message("apprunner.creation.panel.image.access_role.missing")) { it.selected() == null }
                .visibleIf(ecr.selected)
            button(message("general.create_button")) {
                val iamRoleDialog = CreateIamServiceRoleDialog(
                    project,
                    project.awsClient(),
                    APPRUNNER_SERVICE_ROLE_URI,
                    APPRUNNER_ECR_MANAGED_POLICY,
                    APPRUNNER_ECR_DEFAULT_ROLE_NAME
                )
                if (iamRoleDialog.showAndGet()) {
                    iamRoleDialog.name.let { newRole ->
                        ecrPolicy.reload(forceFetch = true)
                        ecrPolicy.selectedItem { role -> role.name == newRole }
                    }
                }
            }.visibleIf(ecr.selected)
        }
        row {
            label(message("apprunner.creation.panel.cpu"))
            comboBox(DefaultComboBoxModel(CreationPanel.cpuValues.toTypedArray()), { cpu }, { it?.let { cpu = it } })
                .withErrorOnApplyIf(message("apprunner.creation.panel.cpu.missing")) { it.selected() == null }
                .constraints(pushX, growX)
            label(message("apprunner.creation.panel.memory"))
            comboBox(DefaultComboBoxModel(CreationPanel.memoryValues.toTypedArray()), { memory }, { it?.let { memory = it } })
                .withErrorOnApplyIf(message("apprunner.creation.panel.memory.missing")) { it.selected() == null }
                .constraints(pushX, growX)
        }
    }

    val repoSettings = panel {
        row(message("apprunner.creation.panel.repository.runtime")) {
            comboBox(DefaultComboBoxModel(Runtime.knownValues().toTypedArray()), { runtime }, { runtime = it })
                .apply {
                    component.toolTipText = message("apprunner.creation.panel.repository.runtime.tooltip")
                    component.renderer = SimpleListCellRenderer.create("") { it?.toString()?.toHumanReadable() }
                }
                .withErrorOnApplyIf(message("apprunner.creation.panel.repository.runtime.missing")) { it.selected() == null }
                .constraints(pushX, growX)
            label(message("apprunner.creation.panel.port"))
            intTextField(::port, range = IntRange(1, 65535))
        }
        row(message("apprunner.creation.panel.repository.build_command")) {
            textField(::buildCommand)
                .apply { component.toolTipText = message("apprunner.creation.panel.repository.build_command.tooltip") }
                .withErrorOnApplyIf(message("apprunner.creation.panel.repository.build_command.missing")) { it.text.isBlank() }
                .constraints(pushX, growX)
        }
        row(message("apprunner.creation.panel.start_command")) {
            textField({ startCommand ?: "" }, { startCommand = it })
                .apply { component.toolTipText = message("apprunner.creation.panel.start_command.repo.tooltip") }
                .withErrorOnApplyIf(message("apprunner.creation.panel.start_command.missing")) { it.text.isBlank() }
                .constraints(pushX, growX)
        }.largeGapAfter()
    }

    val repoPanel = panel {
        row(message("apprunner.creation.panel.repository.connection")) {
            cell(isFullWidth = true) {
                connection = ResourceSelector.builder()
                    .resource { AppRunnerResources.LIST_CONNECTIONS }
                    .customRenderer(SimpleListCellRenderer.create("") { "${it.connectionName()} (${it.providerTypeAsString().toHumanReadable()})" })
                    .awsConnection(project)
                    .build()
                connection(growX, pushX)
                    .withErrorOnApplyIf(message("apprunner.creation.panel.repository.connection.missing")) { it.isLoading || it.selected() == null }
                contextualHelp(message("apprunner.creation.panel.repository.connection.help"))
            }
        }
        row {
            label(message("apprunner.creation.panel.repository.url")).apply {
                component.toolTipText = message("apprunner.creation.panel.repository.url.tooltip")
            }
            textField(::repository, columns = 20).constraints(growX)
            label(message("apprunner.creation.panel.repository.branch"))
            textField(::branch, columns = 15).constraints(growX)
        }
        row(message("apprunner.creation.panel.repository.configuration")) {
            buttonGroup {
                cell(isFullWidth = true) {
                    repoConfigFromSettings()
                    repoConfigFromFile()
                }
            }
        }
        row {
            repoSettings(growX)
                .installOnParent { repoConfigFromSettings.isSelected }
                .visibleIf(repoConfigFromSettings.selected)
        }
        row {
            label(message("apprunner.creation.panel.cpu"))
            comboBox(DefaultComboBoxModel(CreationPanel.cpuValues.toTypedArray()), { cpu }, { it?.let { cpu = it } })
                .withErrorOnApplyIf(message("apprunner.creation.panel.cpu.missing")) { it.selected() == null }
                .constraints(pushX, growX)
            label(message("apprunner.creation.panel.memory"))
            comboBox(DefaultComboBoxModel(CreationPanel.memoryValues.toTypedArray()), { memory }, { it?.let { memory = it } })
                .withErrorOnApplyIf(message("apprunner.creation.panel.memory.missing")) { it.selected() == null }
                .constraints(pushX, growX)
        }
    }

    val component: DialogPanel = panel {
        row(message("apprunner.creation.panel.name")) {
            textField(::name)
                .withErrorOnApplyIf(message("apprunner.creation.panel.name.missing")) { it.text.isNullOrBlank() }
                .constraints(pushX)
        }
        row(message("apprunner.creation.panel.source")) {
            buttonGroup {
                cell {
                    ecr()
                    ecrPublic()
                    repo()
                }
            }
        }
        row(message("apprunner.creation.panel.deployment")) {
            // ECR public disables selecting deployment options
            buttonGroup {
                cell {
                    manualDeployment()
                    automaticDeployment()
                }
            }
        }.visibleIf(ecr.selected.or(repo.selected))
        row {
            subRowIndent = 0
            cell(isFullWidth = true) {
                // TODO HACK making this flow right means we don't have issues with weird spacing above or
                // to the left
                repoPanel(grow)
                    .installOnParent { repo.isSelected }
                    .visibleIf(repo.selected)

                imagePanel(grow)
                    .installOnParent { ecr.isSelected || ecrPublic.isSelected }
                    .visibleIf(ecr.selected.or(ecrPublic.selected))
            }
        }
        row(message("apprunner.creation.panel.environment")) {
            environmentVariables(growX)
        }
    }
}
