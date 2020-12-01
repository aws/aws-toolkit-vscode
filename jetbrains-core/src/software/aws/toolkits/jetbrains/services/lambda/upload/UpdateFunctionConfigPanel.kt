// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.IdeBorderFactory
import software.aws.toolkits.resources.message
import javax.swing.JPanel
import javax.swing.JTextField

class UpdateFunctionConfigPanel(private val project: Project) {
    lateinit var content: JPanel
        private set
    lateinit var name: JTextField
        private set
    lateinit var description: JTextField
        private set
    lateinit var configSettings: LambdaConfigPanel
        private set

    init {
        configSettings.border = IdeBorderFactory.createTitledBorder(message("lambda.upload.configuration_settings"), false)
    }

    private fun createUIComponents() {
        configSettings = LambdaConfigPanel(project, isUpdate = true)
    }

    fun validatePanel(): ValidationInfo? = configSettings.validatePanel()
}
