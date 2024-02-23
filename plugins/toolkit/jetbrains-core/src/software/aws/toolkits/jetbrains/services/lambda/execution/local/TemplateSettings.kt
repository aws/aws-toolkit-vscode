// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.execution.util.PathMappingsComponent
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.ui.DocumentAdapter
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.ui.SortedComboBoxModel
import com.intellij.util.PathMappingSettings
import org.jetbrains.yaml.YAMLFileType
import software.amazon.awssdk.services.lambda.model.PackageType
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.cloudformation.Function
import software.aws.toolkits.jetbrains.services.cloudformation.SamFunction
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.ImageDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils.getFunctionEnvironmentVariables
import software.aws.toolkits.jetbrains.ui.KeyValueTextField
import software.aws.toolkits.jetbrains.ui.installTextFieldProjectFileBrowseListener
import software.aws.toolkits.jetbrains.utils.ui.find
import software.aws.toolkits.jetbrains.utils.ui.selected
import java.io.File
import java.util.Comparator
import javax.swing.DefaultComboBoxModel
import javax.swing.JComboBox
import javax.swing.JPanel
import javax.swing.event.DocumentEvent

class TemplateSettings(val project: Project) {
    lateinit var panel: JPanel
        private set
    lateinit var templateFile: TextFieldWithBrowseButton
        private set
    lateinit var function: JComboBox<Function>
        private set
    lateinit var pathMappingsTable: PathMappingsComponent
        private set
    private lateinit var functionModels: DefaultComboBoxModel<Function>
    private lateinit var imageSettingsPanel: JPanel
    lateinit var environmentVariables: KeyValueTextField
        private set
    lateinit var imageDebugger: JComboBox<ImageDebugSupport>
        private set
    lateinit var imageDebuggerModel: SortedComboBoxModel<ImageDebugSupport>
        private set

    val isImage
        get() = function.selected()?.packageType() == PackageType.IMAGE

    init {
        // by default, do not show the image settings or path mappings table
        imageSettingsPanel.isVisible = false
        pathMappingsTable.isVisible = false
        environmentVariables.isEnabled = false
        installTextFieldProjectFileBrowseListener(
            project,
            templateFile,
            FileChooserDescriptorFactory.createSingleFileDescriptor(YAMLFileType.YML)
        ) {
            it.canonicalPath ?: ""
        }

        templateFile.textField.document.addDocumentListener(object : DocumentAdapter() {
            override fun textChanged(e: DocumentEvent) {
                updateFunctionModel(templateFile.text)
            }
        })
        function.addActionListener {
            val selected = function.selected()
            imageSettingsPanel.isVisible = selected is SamFunction && selected.packageType() == PackageType.IMAGE
            if (selected == null) {
                environmentVariables.isEnabled = false
            } else {
                environmentVariables.isEnabled = true
                setEnvVars(selected)
            }
        }
        imageDebugger.addActionListener {
            val pathMappingsApplicable = pathMappingsApplicable()
            pathMappingsTable.isVisible = pathMappingsApplicable
            if (!pathMappingsApplicable) {
                // Clear mappings if it's no longer applicable
                pathMappingsTable.setMappingSettings(PathMappingSettings())
            }
        }
        imageDebuggerModel.setAll(ImageDebugSupport.debuggers().values)
    }

    private fun createUIComponents() {
        functionModels = DefaultComboBoxModel()
        function = ComboBox(functionModels)
        environmentVariables = KeyValueTextField()
        imageDebuggerModel = SortedComboBoxModel(compareBy(Comparator.naturalOrder()) { it.displayName() })
        imageDebugger = ComboBox(imageDebuggerModel)
        imageDebugger.renderer = SimpleListCellRenderer.create { label, value, _ -> label.text = value?.displayName() }
    }

    fun setTemplateFile(path: String?) {
        templateFile.text = path ?: ""
        updateFunctionModel(path)
    }

    private fun updateFunctionModel(path: String?) {
        if (path.isNullOrBlank()) {
            templateFile.text = ""
            updateFunctionModel(emptyList())
            return
        }
        val file = File(path)
        if (!file.exists() || !file.isFile) {
            updateFunctionModel(emptyList())
        } else {
            val functions = SamTemplateUtils.findFunctionsFromTemplate(project, file)
            updateFunctionModel(functions)
        }
    }

    fun selectFunction(logicalFunctionName: String?) {
        val function = functionModels.find { it.logicalName == logicalFunctionName } ?: return
        functionModels.selectedItem = function
    }

    private fun setEnvVars(function: Function) = try {
        environmentVariables.envVars = getFunctionEnvironmentVariables(File(templateFile.text).toPath(), function.logicalName)
    } catch (e: Exception) {
        // We don't want to throw exceptions out to the UI when we fail to parse the template, so log and continue
        LOG.warn(e) { "Failed to set environment variables field" }
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
    }

    private fun pathMappingsApplicable(): Boolean = imageDebugger.selected()?.supportsPathMappings() ?: false

    private companion object {
        val LOG = getLogger<TemplateSettings>()
    }
}
