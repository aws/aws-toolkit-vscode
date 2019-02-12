// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.deploy;

import com.intellij.execution.util.EnvVariablesTable;
import com.intellij.execution.util.EnvironmentVariable;
import com.intellij.ui.AnActionButton;
import com.intellij.ui.CommonActionsPanel;
import com.intellij.ui.IdeBorderFactory;
import com.intellij.ui.ToolbarDecorator;
import com.intellij.ui.components.panels.Wrapper;
import com.intellij.util.ui.UIUtil;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import software.aws.toolkits.jetbrains.services.cloudformation.Parameter;
import software.aws.toolkits.jetbrains.ui.ResourceSelector;

import javax.swing.JButton;
import javax.swing.JCheckBox;
import javax.swing.JComponent;
import javax.swing.JPanel;
import javax.swing.JRadioButton;
import javax.swing.JTextField;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;

import static software.aws.toolkits.resources.Localization.message;

public class DeployServerlessApplicationPanel {
    @NotNull JTextField newStackName;
    @NotNull JButton createS3BucketButton;
    private EnvVariablesTable environmentVariablesTable;
    @NotNull JPanel content;
    @NotNull ResourceSelector<String> s3Bucket;
    @NotNull ResourceSelector<String> stacks;
    @NotNull Wrapper stackParameters;
    @NotNull JRadioButton updateStack;
    @NotNull JRadioButton createStack;
    @NotNull JCheckBox requireReview;
    @NotNull JPanel parametersPanel;
    @NotNull JCheckBox useContainer;

    public DeployServerlessApplicationPanel withTemplateParameters(final Collection<Parameter> parameters) {
        parametersPanel.setBorder(IdeBorderFactory.createTitledBorder(message("serverless.application.deploy.template.parameters"), false));
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

        environmentVariablesTable.stopEditing();
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
