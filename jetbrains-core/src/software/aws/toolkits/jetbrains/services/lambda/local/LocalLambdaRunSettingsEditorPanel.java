// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.local;

import com.intellij.json.JsonLanguage;
import com.intellij.openapi.components.ServiceManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.ComboBox;
import com.intellij.openapi.ui.TextFieldWithBrowseButton;
import com.intellij.ui.ComboboxWithBrowseButton;
import com.intellij.ui.EditorTextField;
import com.intellij.ui.EditorTextFieldProvider;
import com.intellij.ui.SortedComboBoxModel;
import com.intellij.util.textCompletion.TextCompletionProvider;
import com.intellij.util.textCompletion.TextFieldWithCompletion;
import com.intellij.util.ui.UIUtil;
import java.util.Collections;
import java.util.Comparator;
import javax.swing.JPanel;
import javax.swing.JRadioButton;
import software.amazon.awssdk.services.lambda.model.Runtime;
import software.aws.toolkits.core.lambda.LambdaSampleEvent;
import software.aws.toolkits.jetbrains.ui.EnvironmentVariablesTextField;

public final class LocalLambdaRunSettingsEditorPanel {
    JPanel panel;
    EditorTextField handler;
    EditorTextField inputText;
    EnvironmentVariablesTextField environmentVariables;
    ComboBox<Runtime> runtime;
    ComboboxWithBrowseButton inputTemplates;
    JRadioButton useInputFile;
    JRadioButton useInputText;
    TextFieldWithBrowseButton inputFile;
    ComboBox<LambdaSampleEvent> eventComboBox;
    SortedComboBoxModel<LambdaSampleEvent> eventComboBoxModel;
    private final Project project;
    private final TextCompletionProvider handlerCompletionProvider;

    public LocalLambdaRunSettingsEditorPanel(Project project, TextCompletionProvider handlerCompletionProvider) {
        this.project = project;
        this.handlerCompletionProvider = handlerCompletionProvider;

        useInputText.addActionListener(e -> updateComponents());
        useInputFile.addActionListener(e -> updateComponents());

        updateComponents();
    }

    private void createUIComponents() {
        EditorTextFieldProvider textFieldProvider = ServiceManager.getService(project, EditorTextFieldProvider.class);
        inputText = textFieldProvider.getEditorField(JsonLanguage.INSTANCE, project, Collections.emptyList());
        handler = new TextFieldWithCompletion(project, handlerCompletionProvider, "", true, true, true, true);

        eventComboBoxModel = new SortedComboBoxModel<>(Comparator.comparing(LambdaSampleEvent::getName));
        eventComboBox = new ComboBox<>(eventComboBoxModel);
        inputTemplates = new ComboboxWithBrowseButton(eventComboBox);
    }

    private void updateComponents() {
        inputTemplates.setEnabled(useInputText.isSelected());
        inputText.setEnabled(useInputText.isSelected());
        if(inputText.isEnabled()) {
            inputText.setBackground(UIUtil.getTextFieldBackground());
        } else {
            inputText.setBackground(panel.getBackground());
        }

        inputFile.setEnabled(useInputFile.isSelected());
    }

    public boolean isUsingInputFile() {
        return useInputFile.isSelected();
    }

    public void setUsingInputFile(boolean value) {
        useInputFile.setSelected(value);
        useInputText.setSelected(!value);

        updateComponents();
    }
}
