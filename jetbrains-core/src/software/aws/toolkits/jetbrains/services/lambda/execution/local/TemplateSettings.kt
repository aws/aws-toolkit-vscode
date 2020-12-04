// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.execution.util.PathMappingsComponent
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.ui.SortedComboBoxModel
import com.intellij.util.PathMappingSettings
import org.jetbrains.yaml.YAMLFileType
import software.amazon.awssdk.services.lambda.model.PackageType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.cloudformation.Function
import software.aws.toolkits.jetbrains.services.cloudformation.SamFunction
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.jetbrains.ui.ProjectFileBrowseListener
import software.aws.toolkits.jetbrains.utils.ui.find
import software.aws.toolkits.jetbrains.utils.ui.selected
import java.io.File
import java.util.Comparator
import javax.swing.DefaultComboBoxModel
import javax.swing.JComboBox
import javax.swing.JPanel

class TemplateSettings(val project: Project) {
    lateinit var panel: JPanel
        private set
    lateinit var templateFile: TextFieldWithBrowseButton
        private set
    lateinit var function: JComboBox<Function>
        private set
    lateinit var runtime: JComboBox<Runtime>
        private set
    lateinit var pathMappingsTable: PathMappingsComponent
        private set
    private lateinit var functionModels: DefaultComboBoxModel<Function>
    private lateinit var imageSettingsPanel: JPanel
    private lateinit var runtimeModel: SortedComboBoxModel<Runtime>

    val isImage
        get() = function.selected()?.packageType() == PackageType.IMAGE

    init {
        // by default, do not show the image settings or path mappings table
        imageSettingsPanel.isVisible = false
        pathMappingsTable.isVisible = false
        templateFile.addBrowseFolderListener(
            ProjectFileBrowseListener(
                project,
                FileChooserDescriptorFactory.createSingleFileDescriptor(YAMLFileType.YML)
            ) {
                setTemplateFile(it.canonicalPath)
            }
        )
        function.addActionListener {
            val selected = function.selected()
            if (selected !is SamFunction) {
                imageSettingsPanel.isVisible = false
                return@addActionListener
            }
            imageSettingsPanel.isVisible = selected.packageType() == PackageType.IMAGE
        }
        runtime.addActionListener {
            val pathMappingsApplicable = pathMappingsApplicable()
            pathMappingsTable.isVisible = pathMappingsApplicable
            if (!pathMappingsApplicable) {
                // Clear mappings if it's no longer applicable
                pathMappingsTable.setMappingSettings(PathMappingSettings())
            }
        }
        val supportedRuntimes = LambdaBuilder.supportedRuntimeGroups().flatMap { it.runtimes }.sorted()
        runtimeModel.setAll(supportedRuntimes)
        runtime.selectedItem = RuntimeGroup.determineRuntime(project)?.let { if (it in supportedRuntimes) it else null }
    }

    private fun createUIComponents() {
        functionModels = DefaultComboBoxModel()
        function = ComboBox(functionModels)
        runtimeModel = SortedComboBoxModel(compareBy(Comparator.naturalOrder()) { it: Runtime -> it.toString() })
        runtime = ComboBox(runtimeModel)
    }

    fun setTemplateFile(file: String?) {
        if (file == null) {
            templateFile.text = ""
            updateFunctionModel(emptyList())
        } else {
            templateFile.text = file
            val functions = SamTemplateUtils.findFunctionsFromTemplate(project, File(file))
            updateFunctionModel(functions)
        }
    }

    fun selectFunction(logicalFunctionName: String?) {
        val function = functionModels.find { it.logicalName == logicalFunctionName } ?: return
        functionModels.selectedItem = function
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

    private fun pathMappingsApplicable(): Boolean = runtime.selected()?.runtimeGroup?.supportsPathMappings ?: false
}
