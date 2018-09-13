// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution;

import static com.intellij.openapi.application.ActionsKt.runInEdt;
import static software.aws.toolkits.jetbrains.utils.ui.UiUtilsKt.formatAndSet;

import com.intellij.json.JsonFileType;
import com.intellij.json.JsonLanguage;
import com.intellij.openapi.application.ModalityState;
import com.intellij.openapi.components.ServiceManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.ComboBox;
import com.intellij.openapi.ui.ComponentWithBrowseButton;
import com.intellij.openapi.ui.TextComponentAccessor;
import com.intellij.openapi.ui.TextFieldWithBrowseButton;
import com.intellij.openapi.util.text.StringUtil;
import com.intellij.openapi.vfs.VfsUtil;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.ui.ClickListener;
import com.intellij.ui.ComboboxWithBrowseButton;
import com.intellij.ui.EditorTextField;
import com.intellij.ui.EditorTextFieldProvider;
import com.intellij.ui.SortedComboBoxModel;
import com.intellij.util.ui.UIUtil;
import java.awt.event.MouseEvent;
import java.io.IOException;
import java.util.Collections;
import java.util.Comparator;
import java.util.Objects;
import javax.swing.JComboBox;
import javax.swing.JComponent;
import javax.swing.JPanel;
import javax.swing.JRadioButton;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import software.aws.toolkits.core.lambda.LambdaSampleEvent;
import software.aws.toolkits.core.lambda.LambdaSampleEventProvider;
import software.aws.toolkits.jetbrains.core.RemoteResourceResolverProvider;

public class LambdaInputPanel {
    private static final Logger LOG = Logger.getInstance(LambdaInputPanel.class);
    private final Project project;
    private ComboBox<LambdaSampleEvent> eventComboBox;
    private SortedComboBoxModel<LambdaSampleEvent> eventComboBoxModel;

    JRadioButton useInputFile;
    JRadioButton useInputText;
    TextFieldWithBrowseButton inputFile;
    ComboboxWithBrowseButton inputTemplates;
    EditorTextField inputText;
    JPanel panel;

    public LambdaInputPanel(Project project) {
        this.project = project;

        useInputText.addActionListener(e -> updateComponents());
        useInputFile.addActionListener(e -> updateComponents());

        eventComboBox.addActionListener(e -> {
            LambdaSampleEvent selectedSample = eventComboBoxModel.getSelectedItem();
            if (selectedSample != null) {
                selectedSample.getContent().thenAccept(selectedSampleContent -> {
                    String cleanedUp = StringUtil.convertLineSeparators(selectedSampleContent);
                    runInEdt(ModalityState.any(), () -> {
                        formatAndSet(inputText, cleanedUp, JsonLanguage.INSTANCE);
                        return null;
                    });
                });
            }
        });

        addQuickEnable(inputFile.getTextField(), useInputFile);
        addQuickEnable(inputTemplates.getComboBox(), useInputText);
        addQuickEnable(inputTemplates.getButton(), useInputText);
        addQuickEnable(inputText.getComponent(), useInputText);

        inputFile.addBrowseFolderListener(null, null, project,
                                          FileChooserDescriptorFactory.createSingleFileDescriptor(JsonFileType.INSTANCE));

        LambdaSampleEventProvider eventProvider = new LambdaSampleEventProvider(
            RemoteResourceResolverProvider.Companion.getInstance().get());

        eventProvider.get().thenAccept(events -> runInEdt(ModalityState.any(), () -> {
            eventComboBoxModel.setAll(events);
            eventComboBox.setSelectedItem(null);
            return null;
        }));

        inputTemplates.addActionListener(new InputTemplateBrowseAction());

        updateComponents();
    }

    // Allows triggering the radio button selection by clicking on the component
    private void addQuickEnable(JComponent component, JRadioButton radioButton) {
        new ClickListener() {
            @Override
            public boolean onClick(@NotNull MouseEvent event, int clickCount) {
                if (radioButton.isSelected()) {
                    return false;
                }
                radioButton.setSelected(true);
                updateComponents();
                return true;
            }
        }.installOn(component);
    }

    private void createUIComponents() {
        EditorTextFieldProvider textFieldProvider = ServiceManager.getService(project, EditorTextFieldProvider.class);
        inputText = textFieldProvider.getEditorField(JsonLanguage.INSTANCE, project, Collections.emptyList());

        eventComboBoxModel = new SortedComboBoxModel<>(Comparator.comparing(LambdaSampleEvent::getName));
        eventComboBox = new ComboBox<>(eventComboBoxModel);
        inputTemplates = new ComboboxWithBrowseButton(eventComboBox);
    }

    private void updateComponents() {
        inputTemplates.setEnabled(useInputText.isSelected());
        inputText.setEnabled(useInputText.isSelected());
        if (inputText.isEnabled()) {
            inputText.setBackground(UIUtil.getTextFieldBackground());
        } else {
            inputText.setBackground(panel.getBackground());
        }

        inputFile.setEnabled(useInputFile.isSelected());
    }

    public boolean isUsingFile() {
        return useInputFile.isSelected();
    }

    public void setUsingFile(boolean value) {
        useInputFile.setSelected(value);
        useInputText.setSelected(!value);

        updateComponents();
    }

    public void setInputFile(@Nullable String filePath) {
        inputFile.setText(filePath);
    }

    public String getInputFile() {
        return inputFile.getText().trim();
    }

    public void setInputText(@Nullable String text) {
        inputText.setText(text);
    }

    public String getInputText() {
        return inputText.getText().trim();
    }

    private class InputTemplateBrowseAction extends ComponentWithBrowseButton.BrowseFolderActionListener<JComboBox> {
        InputTemplateBrowseAction() {
            super(null,
                  null,
                  inputTemplates,
                  project,
                  FileChooserDescriptorFactory.createSingleFileDescriptor(JsonFileType.INSTANCE),
                  TextComponentAccessor.STRING_COMBOBOX_WHOLE_TEXT);
        }

        @Override
        protected void onFileChosen(@NotNull VirtualFile chosenFile) {
            eventComboBoxModel.setSelectedItem(null);

            try {
                String contents = VfsUtil.loadText(chosenFile);
                String cleanedUp = StringUtil.convertLineSeparators(contents);
                if (Objects.equals(chosenFile.getExtension(), "json")) {
                    formatAndSet(inputText, cleanedUp, JsonLanguage.INSTANCE);
                } else {
                    inputText.setText(cleanedUp);
                }
            } catch (IOException e) {
                LOG.error(e);
            }
        }
    }
}
