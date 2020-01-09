// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.deploy;

import static software.aws.toolkits.jetbrains.services.lambda.deploy.DeployServerlessApplicationDialog.ACTIVE_STACKS;
import static software.aws.toolkits.resources.Localization.message;

import com.intellij.execution.util.EnvVariablesTable;
import com.intellij.execution.util.EnvironmentVariable;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.project.Project;
import com.intellij.ui.AnActionButton;
import com.intellij.ui.IdeBorderFactory;
import com.intellij.ui.ToolbarDecorator;
import com.intellij.ui.components.panels.Wrapper;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;
import javax.swing.JButton;
import javax.swing.JCheckBox;
import javax.swing.JComponent;
import javax.swing.JPanel;
import javax.swing.JRadioButton;
import javax.swing.JTextField;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import software.aws.toolkits.jetbrains.services.cloudformation.Parameter;
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources;
import software.aws.toolkits.jetbrains.ui.ResourceSelector;

@SuppressWarnings("NullableProblems")
public class DeployServerlessApplicationPanel {
    @NotNull JTextField newStackName;
    @NotNull JButton createS3BucketButton;
    private EnvVariablesTable environmentVariablesTable;
    @NotNull JPanel content;
    @NotNull ResourceSelector<String> s3Bucket;
    @NotNull ResourceSelector<Stack> stacks;
    @NotNull Wrapper stackParameters;
    @NotNull JRadioButton updateStack;
    @NotNull JRadioButton createStack;
    @NotNull JCheckBox requireReview;
    @NotNull JPanel parametersPanel;
    @NotNull JCheckBox useContainer;
    private final Project project;

    public DeployServerlessApplicationPanel(Project project) {
        this.project = project;
    }

    public DeployServerlessApplicationPanel withTemplateParameters(final Collection<Parameter> parameters) {
        parametersPanel.setBorder(
            IdeBorderFactory.createTitledBorder(message("serverless.application.deploy.template.parameters"), false));
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

    private void createUIComponents() {
        environmentVariablesTable = new EnvVariablesTable();
        stackParameters = new Wrapper();
        stacks = ResourceSelector.builder(project).resource(ACTIVE_STACKS).build();
        s3Bucket = ResourceSelector.builder(project).resource(S3Resources.listBucketNamesByActiveRegion(project)).build();

        if (!ApplicationManager.getApplication().isUnitTestMode()) {
            JComponent tableComponent = environmentVariablesTable.getComponent();
            hideActionButton(ToolbarDecorator.findAddButton(tableComponent));
            hideActionButton(ToolbarDecorator.findRemoveButton(tableComponent));
            hideActionButton(ToolbarDecorator.findEditButton(tableComponent));

            stackParameters.setContent(tableComponent);
        }
    }

    private static void hideActionButton(final AnActionButton actionButton) {
        if (actionButton != null) {
            actionButton.setEnabled(false);
            actionButton.setVisible(false);
        }
    }
}
