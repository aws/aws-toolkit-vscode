// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard;

import com.intellij.openapi.ui.ComboBox;
import com.intellij.openapi.ui.FixedSizeButton;
import com.intellij.openapi.ui.ValidationInfo;
import com.intellij.ui.ColoredListCellRenderer;
import com.intellij.ui.components.JBLabel;
import com.intellij.uiDesigner.core.GridConstraints;
import com.intellij.uiDesigner.core.GridLayoutManager;
import com.intellij.uiDesigner.core.Spacer;
import java.awt.BorderLayout;
import java.awt.Insets;
import java.util.ResourceBundle;
import javax.swing.DefaultComboBoxModel;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import software.amazon.awssdk.services.lambda.model.Runtime;
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder;
import software.aws.toolkits.jetbrains.services.lambda.SamNewProjectSettings;
import software.aws.toolkits.jetbrains.services.lambda.SamProjectTemplate;
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon;

import javax.swing.JButton;
import javax.swing.JComponent;
import javax.swing.JLabel;
import javax.swing.JList;
import javax.swing.JPanel;
import javax.swing.JTextField;
import java.awt.Dimension;
import java.awt.event.ItemEvent;
import java.util.List;

@SuppressWarnings("NullableProblems")
public class SamInitSelectionPanel implements ValidatablePanel {
    @NotNull JPanel mainPanel;
    @NotNull private ComboBox<Runtime> runtimeComboBox;
    @NotNull private JTextField samExecutableField;
    @NotNull private JButton editSamExecutableButton;
    @NotNull private JBLabel samLabel;
    @NotNull private ComboBox<SamProjectTemplate> templateComboBox;
    @NotNull private JLabel runtimeLabel;
    private SdkSelectionPanel sdkSelectionUi;
    private JLabel currentSdkSelectorLabel;
    private JComponent currentSdkSelector;

    private final SamProjectGenerator generator;

    SamInitSelectionPanel(SamProjectGenerator generator) {
        this.generator = generator;
        this.currentSdkSelectorLabel = null;
        this.currentSdkSelector = null;

        LambdaBuilder.Companion.getSupportedRuntimeGroups()
                               .stream()
                               .flatMap(x -> x.getRuntimes().stream())
                               .sorted()
                               .forEach(y -> runtimeComboBox.addItem(y));

        SamInitProjectBuilderCommon.setupSamSelectionElements(samExecutableField, editSamExecutableButton, samLabel);

        runtimeComboBox.addItemListener(l -> {
            if (l.getStateChange() == ItemEvent.SELECTED) {
                runtimeUpdate();
                sdkSelectionUi.registerListeners();
            }
        });

        runtimeUpdate();

        mainPanel.validate();
    }

    private void runtimeUpdate() {
        Runtime selectedRuntime = (Runtime) runtimeComboBox.getSelectedItem();

        templateComboBox.removeAllItems();

        // if selected runtimeComboBox is null, we're on an unsupported platform
        if (selectedRuntime == null) {
            addSdkPanel(new NoOpSdkSelectionPanel());
            return;
        }

        SamProjectTemplate.SAM_TEMPLATES.stream()
                                        .filter(template -> template.supportedRuntimes().contains(selectedRuntime))
                                        .forEach(template -> templateComboBox.addItem(template));
        templateComboBox.setRenderer(new ColoredListCellRenderer<SamProjectTemplate>() {
            @Override
            protected void customizeCellRenderer(@NotNull JList<? extends SamProjectTemplate> list, SamProjectTemplate value, int index, boolean selected, boolean hasFocus) {
                setIcon(value.getIcon());
                append(value.getName());
            }
        });

        this.sdkSelectionUi = SdkSelectionPanel.create(selectedRuntime, generator);
        addSdkPanel(sdkSelectionUi);
    }

    public void addSdkPanel(@NotNull SdkSelectionPanel sdkSelectionPanel) {
        JComponent sdkSelector = sdkSelectionPanel.getSdkSelectionPanel();
        JLabel label = sdkSelectionPanel.getSdkSelectionLabel();

        // glitchy behavior if we don't clean up any old panels
        if (currentSdkSelectorLabel != null) {
            mainPanel.remove(currentSdkSelectorLabel);
        }
        if (currentSdkSelector != null) {
            mainPanel.remove(currentSdkSelector);
        }
        // append SDK selector group to main panel
        // sdk selector will want to grow past bounds if width is set to -1
        sdkSelector.setMinimumSize(new Dimension(0, -1));
        // first add the panel
        GridConstraints gridConstraints = new GridConstraints();
        gridConstraints.setRow(3);
        // take up two columns if no label
        if (label == null) {
            gridConstraints.setColumn(0);
            gridConstraints.setColSpan(2);
        } else {
            gridConstraints.setColumn(1);
            gridConstraints.setColSpan(1);
        }
        gridConstraints.setHSizePolicy(GridConstraints.SIZEPOLICY_CAN_GROW | GridConstraints.SIZEPOLICY_CAN_SHRINK);
        gridConstraints.setFill(GridConstraints.FILL_HORIZONTAL);
        gridConstraints.setAnchor(GridConstraints.ANCHOR_WEST);
        mainPanel.add(sdkSelector, gridConstraints);

        // and then the label if available, and it doesn't already exist
        if (label != null) {
            gridConstraints.setColumn(0);
            gridConstraints.setColSpan(1);
            mainPanel.add(label, gridConstraints);
        }

        currentSdkSelectorLabel = label;
        currentSdkSelector = sdkSelector;
    }

    @Nullable
    @Override
    public ValidationInfo validate() {
        // validate against currently saved sam path
        String samValidationMessage = SamCommon.Companion.validate();
        if (samValidationMessage != null) {
            return new ValidationInfo(samValidationMessage, samExecutableField);
        }

        if (sdkSelectionUi == null) {
            return null;
        }

        List<ValidationInfo> validationInfoList = sdkSelectionUi.validateAll();
        if (validationInfoList == null || validationInfoList.isEmpty()) {
            return null;
        } else {
            return validationInfoList.get(0);
        }
    }

    public void registerValidators() {
        if (sdkSelectionUi != null) {
            sdkSelectionUi.registerListeners();
        }
    }

    public SamNewProjectSettings getNewProjectSettings() {
        Runtime lambdaRuntime = (Runtime) runtimeComboBox.getSelectedItem();
        SamProjectTemplate samProjectTemplate = (SamProjectTemplate) templateComboBox.getSelectedItem();

        if (lambdaRuntime == null) {
            throw new RuntimeException("No Runtime is supported in this Platform.");
        }

        if (samProjectTemplate == null) {
            throw new RuntimeException("No SAM template is supported for this runtime: " + lambdaRuntime.toString());
        }

        if (sdkSelectionUi != null) {
            return new SamNewProjectSettings(
                lambdaRuntime,
                samProjectTemplate,
                sdkSelectionUi.getSdkSettings()
            );
        } else {
            throw new RuntimeException("SDK selection panel is not initialized.");
        }
    }

}