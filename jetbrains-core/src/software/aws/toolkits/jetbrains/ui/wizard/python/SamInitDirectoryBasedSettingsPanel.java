// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard.python;

import javax.swing.JButton;
import javax.swing.JPanel;
import javax.swing.JTextField;
import java.util.List;
import com.intellij.openapi.ui.ComboBox;
import software.aws.toolkits.jetbrains.ui.wizard.SamInitProjectBuilderCommonKt;
import software.aws.toolkits.jetbrains.ui.wizard.SamProjectTemplate;

public class SamInitDirectoryBasedSettingsPanel {
    private JTextField samExecutableField;
    private ComboBox<SamProjectTemplate> templateField;
    private JPanel mainPanel;
    private JButton editSamExecutableButton;

    SamInitDirectoryBasedSettingsPanel(List<SamProjectTemplate> templateList) {
        templateList.forEach(templateField::addItem);

        SamInitProjectBuilderCommonKt.setupSamSelectionElements(samExecutableField, editSamExecutableButton);
    }

    public JPanel getComponent() {
        return mainPanel;
    }

    public ComboBox<SamProjectTemplate> getTemplateField() { return templateField; }
}
