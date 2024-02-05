// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.TextBrowseFolderListener
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.IdeBorderFactory
import software.amazon.awssdk.services.lambda.model.PackageType
import software.aws.toolkits.jetbrains.ui.HandlerPanel
import software.aws.toolkits.jetbrains.utils.ui.validationInfo
import software.aws.toolkits.resources.message
import java.nio.file.Paths
import javax.swing.JLabel
import javax.swing.JPanel
import kotlin.io.path.isRegularFile

class UpdateFunctionCodePanel internal constructor(private val project: Project, private val packageType: PackageType) {
    lateinit var content: JPanel
        private set
    lateinit var buildSettings: BuildSettingsPanel
        private set
    lateinit var codeStorage: CodeStoragePanel
        private set
    lateinit var handlerLabel: JLabel
        private set
    lateinit var handlerPanel: HandlerPanel
        private set
    lateinit var dockerFileLabel: JLabel
        private set
    lateinit var dockerFile: TextFieldWithBrowseButton
        private set
    private lateinit var lambdaConfigurationPanel: JPanel

    init {
        dockerFile.addBrowseFolderListener(TextBrowseFolderListener(FileChooserDescriptorFactory.createSingleFileDescriptor()))

        updateVisibility()

        lambdaConfigurationPanel.border = IdeBorderFactory.createTitledBorder(message("lambda.upload.configuration_settings"), false)
    }

    private fun createUIComponents() {
        codeStorage = CodeStoragePanel(project)
        handlerPanel = HandlerPanel(project)
    }

    private fun updateVisibility() {
        val isZip = packageType == PackageType.ZIP

        handlerLabel.isVisible = isZip
        handlerPanel.isVisible = isZip

        dockerFileLabel.isVisible = !isZip
        dockerFile.isVisible = !isZip

        codeStorage.packagingType = packageType
        buildSettings.packagingType = packageType
    }

    fun validatePanel(): ValidationInfo? = when (packageType) {
        PackageType.ZIP -> {
            handlerPanel.validateHandler(handlerMustExist = true) ?: codeStorage.validatePanel()
        }
        PackageType.IMAGE -> {
            if (dockerFile.text.isEmpty() || !Paths.get(dockerFile.text).isRegularFile()) {
                dockerFile.validationInfo(message("lambda.upload_validation.dockerfile_not_found"))
            } else {
                codeStorage.validatePanel()
            }
        }
        else -> {
            throw IllegalStateException("Unsupported package type $packageType")
        }
    }
}
