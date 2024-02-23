// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.openapi.components.service
import com.intellij.openapi.options.SettingsEditor
import com.intellij.openapi.project.Project
import com.intellij.util.PathMappingSettings
import software.aws.toolkits.jetbrains.services.lambda.execution.registerConfigValidationListeners
import software.aws.toolkits.jetbrains.services.lambda.execution.validateSupportedArchitecture
import software.aws.toolkits.jetbrains.services.lambda.validation.LambdaHandlerValidator
import software.aws.toolkits.jetbrains.utils.ui.selected
import javax.swing.JComponent

class LocalLambdaRunSettingsEditor(project: Project) : SettingsEditor<LocalLambdaRunConfiguration>() {
    private val view: LocalLambdaRunSettingsEditorPanel

    init {
        // Invalidate Lambda handler caches before opening run configuration to clear all outdated
        // information that might appears after updating document (e.g. updating handler name).
        // This code is executed once when run configuration form is opened.
        project.service<LambdaHandlerValidator>().clearRequests()
        view = LocalLambdaRunSettingsEditorPanel(project)
        registerConfigValidationListeners(project.messageBus, this) { view.invalidateConfiguration() }
    }

    override fun createEditor(): JComponent = view.panel

    override fun resetEditorFrom(configuration: LocalLambdaRunConfiguration) {
        val useTemplate = configuration.isUsingTemplate()
        view.useTemplate = useTemplate
        if (useTemplate) {
            view.templateSettings.setTemplateFile(configuration.templateFile())
            view.templateSettings.selectFunction(configuration.logicalId())
            view.templateSettings.environmentVariables.envVars = configuration.environmentVariables()
            if (view.templateSettings.isImage) {
                view.templateSettings.imageDebuggerModel.selectedItem = configuration.imageDebugger()
                view.templateSettings.pathMappingsTable.setMappingSettings(PathMappingSettings(configuration.pathMappings))
            }
        } else {
            view.rawSettings.runtimeModel.selectedItem = configuration.runtime()
            view.rawSettings.architectureModel.selectedItem = configuration.architecture()?.validateSupportedArchitecture()
            view.rawSettings.handlerPanel.handler.text = configuration.handler() ?: ""
            view.rawSettings.timeoutSlider.value = configuration.timeout()
            view.rawSettings.memorySlider.value = configuration.memorySize()
            view.rawSettings.environmentVariables.envVars = configuration.environmentVariables()
        }

        if (configuration.isUsingInputFile()) {
            view.lambdaInput.inputFile = configuration.inputSource()
        } else {
            view.lambdaInput.inputText = configuration.inputSource()
        }
    }

    override fun applyEditorTo(configuration: LocalLambdaRunConfiguration) {
        if (view.useTemplate) {
            configuration.useTemplate(view.templateSettings.templateFile.text, view.templateSettings.function.selected()?.logicalName)
            configuration.isImage = view.templateSettings.isImage
            configuration.environmentVariables(view.templateSettings.environmentVariables.envVars)
            if (view.templateSettings.isImage) {
                configuration.imageDebugger(view.templateSettings.imageDebugger.selected())
                configuration.pathMappings = view.templateSettings.pathMappingsTable.mappingSettings.pathMappings
            }
        } else {
            configuration.useHandler(view.rawSettings.runtime.selected()?.toSdkRuntime(), view.rawSettings.handlerPanel.handler.text)
            configuration.architecture(view.rawSettings.architecture.selected())
            configuration.timeout(view.rawSettings.timeoutSlider.value)
            configuration.memorySize(view.rawSettings.memorySlider.value)
            configuration.environmentVariables(view.rawSettings.environmentVariables.envVars)
        }

        if (view.lambdaInput.isUsingFile) {
            configuration.useInputFile(view.lambdaInput.inputFile)
        } else {
            configuration.useInputText(view.lambdaInput.inputText)
        }
    }
}
