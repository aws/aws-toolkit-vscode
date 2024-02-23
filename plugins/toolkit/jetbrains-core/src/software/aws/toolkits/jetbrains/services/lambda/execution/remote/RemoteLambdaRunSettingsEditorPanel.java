// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.remote;

import static software.aws.toolkits.resources.Localization.message;

import com.intellij.openapi.project.Project;
import com.intellij.ui.IdeBorderFactory;
import com.intellij.util.ui.JBUI;
import javax.swing.JPanel;
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaInputPanel;
import software.aws.toolkits.jetbrains.ui.ResourceSelector;

public class RemoteLambdaRunSettingsEditorPanel {
    private final Project project;

    JPanel panel;
    ResourceSelector<String> functionNames;
    LambdaInputPanel lambdaInput;
    JPanel lambdaInputPanel;

    public RemoteLambdaRunSettingsEditorPanel(Project project, ResourceSelector<String> functionNames) {
        this.project = project;
        this.functionNames = functionNames;
        lambdaInputPanel.setBorder(IdeBorderFactory.createTitledBorder(message("lambda.input.label"),
                                                                       false,
                                                                       JBUI.emptyInsets()));
    }

    private void createUIComponents() {
        lambdaInput = new LambdaInputPanel(project);
    }
}
