// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload;

import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.ComboBox;
import com.intellij.ui.EditorTextField;
import com.intellij.ui.IdeBorderFactory;
import com.intellij.ui.SortedComboBoxModel;
import com.intellij.util.textCompletion.TextFieldWithCompletion;
import org.jetbrains.annotations.NotNull;
import software.amazon.awssdk.services.lambda.model.Runtime;
import software.aws.toolkits.jetbrains.services.iam.IamRole;
import software.aws.toolkits.jetbrains.services.lambda.HandlerCompletionProvider;
import software.aws.toolkits.jetbrains.ui.EnvironmentVariablesTextField;
import software.aws.toolkits.jetbrains.ui.ResourceSelector;

import javax.swing.JButton;
import javax.swing.JCheckBox;
import javax.swing.JComboBox;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JSlider;
import javax.swing.JTextField;
import java.util.Collection;
import java.util.Comparator;

import static software.aws.toolkits.resources.Localization.message;

@SuppressWarnings("NullableProblems")
public class EditFunctionPanel {
    @NotNull JTextField name;
    @NotNull JTextField description;
    @NotNull EditorTextField handler;
    @NotNull JButton createRole;
    @NotNull JButton createBucket;
    @NotNull JPanel content;
    @NotNull ResourceSelector<IamRole> iamRole;
    @NotNull JComboBox<Runtime> runtime;
    @NotNull ResourceSelector<String> sourceBucket;
    @NotNull EnvironmentVariablesTextField envVars;
    @NotNull JTextField timeout;
    @NotNull JPanel deploySettings;
    @NotNull JTextField memorySize;
    @NotNull JSlider memorySlider;
    @NotNull JSlider timeoutSlider;
    @NotNull JPanel configurationSettings;
    @NotNull JLabel handlerLabel;
    @NotNull JCheckBox xrayEnabled;

    private SortedComboBoxModel<Runtime> runtimeModel;
    private final Project project;

    EditFunctionPanel(Project project) {
        this.project = project;

        deploySettings.setBorder(IdeBorderFactory.createTitledBorder(message("lambda.upload.deployment_settings"), false));
        configurationSettings.setBorder(IdeBorderFactory.createTitledBorder(message("lambda.upload.configuration_settings"), false));
    }

    public void setXrayControlVisibility(boolean visible) {
        xrayEnabled.setVisible(visible);

        if (!visible) {
            xrayEnabled.setSelected(false);
        }
    }

    private void createUIComponents() {
        handler = new TextFieldWithCompletion(project, new HandlerCompletionProvider(project), "", true, true, true, true);
        runtimeModel = new SortedComboBoxModel<>(Comparator.comparing(Runtime::toString, Comparator.naturalOrder()));
        runtime = new ComboBox<>(runtimeModel);
        envVars = new EnvironmentVariablesTextField(project);
    }

    public void setRuntimes(Collection<Runtime> runtimes) {
        runtimeModel.setAll(runtimes);
    }
}
