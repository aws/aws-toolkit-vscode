// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard;

import software.amazon.awssdk.services.lambda.model.Runtime;
import javax.swing.JButton;
import javax.swing.JComponent;
import javax.swing.JLabel;
import javax.swing.JList;
import javax.swing.JPanel;
import javax.swing.JTextField;
import java.awt.Dimension;
import java.awt.event.ItemEvent;
import com.intellij.openapi.ui.ComboBox;
import com.intellij.openapi.ui.ValidationInfo;
import com.intellij.ui.ColoredListCellRenderer;
import com.intellij.ui.components.JBLabel;
import com.intellij.uiDesigner.core.GridConstraints;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder;
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon;

@SuppressWarnings("NullableProblems")
public class SamInitSelectionPanel implements ValidatablePanel {
    @NotNull JPanel mainPanel;
    @NotNull public ComboBox<Runtime> runtime;
    @NotNull public JTextField samExecutableField;
    @NotNull private JButton editSamExecutableButton;
    @NotNull private JBLabel samLabel;
    @NotNull private ComboBox<SamProjectTemplate> templateComboBox;
    @NotNull private JLabel runtimeLabel;
    private final SamNewProjectSettings projectSettings;
    private JComponent currentSdkSelector;

    SamInitSelectionPanel(SamNewProjectSettings projectSettings) {
        this.projectSettings = projectSettings;
        this.currentSdkSelector = null;

        LambdaBuilder.Companion.getSupportedRuntimeGroups()
                               .stream()
                               .flatMap(x -> x.getRuntimes().stream())
                               .sorted()
                               .forEach(y -> runtime.addItem(y));

        SamInitProjectBuilderCommon.setupSamSelectionElements(samExecutableField, editSamExecutableButton, samLabel);

        runtime.addItemListener(l -> {
            if (l.getStateChange() == ItemEvent.SELECTED) {
                runtimeUpdate();
            }
        });

        templateComboBox.addItemListener(l -> {
            if (l.getStateChange() == ItemEvent.SELECTED) {
                projectSettings.template = (SamProjectTemplate) l.getItem();
            }
        });

        runtimeUpdate();

        mainPanel.validate();
    }

    private void runtimeUpdate() {
        templateComboBox.removeAllItems();
        Runtime selectedRuntime = (Runtime) runtime.getSelectedItem();
        SamInitProjectsKt.getSAM_TEMPLATES().stream()
                .filter(template -> template.supportedRuntimes().contains(selectedRuntime))
                .forEach(template -> templateComboBox.addItem(template));

        templateComboBox.setRenderer(new ColoredListCellRenderer<SamProjectTemplate>() {
            @Override
            protected void customizeCellRenderer(@NotNull JList<? extends SamProjectTemplate> list, SamProjectTemplate value, int index, boolean selected, boolean hasFocus) {
                setIcon(value.getIcon());
                append(value.getName());
            }
        });

        // if selected runtime is null, we're on an unsupported platform
        projectSettings.setRuntime(selectedRuntime);
        projectSettings.setTemplate((SamProjectTemplate) templateComboBox.getSelectedItem());
    }

    public void addSdkPanel(@Nullable JLabel label, JComponent sdkSelector) {
        // glitchy behavior if we don't clean up any old panels
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
        if (label != null && currentSdkSelector == null) {
            gridConstraints.setColumn(0);
            gridConstraints.setColSpan(1);
            mainPanel.add(label, gridConstraints);
        }

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
        return null;
    }

    public void hideRuntime() {
        runtime.setVisible(false);
        runtimeLabel.setVisible(false);
    }
}