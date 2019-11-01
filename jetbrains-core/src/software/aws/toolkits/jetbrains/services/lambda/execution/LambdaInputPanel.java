// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution;

import static com.intellij.openapi.application.ActionsKt.runInEdt;
import static com.intellij.openapi.ui.Messages.CANCEL_BUTTON;
import static com.intellij.openapi.ui.Messages.OK_BUTTON;
import static software.aws.toolkits.jetbrains.utils.ui.UiUtils.addQuickSelect;
import static software.aws.toolkits.jetbrains.utils.ui.UiUtils.formatAndSet;
import static software.aws.toolkits.resources.Localization.message;

import com.intellij.icons.AllIcons;
import com.intellij.json.JsonFileType;
import com.intellij.json.JsonLanguage;
import com.intellij.openapi.application.ModalityState;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.ComboBox;
import com.intellij.openapi.ui.Messages;
import com.intellij.openapi.ui.TextComponentAccessor;
import com.intellij.openapi.ui.TextFieldWithBrowseButton;
import com.intellij.openapi.util.text.StringUtil;
import com.intellij.openapi.vfs.VfsUtil;
import com.intellij.ui.ComboboxWithBrowseButton;
import com.intellij.ui.EditorTextField;
import com.intellij.ui.EditorTextFieldProvider;
import com.intellij.ui.SimpleListCellRenderer;
import com.intellij.ui.SortedComboBoxModel;
import com.intellij.util.ui.UIUtil;
import java.io.IOException;
import java.util.Collections;
import java.util.Comparator;
import java.util.concurrent.CompletableFuture;
import javax.swing.JPanel;
import javax.swing.JRadioButton;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import software.aws.toolkits.core.lambda.LambdaSampleEvent;
import software.aws.toolkits.core.lambda.LambdaSampleEventProvider;
import software.aws.toolkits.jetbrains.core.RemoteResourceResolverProvider;
import software.aws.toolkits.jetbrains.ui.ProjectFileBrowseListener;

public class LambdaInputPanel {
    private static final Logger LOG = Logger.getInstance(LambdaInputPanel.class);
    private final Project project;
    private ComboBox<LambdaSampleEvent> eventComboBox;
    private SortedComboBoxModel<LambdaSampleEvent> eventComboBoxModel;
    private String selectedTemplate;
    private LambdaSampleEvent selected;

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
            if (selectedSample != null && selectedSample != selected) {
                if (inputText.getText().length() > 0 && !inputText.getText().equals(selectedTemplate)) {
                    int result = Messages.showOkCancelDialog(project,
                                                             message("lambda.run_configuration.input.samples.confirm"),
                                                             message("lambda.run_configuration.input.samples.confirm.title"),
                                                             OK_BUTTON,
                                                             CANCEL_BUTTON,
                                                             AllIcons.General.WarningDialog);
                    if (result == Messages.CANCEL) {
                        eventComboBoxModel.setSelectedItem(selected);
                        if (selectedSample instanceof LocalLambdaSampleEvent) {
                            eventComboBoxModel.remove(selectedSample);
                        }
                        return;
                    }
                }

                selectedSample.getContent().thenAccept(selectedSampleContent -> {
                    String cleanedUp = StringUtil.convertLineSeparators(selectedSampleContent);
                    runInEdt(ModalityState.any(), () -> {
                        formatAndSet(inputText, cleanedUp, JsonLanguage.INSTANCE);
                        selectedTemplate = inputText.getText();
                        return null;
                    });
                });
            }
            selected = selectedSample;
        });

        addQuickSelect(inputFile.getTextField(), useInputFile, this::updateComponents);
        addQuickSelect(inputTemplates.getComboBox(), useInputText, this::updateComponents);
        addQuickSelect(inputTemplates.getButton(), useInputText, this::updateComponents);
        addQuickSelect(inputText.getComponent(), useInputText, this::updateComponents);

        inputFile.addActionListener(new ProjectFileBrowseListener<>(
            project,
            inputFile,
            FileChooserDescriptorFactory.createSingleFileDescriptor(JsonFileType.INSTANCE),
            TextComponentAccessor.TEXT_FIELD_WHOLE_TEXT
        ));

        LambdaSampleEventProvider eventProvider = new LambdaSampleEventProvider(RemoteResourceResolverProvider.Companion.getInstance().get());

        eventProvider.get().thenAccept(events -> runInEdt(ModalityState.any(), () -> {
            eventComboBoxModel.setAll(events);
            eventComboBox.setSelectedItem(null);
            return null;
        }));

        inputTemplates.addActionListener(new ProjectFileBrowseListener<>(
            project,
            inputTemplates,
            FileChooserDescriptorFactory.createSingleFileDescriptor(JsonFileType.INSTANCE),
            TextComponentAccessor.STRING_COMBOBOX_WHOLE_TEXT,
            chosenFile -> {
                try {
                    String contents = VfsUtil.loadText(chosenFile);
                    String cleanedUp = StringUtil.convertLineSeparators(contents);
                    LambdaSampleEvent fileEvent = new LocalLambdaSampleEvent(chosenFile.getName(), cleanedUp);
                    eventComboBoxModel.add(fileEvent);
                    eventComboBoxModel.setSelectedItem(fileEvent);
                } catch (IOException e) {
                    LOG.error(e);
                }

                return null; // Required since lambda is defined in Kotlin
            }
        ));


        updateComponents();
    }

    private void createUIComponents() {
        inputText = EditorTextFieldProvider.getInstance().getEditorField(JsonLanguage.INSTANCE, project, Collections.emptyList());

        eventComboBoxModel = new SortedComboBoxModel<>(Comparator.comparing(LambdaSampleEvent::getName));

        eventComboBox = new ComboBox<>(eventComboBoxModel);
        eventComboBox.setRenderer(SimpleListCellRenderer.create(message("lambda.run_configuration.input.samples.label"), LambdaSampleEvent::getName));

        inputTemplates = new ComboboxWithBrowseButton(eventComboBox);
        inputTemplates.getButton().setIcon(AllIcons.General.OpenDiskHover);
        inputTemplates.getButton().setDisabledIcon(AllIcons.General.OpenDisk);
    }

    private void updateComponents() {
        inputTemplates.setEnabled(useInputText.isSelected());
        inputText.setEnabled(useInputText.isSelected());
        if (inputText.isEnabled()) {
            inputText.setBackground(UIUtil.getTextFieldBackground());
        } else {
            inputText.setBackground(UIUtil.getComboBoxDisabledBackground());
        }

        inputFile.setEnabled(useInputFile.isSelected());
    }

    public boolean isUsingFile() {
        return useInputFile.isSelected();
    }

    public void setInputFile(@Nullable String filePath) {
        setUsingFile(true);
        inputFile.setText(filePath);
    }

    public String getInputFile() {
        return inputFile.getText().trim();
    }

    public void setInputText(@Nullable String text) {
        setUsingFile(false);
        inputText.setText(text);
    }

    private void setUsingFile(boolean value) {
        useInputFile.setSelected(value);
        useInputText.setSelected(!value);
        updateComponents();
    }

    public String getInputText() {
        return StringUtil.nullize(inputText.getText().trim(), true);
    }

    private class LocalLambdaSampleEvent extends LambdaSampleEvent {
        LocalLambdaSampleEvent(@NotNull String name, @NotNull String content) {
            super(name, () -> CompletableFuture.completedFuture(content));
        }
    }
}
