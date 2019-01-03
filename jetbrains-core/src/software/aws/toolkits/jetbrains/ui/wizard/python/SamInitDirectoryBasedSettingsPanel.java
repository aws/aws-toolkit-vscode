// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard.python;

import com.intellij.facet.ui.ValidationResult;
import com.intellij.openapi.ui.ComboBox;
import com.intellij.openapi.util.text.StringUtil;
import com.intellij.openapi.ui.FixedSizeButton;
import com.intellij.ui.components.JBLabel;
import org.jetbrains.annotations.NotNull;
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamCommon;
import software.aws.toolkits.jetbrains.ui.wizard.SamInitProjectBuilderCommon;
import software.aws.toolkits.jetbrains.ui.wizard.SamProjectTemplate;

import javax.swing.JPanel;
import javax.swing.JTextField;
import java.util.List;

@SuppressWarnings("NullableProblems")
public class SamInitDirectoryBasedSettingsPanel {
    @NotNull JTextField samExecutableField;
    @NotNull ComboBox<SamProjectTemplate> templateField;
    private JPanel mainPanel;
    private FixedSizeButton editSamExecutableButton;
    private JBLabel samLabel;

    private SamInitProjectBuilderPyCharm builder;

    SamInitDirectoryBasedSettingsPanel(List<SamProjectTemplate> templateList, SamInitProjectBuilderPyCharm builder) {
        this.builder = builder;

        templateList.forEach(templateField::addItem);

        SamInitProjectBuilderCommon.setupSamSelectionElements(samExecutableField, editSamExecutableButton, samLabel, builder::fireStateChanged);

        mainPanel.validate();
    }

    @NotNull
    public JPanel getComponent() {
        return mainPanel;
    }

    @NotNull
    public ValidationResult validate() {
        String validationMessage = SamCommon.Companion.validate(StringUtil.nullize(samExecutableField.getText()));
        if (validationMessage != null) {
            return new ValidationResult(validationMessage);
        }
        return ValidationResult.OK;
    }
}
