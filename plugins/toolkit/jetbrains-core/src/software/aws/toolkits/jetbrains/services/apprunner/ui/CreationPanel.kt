// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.apprunner.ui

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogPanel
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.ui.components.JBRadioButton
import com.intellij.ui.dsl.builder.Align
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.BottomGap
import com.intellij.ui.dsl.builder.bindIntText
import com.intellij.ui.dsl.builder.bindItem
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.columns
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.layout.or
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
import software.aws.toolkits.jetbrains.utils.toHumanReadable
import software.aws.toolkits.jetbrains.utils.ui.installOnParent
import software.aws.toolkits.jetbrains.utils.ui.selected
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
            textField()
                .apply { component.emptyText.text = "111111111111.dkr.ecr.us-east-1.amazonaws.com/name:tag" }
                .bindText(::containerUri)
                .errorOnApply(message("apprunner.creation.panel.image.uri.missing")) { it.text.isBlank() }
                .align(AlignX.FILL)
        }

        row(message("apprunner.creation.panel.start_command")) {
            textField()
                .apply { component.toolTipText = message("apprunner.creation.panel.start_command.image.tooltip") }
                .bindText({ startCommand ?: "" }, { startCommand = it })
                .align(AlignX.FILL)
        }

        row(message("apprunner.creation.panel.port")) {
            intTextField(range = IntRange(1, 65535)).bindIntText(::port)
                .align(AlignX.FILL)
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
            cell(ecrPolicy)
                .errorOnApply(message("apprunner.creation.panel.image.access_role.missing")) { it.selected() == null && ecr.isSelected }
                .visibleIf(ecr.selected)
                .columns(40)
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
            comboBox(DefaultComboBoxModel(CreationPanel.cpuValues.toTypedArray())).bindItem({ cpu }, { it?.let { cpu = it } }).errorOnApply(
                message("apprunner.creation.panel.cpu.missing")
            ) { it.selected() == null }
            label(message("apprunner.creation.panel.memory"))
            comboBox(DefaultComboBoxModel(CreationPanel.memoryValues.toTypedArray())).bindItem({ memory }, { it?.let { memory = it } })
                .errorOnApply(message("apprunner.creation.panel.memory.missing")) { it.selected() == null }
        }
    }

    val repoSettings = panel {
        row(message("apprunner.creation.panel.repository.runtime")) {
            comboBox(DefaultComboBoxModel(Runtime.knownValues().toTypedArray())).bindItem({ runtime }, { runtime = it })
                .apply {
                    component.toolTipText = message("apprunner.creation.panel.repository.runtime.tooltip")
                    component.renderer = SimpleListCellRenderer.create("") { it?.toString()?.toHumanReadable() }
                }
                .errorOnApply(message("apprunner.creation.panel.repository.runtime.missing")) { it.selected() == null }
                .columns(35)

            label(message("apprunner.creation.panel.port"))
            intTextField(range = IntRange(1, 65535)).bindIntText(::port)
        }
        row(message("apprunner.creation.panel.repository.build_command")) {
            textField().bindText(::buildCommand)
                .apply { component.toolTipText = message("apprunner.creation.panel.repository.build_command.tooltip") }
                .errorOnApply(message("apprunner.creation.panel.repository.build_command.missing")) { it.text.isBlank() }
                .resizableColumn()
                .align(Align.FILL)
        }
        row(message("apprunner.creation.panel.start_command")) {
            textField().bindText({ startCommand ?: "" }, { startCommand = it })
                .apply { component.toolTipText = message("apprunner.creation.panel.start_command.repo.tooltip") }
                .errorOnApply(message("apprunner.creation.panel.start_command.missing")) { it.text.isBlank() }
                .resizableColumn()
                .align(Align.FILL)
        }.bottomGap(BottomGap.MEDIUM)
    }

    val repoPanel = panel {
        row {
            label(message("apprunner.creation.panel.repository.connection"))
            connection = ResourceSelector.builder()
                .resource { AppRunnerResources.LIST_CONNECTIONS }
                .customRenderer(SimpleListCellRenderer.create("") { "${it.connectionName()} (${it.providerTypeAsString().toHumanReadable()})" })
                .awsConnection(project)
                .build()
            cell(connection)
                .errorOnApply(message("apprunner.creation.panel.repository.connection.missing")) { it.isLoading || it.selected() == null }
                .resizableColumn()
                .align(Align.FILL)
        }.contextHelp(message("apprunner.creation.panel.repository.connection.help"))
        row {
            label(message("apprunner.creation.panel.repository.url")).apply {
                component.toolTipText = message("apprunner.creation.panel.repository.url.tooltip")
            }
            textField().bindText(::repository).columns(20)
            label(message("apprunner.creation.panel.repository.branch"))
            textField().bindText(::branch).columns(15)
        }
        buttonsGroup {
            row(message("apprunner.creation.panel.repository.configuration")) {
                cell(repoConfigFromSettings)
                cell(repoConfigFromFile)
            }
        }

        row {
            cell(repoSettings)
                .installOnParent { repoConfigFromSettings.isSelected }
                .visibleIf(repoConfigFromSettings.selected)
        }
        row {
            label(message("apprunner.creation.panel.cpu"))
            comboBox(DefaultComboBoxModel(CreationPanel.cpuValues.toTypedArray())).bindItem({ cpu }, { it?.let { cpu = it } })
                .errorOnApply(message("apprunner.creation.panel.cpu.missing")) { it.selected() == null }
                .resizableColumn().align(Align.FILL)
            label(message("apprunner.creation.panel.memory"))
            comboBox(DefaultComboBoxModel(CreationPanel.memoryValues.toTypedArray())).bindItem({ memory }, { it?.let { memory = it } })
                .errorOnApply(message("apprunner.creation.panel.memory.missing")) { it.selected() == null }
        }
    }

    val component: DialogPanel = panel {
        row(message("apprunner.creation.panel.name")) {
            textField().bindText(::name)
                .errorOnApply(message("apprunner.creation.panel.name.missing")) { it.text.isNullOrBlank() }
                .columns(40)
        }
        buttonsGroup {
            row(message("apprunner.creation.panel.source")) {
                cell(ecr)
                cell(ecrPublic)
                cell(repo)
            }
        }

        buttonsGroup {
            // ECR public disables selecting deployment options
            row(message("apprunner.creation.panel.deployment")) {
                cell(manualDeployment)
                cell(automaticDeployment)
            }
        }.visibleIf(ecr.selected.or(repo.selected))

        row {
            cell(repoPanel)
                .installOnParent { repo.isSelected }
                .visibleIf(repo.selected)
                .resizableColumn()
                .align(Align.FILL)

            cell(imagePanel)
                .installOnParent { ecr.isSelected || ecrPublic.isSelected }
                .visibleIf(ecr.selected.or(ecrPublic.selected))
                .resizableColumn()
                .align(Align.FILL)
        }
        row(message("apprunner.creation.panel.environment")) {
            cell(environmentVariables)
                .resizableColumn().align(Align.FILL)
        }
    }
}
