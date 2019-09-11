// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.remote;

import static software.aws.toolkits.resources.Localization.message;

import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.ComboBox;
import com.intellij.ui.IdeBorderFactory;
import com.intellij.ui.SortedComboBoxModel;
import com.intellij.util.ui.JBUI;
import java.util.List;
import javax.swing.JPanel;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaInputPanel;
import software.aws.toolkits.jetbrains.ui.CredentialProviderSelector;
import software.aws.toolkits.jetbrains.ui.RegionSelector;

public class RemoteLambdaRunSettingsEditorPanel {
    private final Project project;
    private SortedComboBoxModel<String> functionNamesModel;

    JPanel panel;
    CredentialProviderSelector credentialSelector;
    RegionSelector regionSelector;
    ComboBox<String> functionNames;
    LambdaInputPanel lambdaInput;
    JPanel lambdaInputPanel;

    public RemoteLambdaRunSettingsEditorPanel(Project project) {
        this.project = project;

        lambdaInputPanel.setBorder(IdeBorderFactory.createTitledBorder(message("lambda.input.label"),
                                                                       false,
                                                                       JBUI.emptyInsets()));
    }

    private void createUIComponents() {
        lambdaInput = new LambdaInputPanel(project);

        functionNamesModel = new SortedComboBoxModel<String>(String.CASE_INSENSITIVE_ORDER);
        functionNames = new ComboBox<>(functionNamesModel);
    }

    @Nullable
    public String getFunctionName() {
        String selectedItem = functionNamesModel.getSelectedItem();
        if(selectedItem != null) {
            return selectedItem.trim();
        }
        return null;
    }

    public void setFunctionNames(@NotNull List<String> names) {
        functionNamesModel.setAll(names);
    }
}
