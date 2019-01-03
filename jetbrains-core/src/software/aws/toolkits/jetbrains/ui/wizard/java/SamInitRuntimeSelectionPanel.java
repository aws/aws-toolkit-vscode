// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard.java;

import javax.swing.JButton;
import javax.swing.JComponent;
import javax.swing.JPanel;
import javax.swing.JTextField;
import java.awt.event.ItemEvent;
import com.intellij.ide.util.projectWizard.ModuleWizardStep;
import com.intellij.ide.util.projectWizard.SdkSettingsStep;
import com.intellij.ide.util.projectWizard.WizardContext;
import com.intellij.openapi.options.ConfigurationException;
import com.intellij.openapi.projectRoots.Sdk;
import com.intellij.openapi.projectRoots.SdkTypeId;
import com.intellij.openapi.ui.ComboBox;
import com.intellij.openapi.util.Condition;
import com.intellij.openapi.util.text.StringUtil;
import com.intellij.ui.components.JBLabel;
import com.intellij.uiDesigner.core.GridConstraints;
import org.jetbrains.annotations.NotNull;
import org.slf4j.LoggerFactory;
import software.amazon.awssdk.services.lambda.model.Runtime;
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackager;
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup;
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroupUtil;
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamCommon;
import software.aws.toolkits.jetbrains.ui.wizard.SamInitProjectBuilderCommon;

@SuppressWarnings("NullableProblems")
public class SamInitRuntimeSelectionPanel extends ModuleWizardStep {
    @NotNull JPanel mainPanel;
    @NotNull public ComboBox<Runtime> runtime;
    @NotNull public JTextField samExecutableField;
    private JButton editSamExecutableButton;
    private JBLabel samLabel;

    private SamInitModuleBuilder builder;
    private WizardContext context;

    private SdkSettingsStep sdkSettingsStep = null;

    SamInitRuntimeSelectionPanel(SamInitModuleBuilder builder, WizardContext context) {
        this.builder = builder;
        this.context = context;

        LambdaPackager.Companion.getSupportedRuntimeGroups()
                .stream()
                .flatMap(x -> x.getRuntimes().stream())
                .sorted()
                .forEach(y -> runtime.addItem(y));

        // runtime picker MUST be populated before we build the GUI
        buildSdkSettingsPanel();

        SamInitProjectBuilderCommon.setupSamSelectionElements(samExecutableField, editSamExecutableButton, samLabel);

        runtime.addItemListener(l -> {
            if (l.getStateChange() == ItemEvent.SELECTED) {
                builder.setRuntime((Runtime) l.getItem());
                buildSdkSettingsPanel();
            }
        });

        mainPanel.validate();
    }

    private void buildSdkSettingsPanel() {
        if (sdkSettingsStep != null) {
            // glitchy behavior if we don't clean up any old panels
            mainPanel.remove(sdkSettingsStep.getComponent());
        } else {
            GridConstraints sdkSelectorLabelConstraints = new GridConstraints();
            sdkSelectorLabelConstraints.setRow(2);
            sdkSelectorLabelConstraints.setAnchor(GridConstraints.ANCHOR_WEST);
            mainPanel.add(new JBLabel("Project SDK:"), sdkSelectorLabelConstraints);
        }

        // selectedRuntime cannot be null since it is not user editable
        Runtime selectedRuntime = (Runtime) runtime.getSelectedItem();

        Condition<SdkTypeId> sdkTypeFilter = sdkTypeId -> {
            try {
                // runtime group cannot be null since we populated the list of runtimes from the list of supported runtime groups
                RuntimeGroup runtimeGroup = RuntimeGroupUtil.getRuntimeGroup(selectedRuntime);
                return sdkTypeId.equals(runtimeGroup.getIdeSdkType());
            } catch (NullPointerException e) {
                LoggerFactory.getLogger(getClass()).error("sdkTypeFilter: Got a null runtime or could not determine runtime group. Runtime: " + selectedRuntime, e);
                // degrade experience instead of failing to draw the UI
                return true;
            }
        };

        sdkSettingsStep = new SdkSettingsStep(context, builder, sdkTypeFilter, null) {
            @Override
            protected void onSdkSelected(Sdk sdk) {
                builder.setModuleJdk(sdk);
            }
        };

        // append SDK selector group to main panel
        GridConstraints gridConstraints = new GridConstraints();
        gridConstraints.setRow(2);
        gridConstraints.setColumn(1);
        gridConstraints.setColSpan(2);
        gridConstraints.setHSizePolicy(GridConstraints.SIZEPOLICY_CAN_GROW);
        gridConstraints.setAnchor(GridConstraints.ANCHOR_WEST);
        gridConstraints.setFill(GridConstraints.FILL_HORIZONTAL);
        mainPanel.add(sdkSettingsStep.getComponent(), gridConstraints);
    }

    @Override
    public boolean validate() throws ConfigurationException {
        String validationMessage = SamCommon.Companion.validate(StringUtil.nullize(samExecutableField.getText()));
        if (validationMessage != null) {
            throw new ConfigurationException(validationMessage);
        }
        return sdkSettingsStep.validate();
    }

    @Override
    public void updateDataModel() {
        builder.setRuntime((Runtime) runtime.getSelectedItem());
        sdkSettingsStep.updateDataModel();
        context.setProjectBuilder(builder);
    }

    @Override
    public JComponent getComponent() {
        return mainPanel;
    }
}
