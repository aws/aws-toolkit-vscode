// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload;

import static software.aws.toolkits.resources.Localization.message;

import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.ComboBox;
import com.intellij.ui.IdeBorderFactory;
import com.intellij.ui.SortedComboBoxModel;
import java.util.Collection;
import java.util.Comparator;
import javax.swing.JButton;
import javax.swing.JCheckBox;
import javax.swing.JComboBox;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JTextField;
import org.jetbrains.annotations.NotNull;
import software.amazon.awssdk.services.lambda.model.Runtime;
import software.aws.toolkits.jetbrains.services.iam.IamResources;
import software.aws.toolkits.jetbrains.services.iam.IamRole;
import software.aws.toolkits.jetbrains.services.lambda.LambdaWidgets;
import software.aws.toolkits.jetbrains.services.s3.S3Resources;
import software.aws.toolkits.jetbrains.ui.EnvironmentVariablesTextField;
import software.aws.toolkits.jetbrains.ui.ResourceSelector;
import software.aws.toolkits.jetbrains.ui.SliderPanel;

@SuppressWarnings("NullableProblems")
public class EditFunctionPanel {
    @NotNull JTextField name;
    @NotNull JTextField description;
    @NotNull JTextField handler;
    @NotNull JButton createRole;
    @NotNull JButton createBucket;
    @NotNull JPanel content;
    @NotNull ResourceSelector<IamRole> iamRole;
    @NotNull JComboBox<Runtime> runtime;
    @NotNull ResourceSelector<String> sourceBucket;
    @NotNull EnvironmentVariablesTextField envVars;
    @NotNull JPanel deploySettings;
    @NotNull SliderPanel memorySlider;
    @NotNull SliderPanel timeoutSlider;
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
        runtimeModel = new SortedComboBoxModel<>(Comparator.comparing(Runtime::toString, Comparator.naturalOrder()));
        runtime = new ComboBox<>(runtimeModel);
        envVars = new EnvironmentVariablesTextField(project);
        memorySlider = LambdaWidgets.lambdaMemory();
        timeoutSlider = LambdaWidgets.lambdaTimeout();
        iamRole = new ResourceSelector<>(project, IamResources.LIST_LAMBDA_ROLES);
        sourceBucket = new ResourceSelector<>(project, S3Resources.listBucketsByActiveRegion(project));
    }

    public void setRuntimes(Collection<Runtime> runtimes) {
        runtimeModel.setAll(runtimes);
    }
}
