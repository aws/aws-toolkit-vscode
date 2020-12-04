// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.ecs.execution

import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.SortedComboBoxModel
import com.intellij.ui.tabs.JBTabsFactory.createEditorTabs
import com.intellij.ui.tabs.TabInfo
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebugConstants
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebuggingPlatform
import software.aws.toolkits.jetbrains.services.clouddebug.DebuggerSupport.Companion.debugger
import software.aws.toolkits.jetbrains.services.clouddebug.DebuggerSupport.Companion.debuggers
import software.aws.toolkits.jetbrains.services.ecs.execution.DockerUtil.dockerPluginAvailable
import software.aws.toolkits.jetbrains.ui.clouddebug.StartupCommandWithAutoFill
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JPanel

class PerContainerSettings(private val project: Project, private val containerName: String, parent: Disposable) {
    lateinit var panel: JPanel
        private set
    lateinit var platform: ComboBox<CloudDebuggingPlatform>
        private set
    lateinit var startCommand: StartupCommandWithAutoFill
        private set
    lateinit var containerSettingsTabsPanel: JPanel
        private set
    lateinit var remoteDebugPort: RemoteDebugPort
        private set
    lateinit var importFromDockerfile: JButton
        private set

    private val platformModel = SortedComboBoxModel<CloudDebuggingPlatform>(compareBy { it.name })
    private val containerSettingsTabs = createEditorTabs(project, parent)

    val artifactMappingsTable = ArtifactMappingsTable(project)
    val portMappingsTable = PortMappingsTable()

    private fun createUIComponents() {
        startCommand = StartupCommandWithAutoFill(project, containerName)
    }

    init {
        platform.model = platformModel
        initStartupCommandField()
        initPlatformComboBox()
        initArtifactMappingTable()
        containerSettingsTabs.addTab(
            TabInfo(artifactMappingsTable.component)
                .setText(message("cloud_debug.ecs.run_config.container.artifacts.tab_name"))
                .setTooltipText(message("cloud_debug.ecs.run_config.container.artifacts.tooltip"))
        )
        containerSettingsTabs.addTab(
            TabInfo(portMappingsTable.component)
                .setText(message("cloud_debug.ecs.run_config.container.ports.tab_name"))
                .setTooltipText(message("cloud_debug.ecs.run_config.container.ports.tooltip"))
        )
        platformModel.setAll(debuggers().keys)
        platformModel.selectedItem = debuggers().keys.firstOrNull()
        containerSettingsTabsPanel.add(containerSettingsTabs.component, BorderLayout.CENTER)
        if (dockerPluginAvailable()) {
            importFromDockerfile.addActionListener(ImportFromDockerfile(project, this))
        } else {
            importFromDockerfile.isEnabled = false
            importFromDockerfile.isVisible = false
        }
    }

    val component: JComponent
        get() = panel

    fun applyTo(containerOptions: ContainerOptions) {
        containerOptions.platform = platformModel.selectedItem
        containerOptions.portMappings = portMappingsTable.getPortMappings()
        containerOptions.artifactMappings = artifactMappingsTable.getArtifactMappings()
        containerOptions.startCommand = startCommand.command
        containerOptions.remoteDebugPorts = remoteDebugPort.getPorts()
    }

    fun resetFrom(containerOptions: ContainerOptions) {
        platformModel.selectedItem = containerOptions.platform
        portMappingsTable.setValues(containerOptions.portMappings)
        artifactMappingsTable.setValues(containerOptions.artifactMappings)
        startCommand.command = containerOptions.startCommand ?: ""
        remoteDebugPort.setIfNotDefault(containerOptions.remoteDebugPorts)
    }

    private fun initStartupCommandField() {
        startCommand.autoFillPopupContent = { artifactMappingsTable.getArtifactMappings() }
    }

    private fun initArtifactMappingTable() {
        artifactMappingsTable.tableView.listTableModel.addTableModelListener {
            startCommand.setAutoFillLinkEnabled(
                artifactMappingsTable.getArtifactMappings().any { (localPath, remotePath) ->
                    localPath != null && localPath.isNotEmpty() && remotePath != null && remotePath.isNotEmpty()
                }
            )
        }
    }

    private fun initPlatformComboBox() {
        platform.addActionListener {
            if (remoteDebugPort.isEmpty) {
                remoteDebugPort.setDefaultPorts(
                    (0 until debugger(platformModel.selectedItem).numberOfDebugPorts).map {
                        CloudDebugConstants.DEFAULT_REMOTE_DEBUG_PORT + it
                    }
                )
            }
            val platformIndex = platform.selectedIndex
            if (platformIndex < 0) {
                return@addActionListener
            }
            startCommand.platform = platform.getItemAt(platformIndex)
        }
    }
}
