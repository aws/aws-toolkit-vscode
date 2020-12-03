// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.settings

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.options.ConfigurationException
import com.intellij.openapi.options.SearchableConfigurable
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.openapi.util.text.StringUtil
import com.intellij.ui.IdeBorderFactory
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBTextField
import com.intellij.ui.components.labels.LinkLabel
import com.intellij.util.ui.SwingHelper
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance.BadExecutable
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance.ExecutableWithPath
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.ExecutableType
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebugExecutable
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.resources.message
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.concurrent.CompletionException
import javax.swing.JComponent
import javax.swing.JPanel

class AwsSettingsConfigurable(private val project: Project) : SearchableConfigurable {
    private lateinit var panel: JPanel
    private lateinit var samHelp: LinkLabel<*>
    private lateinit var cloudDebugHelp: LinkLabel<*>
    private lateinit var showAllHandlerGutterIcons: JBCheckBox
    private lateinit var serverlessSettings: JPanel
    private lateinit var remoteDebugSettings: JPanel
    private lateinit var applicationLevelSettings: JPanel
    private lateinit var defaultRegionHandling: ComboBox<UseAwsCredentialRegion>
    lateinit var samExecutablePath: TextFieldWithBrowseButton
        private set
    lateinit var enableTelemetry: JBCheckBox
        private set
    lateinit var cloudDebugExecutablePath: TextFieldWithBrowseButton
        private set

    private val cloudDebugExecutableInstance: CloudDebugExecutable
        get() = ExecutableType.getExecutable(CloudDebugExecutable::class.java)
    private val samExecutableInstance: SamExecutable
        get() = ExecutableType.getExecutable(SamExecutable::class.java)
    private val samTextboxInput: String?
        get() = StringUtil.nullize(samExecutablePath.text.trim { it <= ' ' })
    private val cloudDebugTextboxInput: String?
        get() = StringUtil.nullize(cloudDebugExecutablePath.text.trim { it <= ' ' })

    override fun createComponent(): JComponent = panel

    private fun createUIComponents() {
        cloudDebugHelp = createHelpLink(HelpIds.CLOUD_DEBUG_ENABLE)
        cloudDebugExecutablePath = createCliConfigurationElement(cloudDebugExecutableInstance, CLOUDDEBUG)
        samHelp = createHelpLink(HelpIds.SAM_CLI_INSTALL)
        samExecutablePath = createCliConfigurationElement(samExecutableInstance, SAM)
        defaultRegionHandling = ComboBox(UseAwsCredentialRegion.values())
    }

    init {
        applicationLevelSettings.border = IdeBorderFactory.createTitledBorder(message("aws.settings.global_label"))
        serverlessSettings.border = IdeBorderFactory.createTitledBorder(message("aws.settings.serverless_label"))
        remoteDebugSettings.border = IdeBorderFactory.createTitledBorder(message("aws.settings.remote_debug_label"))
        SwingHelper.setPreferredWidth(samExecutablePath, panel.width)
        SwingHelper.setPreferredWidth(cloudDebugExecutablePath, panel.width)
    }

    override fun getId(): String = "aws"
    override fun getDisplayName(): String = message("aws.settings.title")

    override fun isModified(): Boolean {
        val awsSettings = AwsSettings.getInstance()
        val lambdaSettings = LambdaSettings.getInstance(project)
        return samTextboxInput != getSavedExecutablePath(samExecutableInstance, false) ||
            cloudDebugTextboxInput != getSavedExecutablePath(cloudDebugExecutableInstance, false) ||
            isModified(showAllHandlerGutterIcons, lambdaSettings.showAllHandlerGutterIcons) ||
            isModified(enableTelemetry, awsSettings.isTelemetryEnabled) ||
            isModified(defaultRegionHandling, awsSettings.useDefaultCredentialRegion)
    }

    override fun apply() {
        validateAndSaveCliSettings(
            samExecutablePath.textField as JBTextField,
            "sam",
            samExecutableInstance,
            getSavedExecutablePath(samExecutableInstance, false),
            samTextboxInput
        )
        validateAndSaveCliSettings(
            cloudDebugExecutablePath.textField as JBTextField,
            "cloud-debug",
            cloudDebugExecutableInstance,
            getSavedExecutablePath(cloudDebugExecutableInstance, false),
            cloudDebugTextboxInput
        )
        saveAwsSettings()
        saveLambdaSettings()
    }

    override fun reset() {
        val awsSettings = AwsSettings.getInstance()
        val lambdaSettings = LambdaSettings.getInstance(project)
        samExecutablePath.setText(getSavedExecutablePath(samExecutableInstance, false))
        cloudDebugExecutablePath.setText(getSavedExecutablePath(cloudDebugExecutableInstance, false))
        showAllHandlerGutterIcons.isSelected = lambdaSettings.showAllHandlerGutterIcons
        enableTelemetry.isSelected = awsSettings.isTelemetryEnabled
        defaultRegionHandling.selectedItem = awsSettings.useDefaultCredentialRegion
    }

    private fun createHelpLink(helpId: HelpIds): LinkLabel<*> = LinkLabel.create(message("aws.settings.learn_more")) { BrowserUtil.browse(helpId.url) }

    private fun createCliConfigurationElement(executableType: ExecutableType<*>, cliName: String): TextFieldWithBrowseButton {
        val autoDetectPath = getSavedExecutablePath(executableType, true)
        val cloudDebugExecutableTextField = JBTextField()
        val field = TextFieldWithBrowseButton(cloudDebugExecutableTextField)
        if (autoDetectPath != null) {
            cloudDebugExecutableTextField.emptyText.setText(autoDetectPath)
        }
        field.addBrowseFolderListener(
            message("aws.settings.find.title", cliName),
            message("aws.settings.find.description", cliName),
            project,
            FileChooserDescriptorFactory.createSingleLocalFileDescriptor()
        )
        return field
    }

    // modifyMessageBasedOnDetectionStatus will append "Auto-detected: ...." to the
    // message if the executable is found this is used for setting the empty box text
    private fun getSavedExecutablePath(executableType: ExecutableType<*>, modifyMessageBasedOnDetectionStatus: Boolean): String? = try {
        ExecutableManager.getInstance().getExecutable(executableType).thenApply {
            if (it is ExecutableWithPath) {
                if (it !is ExecutableInstance.Executable) {
                    return@thenApply (it as ExecutableWithPath).executablePath.toString()
                } else {
                    val path = it.executablePath.toString()
                    val autoResolved = it.autoResolved
                    if (autoResolved && modifyMessageBasedOnDetectionStatus) {
                        return@thenApply message("aws.settings.auto_detect", path)
                    } else if (autoResolved) {
                        // If it is auto detected, we do not want to return text as the
                        // box will be filled by empty text with the auto-resolve message
                        return@thenApply null
                    } else {
                        return@thenApply path
                    }
                }
            }
            null
        }.toCompletableFuture().join()
    } catch (ignored: CompletionException) {
        null
    }

    private fun validateAndSaveCliSettings(
        textField: JBTextField,
        executableName: String,
        executableType: ExecutableType<*>,
        saved: String?,
        currentInput: String?
    ) {
        // If input is null, wipe out input and try to autodiscover
        if (currentInput == null) {
            ExecutableManager.getInstance().removeExecutable(executableType)
            ExecutableManager.getInstance()
                .getExecutable(executableType)
                .thenRun {
                    val autoDetectPath = getSavedExecutablePath(executableType, true)
                    runInEdt(ModalityState.any()) {
                        if (autoDetectPath != null) {
                            textField.emptyText.setText(autoDetectPath)
                        } else {
                            textField.emptyText.setText("")
                        }
                    }
                }
            return
        }
        if (currentInput == saved) {
            return
        }
        val path: Path
        try {
            path = Paths.get(currentInput)
            if (!Files.isExecutable(path) || !path.toFile().exists() || !path.toFile().isFile) {
                throw IllegalArgumentException("Set file is not an executable")
            }
        } catch (e: Exception) {
            throw ConfigurationException(message("aws.settings.executables.executable_invalid", executableName, currentInput))
        }
        val instance = ExecutableManager.getInstance().validateExecutablePath(executableType, path)
        if (instance is BadExecutable) {
            throw ConfigurationException(instance.validationError)
        }

        // We have validated so now we can set
        ExecutableManager.getInstance().setExecutablePath(executableType, path)
    }

    private fun saveAwsSettings() {
        val awsSettings = AwsSettings.getInstance()
        awsSettings.isTelemetryEnabled = enableTelemetry.isSelected
        awsSettings.useDefaultCredentialRegion = defaultRegionHandling.selectedItem as? UseAwsCredentialRegion ?: UseAwsCredentialRegion.Never
    }

    private fun saveLambdaSettings() {
        LambdaSettings.getInstance(project).showAllHandlerGutterIcons = showAllHandlerGutterIcons.isSelected
    }

    companion object {
        private const val CLOUDDEBUG = "clouddebug"
        private const val SAM = "sam"
    }
}
