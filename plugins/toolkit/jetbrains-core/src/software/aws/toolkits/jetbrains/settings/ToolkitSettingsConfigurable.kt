// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.icons.AllIcons
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.options.BoundConfigurable
import com.intellij.openapi.options.ConfigurationException
import com.intellij.openapi.options.SearchableConfigurable
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.openapi.util.text.StringUtil
import com.intellij.ui.components.JBTextField
import com.intellij.ui.dsl.builder.Align
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.bindItem
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.builder.toNullableProperty
import software.aws.toolkits.core.utils.htmlWrap
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance.ExecutableWithPath
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.ExecutableType
import software.aws.toolkits.jetbrains.core.experiments.ToolkitExperimentManager
import software.aws.toolkits.jetbrains.core.experiments.isEnabled
import software.aws.toolkits.jetbrains.core.experiments.setState
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.core.tools.AutoDetectableToolType
import software.aws.toolkits.jetbrains.core.tools.ManagedToolType
import software.aws.toolkits.jetbrains.core.tools.ToolManager
import software.aws.toolkits.jetbrains.core.tools.ToolSettings
import software.aws.toolkits.jetbrains.core.tools.ToolType
import software.aws.toolkits.jetbrains.core.tools.Version
import software.aws.toolkits.jetbrains.core.tools.getTool
import software.aws.toolkits.jetbrains.core.tools.toValidationInfo
import software.aws.toolkits.jetbrains.core.tools.validateCompatability
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.resources.message
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.concurrent.CompletionException

// TODO: pending migration for other non-Q settings
class ToolkitSettingsConfigurable :
    BoundConfigurable(message("aws.settings.toolkit.configurable.title")),
    SearchableConfigurable {
    private val samExecutableInstance: SamExecutable
        get() = ExecutableType.getExecutable(SamExecutable::class.java)
    val samExecutablePath: TextFieldWithBrowseButton = createCliConfigurationElement(samExecutableInstance, SAM)

    private val defaultRegionHandling: ComboBox<UseAwsCredentialRegion> = ComboBox(UseAwsCredentialRegion.values())
    private val profilesNotification: ComboBox<ProfilesNotification> = ComboBox(ProfilesNotification.values())

    override fun createPanel() = panel {
        group(message("aws.settings.global_label")) {
            row {
                label(message("settings.credentials.prompt_for_default_region_switch.setting_label"))
                cell(defaultRegionHandling).resizableColumn().align(AlignX.FILL).bindItem(
                    AwsSettings.getInstance()::useDefaultCredentialRegion,
                    AwsSettings.getInstance()::useDefaultCredentialRegion.toNullableProperty()::set
                )
            }
            row {
                label(message("settings.profiles.label"))
                cell(profilesNotification).resizableColumn().align(AlignX.FILL).bindItem(
                    AwsSettings.getInstance()::profilesNotification,
                    AwsSettings.getInstance()::profilesNotification.toNullableProperty()::set
                )
            }
        }
        group(message("executableCommon.configurable.title")) {
            row {
                label(message("aws.settings.sam.location"))
                // samExecutablePath = createCliConfigurationElement(samExecutableInstance, SAM)
                cell(samExecutablePath).align(AlignX.FILL).resizableColumn()
                browserLink(message("aws.settings.learn_more"), HelpIds.SAM_CLI_INSTALL.url)
            }
            ToolType.EP_NAME.extensionList.forEach { toolType ->
                row(toolType.displayName) {
                    textFieldWithBrowseButton(fileChooserDescriptor = FileChooserDescriptorFactory.createSingleFileDescriptor())
                        .bindText(
                            { ToolSettings.getInstance().getExecutablePath(toolType).orEmpty() },
                            { ToolSettings.getInstance().setExecutablePath(toolType, it.takeIf { v -> v.isNotBlank() }) }
                        )
                        .validationOnInput {
                            it.textField.text.takeIf { t -> t.isNotBlank() }?.let { path ->
                                ToolManager.getInstance().validateCompatability(Path.of(path), toolType).toValidationInfo(toolType, component)
                            }
                        }.applyToComponent {
                            setEmptyText(toolType, textField as JBTextField)
                        }.resizableColumn()
                        .align(Align.FILL)

                    browserLink(message("aws.settings.learn_more"), toolType.documentationUrl())
                }
            }
        }
        group(message("aws.toolkit.experimental.title")) {
            row { label(message("aws.toolkit.experimental.description").htmlWrap()).component.icon = AllIcons.General.Warning }
            ToolkitExperimentManager.visibleExperiments().forEach { toolkitExperiment ->
                row {
                    checkBox(toolkitExperiment.title()).bindSelected(toolkitExperiment::isEnabled, toolkitExperiment::setState)
                        .comment(toolkitExperiment.description())
                }
            }
        }
    }

    override fun apply() {
        validateAndSaveCliSettings(
            samExecutablePath.textField as JBTextField,
            "sam",
            samExecutableInstance,
            getSavedExecutablePath(samExecutableInstance, false),
            getSamPathWithoutSpaces()
        )
        super.apply()
    }

    override fun reset() {
        val awsSettings = AwsSettings.getInstance()
        samExecutablePath.setText(getSavedExecutablePath(samExecutableInstance, false))
        defaultRegionHandling.selectedItem = awsSettings.useDefaultCredentialRegion
        profilesNotification.selectedItem = awsSettings.profilesNotification
    }

    override fun getDisplayName(): String = message("aws.settings.toolkit.configurable.title")

    override fun getId(): String = "aws.old"

    private fun createCliConfigurationElement(executableType: ExecutableType<*>, cliName: String): TextFieldWithBrowseButton {
        val autoDetectPath = getSavedExecutablePath(executableType, true)
        val executablePathField = JBTextField()
        val field = TextFieldWithBrowseButton(executablePathField)
        if (autoDetectPath != null) {
            executablePathField.emptyText.setText(autoDetectPath)
        }
        field.addBrowseFolderListener(
            message("aws.settings.find.title", cliName),
            message("aws.settings.find.description", cliName),
            null,
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

    private fun setEmptyText(toolType: ToolType<Version>, field: JBTextField) {
        val resolved = (toolType as? AutoDetectableToolType<*>)?.resolve()
        field.emptyText.text = when {
            resolved != null && toolType.getTool()?.path == resolved -> message("executableCommon.auto_resolved", resolved)
            toolType is ManagedToolType<*> -> message("executableCommon.auto_managed")
            else -> message("common.none")
        }
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
            require(Files.isExecutable(path) && path.toFile().exists() && path.toFile().isFile)
        } catch (e: Exception) {
            throw ConfigurationException(message("aws.settings.executables.executable_invalid", executableName, currentInput))
        }
        val instance = ExecutableManager.getInstance().validateExecutablePath(executableType, path)
        if (instance is ExecutableInstance.BadExecutable) {
            throw ConfigurationException(instance.validationError)
        }

        // We have validated so now we can set
        ExecutableManager.getInstance().setExecutablePath(executableType, path)
    }

    private fun getSamPathWithoutSpaces() = StringUtil.nullize(samExecutablePath.text.trim { it <= ' ' })

    companion object {
        private const val SAM = "sam"
    }
}
