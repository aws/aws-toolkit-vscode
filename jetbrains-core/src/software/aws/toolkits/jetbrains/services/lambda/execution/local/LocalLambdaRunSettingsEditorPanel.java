// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local;

import static software.aws.toolkits.jetbrains.utils.ui.UiUtils.addQuickSelect;
import static software.aws.toolkits.jetbrains.utils.ui.UiUtils.find;
import static software.aws.toolkits.resources.Localization.message;

import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.ComboBox;
import com.intellij.openapi.ui.TextComponentAccessor;
import com.intellij.openapi.ui.TextFieldWithBrowseButton;
import com.intellij.ui.EditorTextField;
import com.intellij.ui.IdeBorderFactory;
import com.intellij.ui.SortedComboBoxModel;
import com.intellij.util.ui.JBUI;
import com.intellij.util.ui.UIUtil;
import java.io.File;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import javax.swing.DefaultComboBoxModel;
import javax.swing.JCheckBox;
import javax.swing.JComboBox;
import javax.swing.JPanel;
import javax.swing.SwingUtilities;
import org.jetbrains.annotations.Nullable;
import org.jetbrains.yaml.YAMLFileType;
import software.amazon.awssdk.services.lambda.model.Runtime;
import software.aws.toolkits.core.utils.ExceptionUtils;
import software.aws.toolkits.jetbrains.services.cloudformation.Function;
import software.aws.toolkits.jetbrains.services.lambda.LambdaWidgets;
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroupUtil;
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaInputPanel;
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils;
import software.aws.toolkits.jetbrains.ui.EnvironmentVariablesTextField;
import software.aws.toolkits.jetbrains.ui.HandlerPanel;
import software.aws.toolkits.jetbrains.ui.ProjectFileBrowseListener;
import software.aws.toolkits.jetbrains.ui.SliderPanel;

public final class LocalLambdaRunSettingsEditorPanel {
    public JPanel panel;
    public HandlerPanel handlerPanel;
    public EnvironmentVariablesTextField environmentVariables;
    private SortedComboBoxModel<Runtime> runtimeModel;
    public JComboBox<Runtime> runtime;
    public LambdaInputPanel lambdaInput;
    public JCheckBox useTemplate;
    public JComboBox<Function> function;
    private DefaultComboBoxModel<Function> functionModels;
    public TextFieldWithBrowseButton templateFile;
    public JPanel lambdaInputPanel;
    public SliderPanel timeoutSlider;
    public SliderPanel memorySlider;
    public JCheckBox invalidator;

    private Runtime lastSelectedRuntime = null;

    private final Project project;

    public LocalLambdaRunSettingsEditorPanel(Project project) {
        this.project = project;

        lambdaInputPanel.setBorder(IdeBorderFactory.createTitledBorder(message("lambda.input.label"), false, JBUI.emptyInsets()));
        useTemplate.addActionListener(e -> updateComponents());
        addQuickSelect(templateFile.getTextField(), useTemplate, this::updateComponents);
        templateFile.addActionListener(new ProjectFileBrowseListener<>(
            project,
            templateFile,
            FileChooserDescriptorFactory.createSingleFileDescriptor(YAMLFileType.YML),
            TextComponentAccessor.TEXT_FIELD_WHOLE_TEXT
        ));

        runtime.addActionListener(e -> {
            int index = runtime.getSelectedIndex();
            if (index < 0) {
                lastSelectedRuntime = null;
                return;
            }
            Runtime selectedRuntime = runtime.getItemAt(index);
            if (selectedRuntime == lastSelectedRuntime) return;
            lastSelectedRuntime = selectedRuntime;
            handlerPanel.setRuntime(selectedRuntime);
        });

        updateComponents();
    }

    private void createUIComponents() {
        handlerPanel = new HandlerPanel(project);
        lambdaInput = new LambdaInputPanel(project);
        functionModels = new DefaultComboBoxModel<>();
        function = new ComboBox<>(functionModels);
        function.addActionListener(e -> updateComponents());

        runtimeModel = new SortedComboBoxModel<>(Comparator.comparing(Runtime::toString, Comparator.naturalOrder()));
        runtime = new ComboBox<>(runtimeModel);
        environmentVariables = new EnvironmentVariablesTextField();
        timeoutSlider = LambdaWidgets.lambdaTimeout();
        memorySlider = LambdaWidgets.lambdaMemory();
    }

    private void updateComponents() {
        EditorTextField handler = handlerPanel.getHandler();

        handlerPanel.setEnabled(!useTemplate.isSelected());
        runtime.setEnabled(!useTemplate.isSelected());
        templateFile.setEnabled(useTemplate.isSelected());
        timeoutSlider.setEnabled(!useTemplate.isSelected());
        memorySlider.setEnabled(!useTemplate.isSelected());

        if (useTemplate.isSelected()) {
            handler.setBackground(UIUtil.getComboBoxDisabledBackground());
            handler.setForeground(UIUtil.getComboBoxDisabledForeground());

            if (functionModels.getSelectedItem() instanceof Function) {
                Function selected = (Function) functionModels.getSelectedItem();
                handler.setText(selected.handler());
                Integer memorySize = selected.memorySize();
                Integer timeout = selected.timeout();
                if (memorySize != null) {
                    memorySlider.setValue(memorySize);
                }
                    if (timeout != null) {
                        timeoutSlider.setValue(timeout);
                }

                Runtime runtime = Runtime.fromValue(ExceptionUtils.tryOrNull(selected::runtime));
                runtimeModel.setSelectedItem(RuntimeGroupUtil.getValidOrNull(runtime));

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

    public void invalidateConfiguration() {
        SwingUtilities.invokeLater(() -> invalidator.setSelected(!invalidator.isSelected()));
    }
}
