// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.IdeBorderFactory
import software.aws.toolkits.jetbrains.ui.HandlerPanel
import software.aws.toolkits.resources.message
import javax.swing.JLabel
import javax.swing.JPanel

class UpdateFunctionCodePanel internal constructor(private val project: Project) {
    lateinit var content: JPanel
    lateinit var buildSettings: BuildSettingsPanel
    lateinit var codeStorage: CodeStoragePanel
    lateinit var handlerLabel: JLabel
    lateinit var handlerPanel: HandlerPanel
    private lateinit var lambdaConfigurationPanel: JPanel

    init {
        lambdaConfigurationPanel.border = IdeBorderFactory.createTitledBorder(message("lambda.upload.configuration_settings"), false)
    }

    private fun createUIComponents() {
        codeStorage = CodeStoragePanel(project)
        handlerPanel = HandlerPanel(project)
    }

    fun validatePanel(): ValidationInfo? = handlerPanel.validateHandler()
        ?: codeStorage.validatePanel()
}
