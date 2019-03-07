// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local;

import static software.aws.toolkits.jetbrains.utils.ui.UiUtils.addQuickSelect;
import static software.aws.toolkits.jetbrains.utils.ui.UiUtils.find;
import static software.aws.toolkits.resources.Localization.message;

import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.ComboBox;
import com.intellij.openapi.ui.ComponentWithBrowseButton;
import com.intellij.openapi.ui.TextComponentAccessor;
import com.intellij.openapi.ui.TextFieldWithBrowseButton;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.ui.EditorTextField;
import com.intellij.ui.IdeBorderFactory;
import com.intellij.ui.SortedComboBoxModel;
import com.intellij.util.textCompletion.TextCompletionProvider;
import com.intellij.util.textCompletion.TextFieldWithCompletion;
import com.intellij.util.ui.UIUtil;
import java.io.File;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import javax.swing.DefaultComboBoxModel;
import javax.swing.JCheckBox;
import javax.swing.JComboBox;
import javax.swing.JPanel;
import javax.swing.JTextField;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.jetbrains.yaml.YAMLFileType;
import software.amazon.awssdk.services.lambda.model.Runtime;
import software.aws.toolkits.jetbrains.services.cloudformation.Function;
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroupUtil;
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaInputPanel;
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils;
import software.aws.toolkits.jetbrains.ui.CredentialProviderSelector;
import software.aws.toolkits.jetbrains.ui.EnvironmentVariablesTextField;
import software.aws.toolkits.jetbrains.ui.RegionSelector;

public final class LocalLambdaRunSettingsEditorPanel {
    public JPanel panel;
    public EditorTextField handler;
    public EnvironmentVariablesTextField environmentVariables;
    private SortedComboBoxModel<Runtime> runtimeModel;
    public JComboBox<Runtime> runtime;
    public RegionSelector regionSelector;
    public CredentialProviderSelector credentialSelector;
    public LambdaInputPanel lambdaInput;
    public JCheckBox useTemplate;
    public JComboBox<Function> function;
    private DefaultComboBoxModel<Function> functionModels;
    public TextFieldWithBrowseButton templateFile;
    JPanel lambdaInputPanel;

    private final Project project;
    private final TextCompletionProvider handlerCompletionProvider;

    public LocalLambdaRunSettingsEditorPanel(Project project, TextCompletionProvider handlerCompletionProvider) {
        this.project = project;
        this.handlerCompletionProvider = handlerCompletionProvider;

        lambdaInputPanel.setBorder(IdeBorderFactory.createTitledBorder(message("lambda.input.label")));
        useTemplate.addActionListener(e -> updateComponents());
        addQuickSelect(templateFile.getTextField(), useTemplate, this::updateComponents);
        templateFile.addActionListener(new TemplateFileBrowseListener());
        updateComponents();
    }

    private void createUIComponents() {
        handler = new TextFieldWithCompletion(project, handlerCompletionProvider, "", true, true, true, true);
        lambdaInput = new LambdaInputPanel(project);

        functionModels = new DefaultComboBoxModel<>();
        function = new ComboBox<>(functionModels);
        function.addActionListener(e -> updateComponents());

        runtimeModel = new SortedComboBoxModel<>(Comparator.comparing(Runtime::toString, Comparator.naturalOrder()));
        runtime = new ComboBox<>(runtimeModel);
    }

    private void updateComponents() {
        handler.setEnabled(!useTemplate.isSelected());
        runtime.setEnabled(!useTemplate.isSelected());
        templateFile.setEnabled(useTemplate.isSelected());

        if (useTemplate.isSelected()) {
            handler.setBackground(UIUtil.getComboBoxDisabledBackground());
            handler.setForeground(UIUtil.getComboBoxDisabledForeground());

            if (functionModels.getSelectedItem() instanceof Function) {
                Function selected = (Function) functionModels.getSelectedItem();
                handler.setText(selected.handler());
                runtimeModel.setSelectedItem(RuntimeGroupUtil.getValidOrNull(Runtime.fromValue(selected.runtime())));
                function.setEnabled(true);
            }
        } else {
            handler.setBackground(UIUtil.getTextFieldBackground());
            handler.setForeground(UIUtil.getTextFieldForeground());
            function.setEnabled(false);
        }
    }

    public void setTemplateFile(@Nullable String file) {
        if (file == null) {
            templateFile.setText("");
            updateFunctionModel(Collections.emptyList(), false);
        } else {
            templateFile.setText(file);
            List<Function> functions = SamTemplateUtils.findFunctionsFromTemplate(project, new File(file));
            updateFunctionModel(functions, false);
        }
    }

    private void updateFunctionModel(List<Function> functions, boolean selectSingle) {
        functionModels.removeAllElements();
        function.setEnabled(!functions.isEmpty());
        functions.forEach(functionModels::addElement);
        if (selectSingle && functions.size() == 1) {
            functionModels.setSelectedItem(functions.get(0));
        } else {
            function.setSelectedIndex(-1);
        }
        updateComponents();
    }

    public void selectFunction(@Nullable String logicalFunctionName) {
        if (logicalFunctionName == null) return;
        Function function = find(functionModels, f -> f.getLogicalName().equals(logicalFunctionName));
        if (function != null) {
            functionModels.setSelectedItem(function);
            updateComponents();
        }
    }

    public void setRuntimes(List<Runtime> runtimes) {
        runtimeModel.setAll(runtimes);
    }

    private class TemplateFileBrowseListener extends ComponentWithBrowseButton.BrowseFolderActionListener<JTextField> {
        TemplateFileBrowseListener() {
            super(null,
                  null,
                  templateFile,
                  project,
                  FileChooserDescriptorFactory.createSingleFileDescriptor(YAMLFileType.YML),
                  TextComponentAccessor.TEXT_FIELD_SELECTED_TEXT);
        }

        @Override
        protected void onFileChosen(@NotNull VirtualFile chosenFile) {
            templateFile.setText(chosenFile.getPath());
            List<Function> functions = SamTemplateUtils.findFunctionsFromTemplate(project, chosenFile);
            updateFunctionModel(functions, true);
        }
    }
}
