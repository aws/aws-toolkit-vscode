// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.ui.IdeBorderFactory
import com.intellij.ui.SortedComboBoxModel
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import org.jetbrains.yaml.YAMLFileType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.services.cloudformation.Function
import software.aws.toolkits.jetbrains.services.lambda.LambdaWidgets.lambdaMemory
import software.aws.toolkits.jetbrains.services.lambda.LambdaWidgets.lambdaTimeout
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaInputPanel
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils.findFunctionsFromTemplate
import software.aws.toolkits.jetbrains.services.lambda.validOrNull
import software.aws.toolkits.jetbrains.ui.EnvironmentVariablesTextField
import software.aws.toolkits.jetbrains.ui.HandlerPanel
import software.aws.toolkits.jetbrains.ui.ProjectFileBrowseListener
import software.aws.toolkits.jetbrains.ui.SliderPanel
import software.aws.toolkits.jetbrains.utils.ui.addQuickSelect
import software.aws.toolkits.jetbrains.utils.ui.find
import software.aws.toolkits.resources.message
import java.io.File
import java.util.Comparator
import javax.swing.DefaultComboBoxModel
import javax.swing.JCheckBox
import javax.swing.JComboBox
import javax.swing.JPanel

class LocalLambdaRunSettingsEditorPanel(private val project: Project) {
    lateinit var panel: JPanel
    lateinit var handlerPanel: HandlerPanel
    lateinit var environmentVariables: EnvironmentVariablesTextField
    private lateinit var runtimeModel: SortedComboBoxModel<Runtime>
    lateinit var runtime: JComboBox<Runtime>
    lateinit var lambdaInput: LambdaInputPanel
    lateinit var useTemplate: JCheckBox
    lateinit var function: JComboBox<Function>
    private lateinit var functionModels: DefaultComboBoxModel<Function>
    lateinit var templateFile: TextFieldWithBrowseButton
    lateinit var lambdaInputPanel: JPanel
    lateinit var timeoutSlider: SliderPanel
    lateinit var memorySlider: SliderPanel
    lateinit var invalidator: JCheckBox

    var lastSelectedRuntime: Runtime? = null

    private fun createUIComponents() {
        handlerPanel = HandlerPanel(project)
        lambdaInput = LambdaInputPanel(project)
        functionModels = DefaultComboBoxModel()
        function = ComboBox(functionModels)
        function.addActionListener { updateComponents() }
        runtimeModel = SortedComboBoxModel(compareBy(Comparator.naturalOrder()) { it: Runtime -> it.toString() })
        runtime = ComboBox(runtimeModel)
        environmentVariables = EnvironmentVariablesTextField()
        timeoutSlider = lambdaTimeout()
        memorySlider = lambdaMemory()
    }

    init {
        lambdaInputPanel.border = IdeBorderFactory.createTitledBorder(message("lambda.input.label"), false, JBUI.emptyInsets())
        useTemplate.addActionListener { updateComponents() }
        templateFile.textField.addQuickSelect(useTemplate, Runnable { updateComponents() })
        templateFile.addActionListener(
            ProjectFileBrowseListener(
                project,
                FileChooserDescriptorFactory.createSingleFileDescriptor(YAMLFileType.YML)
            ) {
                setTemplateFile(it.canonicalPath)
            }
        )
        runtime.addActionListener {
            val index = runtime.selectedIndex
            if (index < 0) {
                lastSelectedRuntime = null
                return@addActionListener
            }
            val selectedRuntime = runtime.getItemAt(index)
            if (selectedRuntime == lastSelectedRuntime) return@addActionListener
            lastSelectedRuntime = selectedRuntime
            handlerPanel.setRuntime(selectedRuntime)
        }
        updateComponents()
    }

    private fun updateComponents() {
        val handler = handlerPanel.handler
        handlerPanel.isEnabled = !useTemplate.isSelected
        runtime.isEnabled = !useTemplate.isSelected
        templateFile.isEnabled = useTemplate.isSelected
        timeoutSlider.setEnabled(!useTemplate.isSelected)
        memorySlider.setEnabled(!useTemplate.isSelected)
        if (useTemplate.isSelected) {
            handler.background = UIUtil.getComboBoxDisabledBackground()
            handler.foreground = UIUtil.getComboBoxDisabledForeground()
            if (functionModels.selectedItem is Function) {
                val selected = functionModels.selectedItem as Function
                handler.text = selected.handler()
                val memorySize = selected.memorySize()
                val timeout = selected.timeout()
                if (memorySize != null) {
                    memorySlider.value = memorySize
                }
                if (timeout != null) {
                    timeoutSlider.value = timeout
                }
                val runtime = Runtime.fromValue(tryOrNull { selected.runtime() })
                runtimeModel.selectedItem = runtime.validOrNull
                function.isEnabled = true
            }
        } else {
            handler.background = UIUtil.getTextFieldBackground()
            handler.foreground = UIUtil.getTextFieldForeground()
            function.setEnabled(false)
        }
    }

    fun setTemplateFile(file: String?) {
        if (file == null) {
            templateFile.text = ""
            updateFunctionModel(emptyList())
        } else {
            templateFile.text = file
            val functions = findFunctionsFromTemplate(project, File(file))
            updateFunctionModel(functions)
        }
    }

    private fun updateFunctionModel(functions: List<Function>) {
        functionModels.removeAllElements()
        function.isEnabled = functions.isNotEmpty()
        functionModels.addAll(functions)
        if (functions.size == 1) {
            functionModels.setSelectedItem(functions[0])
        } else {
            function.setSelectedIndex(-1)
        }
        updateComponents()
    }

    fun selectFunction(logicalFunctionName: String?) {
        logicalFunctionName ?: return
        val function = functionModels.find { it.logicalName == logicalFunctionName } ?: return
        functionModels.selectedItem = function
        updateComponents()
    }

    fun setRuntimes(runtimes: List<Runtime>?) {
        runtimeModel.setAll(runtimes)
    }

    fun invalidateConfiguration() {
        runInEdt { invalidator.isSelected = !invalidator.isSelected }
    }
}
