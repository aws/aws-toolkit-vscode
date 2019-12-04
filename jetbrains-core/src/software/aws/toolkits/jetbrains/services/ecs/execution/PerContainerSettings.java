// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.execution;

import static software.aws.toolkits.resources.Localization.message;

import com.intellij.openapi.Disposable;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.ComboBox;
import com.intellij.ui.SortedComboBoxModel;
import com.intellij.ui.components.fields.ExpandableTextField;
import com.intellij.ui.tabs.JBTabs;
import com.intellij.ui.tabs.JBTabsFactory;
import com.intellij.ui.tabs.TabInfo;
import java.awt.BorderLayout;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import javax.swing.JButton;
import javax.swing.JComponent;
import javax.swing.JPanel;
import org.jetbrains.annotations.NotNull;
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebugConstants;
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebuggingPlatform;
import software.aws.toolkits.jetbrains.services.clouddebug.DebuggerSupport;

public class PerContainerSettings {
    private final SortedComboBoxModel<CloudDebuggingPlatform> platformModel;

    JPanel panel;
    ComboBox<CloudDebuggingPlatform> platform;
    ExpandableTextField startCommand;
    JPanel containerSettingsTabsPanel;
    JBTabs containerSettingsTabs;
    RemoteDebugPort remoteDebugPort;
    JButton importFromDockerfile;
    ArtifactMappingsTable artifactMappingsTable;
    PortMappingsTable portMappingsTable;

    PerContainerSettings(Project project, Disposable parent) {
        this.platformModel = new SortedComboBoxModel<>(Comparator.comparing(Enum::name));
        this.platform.setModel(platformModel);
        this.artifactMappingsTable = new ArtifactMappingsTable(project);
        this.portMappingsTable = new PortMappingsTable();
        this.containerSettingsTabs = JBTabsFactory.createEditorTabs(project, parent);

        this.platform.addActionListener(e -> {
            if (remoteDebugPort.isEmpty()) {
                DebuggerSupport debugger = DebuggerSupport.debugger(platformModel.getSelectedItem());

                List<Integer> ports = new ArrayList<>();
                for (int i = 0; i < debugger.getNumberOfDebugPorts(); i++) {
                    ports.add(CloudDebugConstants.DEFAULT_REMOTE_DEBUG_PORT + i);
                }
                remoteDebugPort.setDefaultPorts(ports);
            }
        });

        containerSettingsTabs.addTab(new TabInfo(artifactMappingsTable.getComponent()).setText(message("cloud_debug.ecs.run_config.container.artifacts.tab_name")).setTooltipText(message("cloud_debug.ecs.run_config.container.artifacts.tooltip")));
        containerSettingsTabs.addTab(new TabInfo(portMappingsTable.getComponent()).setText(message("cloud_debug.ecs.run_config.container.ports.tab_name")).setTooltipText(message("cloud_debug.ecs.run_config.container.ports.tooltip")));

        platformModel.setAll(DebuggerSupport.debuggers().keySet());
        platformModel.setSelectedItem(platformModel.get(0));

        containerSettingsTabsPanel.add(containerSettingsTabs.getComponent(), BorderLayout.CENTER);
        if (DockerUtil.dockerPluginAvailable()) {
            importFromDockerfile.addActionListener(new ImportFromDockerfile(project, this));
        } else {
            importFromDockerfile.setEnabled(false);
            importFromDockerfile.setVisible(false);
        }
    }

    public JComponent getComponent() {
        return panel;
    }

    public void applyTo(@NotNull ContainerOptions containerOptions) {
        containerOptions.setPlatform(platformModel.getSelectedItem());
        containerOptions.setPortMappings(portMappingsTable.getPortMappings());
        containerOptions.setArtifactMappings(artifactMappingsTable.getArtifactMappings());
        containerOptions.setStartCommand(startCommand.getText());
        containerOptions.setRemoteDebugPorts(remoteDebugPort.getPorts());
    }

    public void resetFrom(@NotNull ContainerOptions containerOptions) {
        platformModel.setSelectedItem(containerOptions.getPlatform());
        portMappingsTable.setValues(containerOptions.getPortMappings());
        artifactMappingsTable.setValues(containerOptions.getArtifactMappings());
        startCommand.setText(containerOptions.getStartCommand());
        remoteDebugPort.setIfNotDefault(containerOptions.getRemoteDebugPorts());
    }
}
