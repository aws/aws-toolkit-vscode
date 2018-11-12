// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.deploy;

import com.intellij.execution.util.EnvVariablesTable;
import com.intellij.execution.util.EnvironmentVariable;
import com.intellij.openapi.ui.ComboBox;
import com.intellij.ui.AnActionButton;
import com.intellij.ui.CommonActionsPanel;
import com.intellij.ui.ToolbarDecorator;
import com.intellij.ui.components.panels.Wrapper;
import com.intellij.util.ui.UIUtil;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import software.aws.toolkits.jetbrains.services.cloudformation.Parameter;
import software.aws.toolkits.jetbrains.ui.RegionSelector;

import javax.swing.*;
import java.util.*;
import java.util.stream.Collectors;

public class DeployServerlessApplicationPanel {
    @NotNull JTextField newStackName;
    @NotNull JButton createS3BucketButton;
    private EnvVariablesTable environmentVariablesTable;
    @NotNull JPanel content;
    @NotNull RegionSelector region;
    @NotNull ComboBox<String> s3Bucket;
    @NotNull ComboBox<String> stacks;
    @NotNull JLabel newStackNameLabel;
    @NotNull Wrapper stackParameters;
    private JLabel templateParametersLabel;

    public DeployServerlessApplicationPanel withTemplateParameters(final Collection<Parameter> parameters) {

        environmentVariablesTable.setValues(
                parameters.stream().map(parameter -> new EnvironmentVariable(
                        parameter.getLogicalName(),
                        parameter.defaultValue(),
                        false
                ) {
                    @Override
                    public boolean getNameIsWriteable() {
                        return false;
                    }

                    @Nullable
                    @Override
                    public String getDescription() {
                        return parameter.description();
                    }
                }).collect(Collectors.toList())
        );

        return this;
    }

    public Map<String, String> getTemplateParameters() {
        Map<String, String> parameters = new HashMap<>();

        environmentVariablesTable.getEnvironmentVariables()
                .forEach(envVar -> parameters.put(envVar.getName(), envVar.getValue()));

        return parameters;
    }

    public JComponent getTemplateEditorComponent() {
        return environmentVariablesTable.getComponent();
    }

    private void createUIComponents() {

        environmentVariablesTable = new EnvVariablesTable();

        final CommonActionsPanel panel = UIUtil.findComponentOfType(environmentVariablesTable.getComponent(), CommonActionsPanel.class);
        if (panel != null) {
            panel.getToolbar().getActions().forEach(a -> a.getTemplatePresentation().setEnabledAndVisible(false));
            panel.setVisible(false);
            panel.setEnabled(false);
        }

        hideActionButton(ToolbarDecorator.findAddButton(environmentVariablesTable.getComponent()));
        hideActionButton(ToolbarDecorator.findRemoveButton(environmentVariablesTable.getComponent()));
        hideActionButton(ToolbarDecorator.findEditButton(environmentVariablesTable.getComponent()));

        stackParameters = new Wrapper(environmentVariablesTable.getComponent());
    }

    private static void hideActionButton(final AnActionButton actionButton) {
        if (actionButton != null) {
            actionButton.setEnabled(false);
            actionButton.setVisible(false);
        }
    }
}
