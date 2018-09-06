// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local;

import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.ComboBox;
import com.intellij.ui.EditorTextField;
import com.intellij.util.textCompletion.TextCompletionProvider;
import com.intellij.util.textCompletion.TextFieldWithCompletion;
import javax.swing.JPanel;
import software.amazon.awssdk.services.lambda.model.Runtime;
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaInputPanel;
import software.aws.toolkits.jetbrains.ui.CredentialProviderSelector;
import software.aws.toolkits.jetbrains.ui.EnvironmentVariablesTextField;
import software.aws.toolkits.jetbrains.ui.RegionSelector;

public final class LocalLambdaRunSettingsEditorPanel {
    JPanel panel;
    EditorTextField handler;
    EnvironmentVariablesTextField environmentVariables;
    ComboBox<Runtime> runtime;
    RegionSelector regionSelector;
    CredentialProviderSelector credentialSelector;
    LambdaInputPanel lambdaInput;

    private final Project project;
    private final TextCompletionProvider handlerCompletionProvider;

    public LocalLambdaRunSettingsEditorPanel(Project project, TextCompletionProvider handlerCompletionProvider) {
        this.project = project;
        this.handlerCompletionProvider = handlerCompletionProvider;
    }

    private void createUIComponents() {
        handler = new TextFieldWithCompletion(project, handlerCompletionProvider, "", true, true, true, true);
        lambdaInput = new LambdaInputPanel(project);
    }
}
