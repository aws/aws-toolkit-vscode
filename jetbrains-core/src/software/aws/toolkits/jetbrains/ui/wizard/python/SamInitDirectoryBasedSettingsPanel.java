// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard.python;

import javax.swing.JButton;
import javax.swing.JPanel;
import javax.swing.JTextField;
import java.util.List;
import com.intellij.facet.ui.ValidationResult;
import com.intellij.openapi.ui.ComboBox;
import com.intellij.ui.components.JBLabel;
import org.jetbrains.annotations.NotNull;
import software.aws.toolkits.jetbrains.ui.wizard.SamInitProjectBuilderCommon;
import software.aws.toolkits.jetbrains.ui.wizard.SamProjectTemplate;
import static software.aws.toolkits.resources.Localization.message;

public class SamInitDirectoryBasedSettingsPanel {
    private JTextField samExecutableField;
    private ComboBox<SamProjectTemplate> templateField;
    private JPanel mainPanel;
    private JButton editSamExecutableButton;
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
    public ComboBox<SamProjectTemplate> getTemplateField() { return templateField; }

    @NotNull
    public ValidationResult validate() {
        if (samExecutableField.getText().isEmpty()) {
            return new ValidationResult(message("lambda.run_configuration.sam.not_specified"));
        }
        return ValidationResult.OK;
    }
}
