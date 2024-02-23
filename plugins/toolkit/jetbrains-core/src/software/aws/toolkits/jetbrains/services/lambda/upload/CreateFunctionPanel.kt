// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.IdeBorderFactory
import software.aws.toolkits.jetbrains.services.lambda.LambdaLimits.FUNCTION_NAME_PATTERN
import software.aws.toolkits.jetbrains.services.lambda.LambdaLimits.MAX_FUNCTION_NAME_LENGTH
import software.aws.toolkits.jetbrains.utils.ui.blankAsNull
import software.aws.toolkits.jetbrains.utils.ui.validationInfo
import software.aws.toolkits.resources.message
import javax.swing.JPanel
import javax.swing.JTextField

class CreateFunctionPanel(private val project: Project) {
    lateinit var name: JTextField
        private set
    lateinit var description: JTextField
        private set
    lateinit var content: JPanel
        private set
    lateinit var buildSettings: BuildSettingsPanel
        private set
    lateinit var configSettings: LambdaConfigPanel
        private set
    lateinit var codeStorage: CodeStoragePanel
        private set

    init {
        configSettings.border = IdeBorderFactory.createTitledBorder(message("lambda.upload.configuration_settings"), false)
        codeStorage.border = IdeBorderFactory.createTitledBorder(message("lambda.upload.code_location_settings"), false)
        buildSettings.border = IdeBorderFactory.createTitledBorder(message("lambda.upload.build_settings"), false)
    }

    private fun createUIComponents() {
        configSettings = LambdaConfigPanel(project, isUpdate = false)
        codeStorage = CodeStoragePanel(project)

        configSettings.packageZip.addChangeListener {
            val packageType = configSettings.packageType()
            codeStorage.packagingType = packageType
            buildSettings.packagingType = packageType
        }
    }

    fun validatePanel(): ValidationInfo? {
        val nameValue = name.blankAsNull()
            ?: return name.validationInfo(message("lambda.upload_validation.function_name"))

        if (!FUNCTION_NAME_PATTERN.matches(nameValue)) {
            return name.validationInfo(message("lambda.upload_validation.function_name_invalid"))
        }

        if (nameValue.length > MAX_FUNCTION_NAME_LENGTH) {
            return name.validationInfo(message("lambda.upload_validation.function_name_too_long", 64))
        }

        return configSettings.validatePanel() ?: codeStorage.validatePanel()
    }
}
