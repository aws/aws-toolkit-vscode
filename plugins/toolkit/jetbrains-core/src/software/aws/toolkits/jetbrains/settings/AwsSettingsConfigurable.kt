// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.options.ConfigurationException
import com.intellij.openapi.options.SearchableConfigurable
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.openapi.util.text.StringUtil
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBTextField
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.layout.selected
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance.ExecutableWithPath
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.ExecutableType
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AwsTelemetry
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.concurrent.CompletionException
import javax.swing.JComponent

// TODO: pending migration for other non-Q settings
class AwsSettingsConfigurable : SearchableConfigurable {
    private val samExecutableInstance: SamExecutable
        get() = ExecutableType.getExecutable(SamExecutable::class.java)
    val samExecutablePath: TextFieldWithBrowseButton = createCliConfigurationElement(samExecutableInstance, SAM)

    private val defaultRegionHandling: ComboBox<UseAwsCredentialRegion> = ComboBox(UseAwsCredentialRegion.values())
    private val profilesNotification: ComboBox<ProfilesNotification> = ComboBox(ProfilesNotification.values())

    val enableTelemetry: JBCheckBox = JBCheckBox()
    private val enableAutoUpdate: JBCheckBox = JBCheckBox()
    private val enableAutoUpdateNotification: JBCheckBox = JBCheckBox()
    override fun createComponent(): JComponent = panel {
        group(message("aws.settings.serverless_label")) {
            row {
                label(message("aws.settings.sam.location"))
                // samExecutablePath = createCliConfigurationElement(samExecutableInstance, SAM)
                cell(samExecutablePath).align(AlignX.FILL).resizableColumn()
                browserLink(message("aws.settings.learn_more"), HelpIds.SAM_CLI_INSTALL.url)
            }
        }
        group(message("aws.settings.global_label")) {
            row {
                label(message("settings.credentials.prompt_for_default_region_switch.setting_label"))
                cell(defaultRegionHandling).resizableColumn().align(AlignX.FILL).applyToComponent {
                    this.selectedItem = AwsSettings.getInstance().useDefaultCredentialRegion ?: UseAwsCredentialRegion.Never
                }
            }
            row {
                label(message("settings.profiles.label"))
                cell(profilesNotification).resizableColumn().align(AlignX.FILL).applyToComponent {
                    this.selectedItem = AwsSettings.getInstance().profilesNotification ?: ProfilesNotification.Always
                }
            }

            row {
                cell(enableTelemetry).applyToComponent { this.isSelected = AwsSettings.getInstance().isTelemetryEnabled }
                text(message("aws.settings.telemetry.option") + " <a>${message("general.details")}</a>") {
                    BrowserUtil.open("https://docs.aws.amazon.com/sdkref/latest/guide/support-maint-idetoolkits.html")
                }
            }

            row {
                cell(enableAutoUpdate).applyToComponent { this.isSelected = AwsSettings.getInstance().isAutoUpdateEnabled }
                text(message("aws.settings.auto_update.text"))
            }

            indent {
                row {
                    cell(enableAutoUpdateNotification).applyToComponent {
                        this.isSelected = AwsSettings.getInstance().isAutoUpdateNotificationEnabled
                    }.enabledIf(enableAutoUpdate.selected)
                    text(message("aws.settings.auto_update.notification_enable.text"))
                        .comment(message("aws.settings.auto_update.notification_enable.tooltip"))
                }
            }
        }
    }

    override fun isModified(): Boolean = getSamPathWithoutSpaces() != getSavedExecutablePath(samExecutableInstance, false) ||
        defaultRegionHandling.selectedItem != AwsSettings.getInstance().useDefaultCredentialRegion ||
        profilesNotification.selectedItem != AwsSettings.getInstance().profilesNotification ||
        enableTelemetry.isSelected != AwsSettings.getInstance().isTelemetryEnabled ||
        enableAutoUpdate.isSelected != AwsSettings.getInstance().isAutoUpdateEnabled ||
        enableAutoUpdateNotification.isSelected != AwsSettings.getInstance().isAutoUpdateNotificationEnabled

    override fun apply() {
        validateAndSaveCliSettings(
            samExecutablePath.textField as JBTextField,
            "sam",
            samExecutableInstance,
            getSavedExecutablePath(samExecutableInstance, false),
            getSamPathWithoutSpaces()
        )
        saveAwsSettings()
    }

    override fun reset() {
        val awsSettings = AwsSettings.getInstance()
        samExecutablePath.setText(getSavedExecutablePath(samExecutableInstance, false))
        enableTelemetry.isSelected = awsSettings.isTelemetryEnabled
        defaultRegionHandling.selectedItem = awsSettings.useDefaultCredentialRegion
        profilesNotification.selectedItem = awsSettings.profilesNotification
        enableAutoUpdate.isSelected = awsSettings.isAutoUpdateEnabled
        enableAutoUpdateNotification.isSelected = awsSettings.isAutoUpdateNotificationEnabled
    }

    override fun getDisplayName(): String = message("aws.settings.title.old")

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
        if (instance is ExecutableInstance.BadExecutable) {
            throw ConfigurationException(instance.validationError)
        }

        // We have validated so now we can set
        ExecutableManager.getInstance().setExecutablePath(executableType, path)
    }
    private fun saveAwsSettings() {
        val awsSettings = AwsSettings.getInstance()
        awsSettings.isTelemetryEnabled = enableTelemetry.isSelected
        awsSettings.useDefaultCredentialRegion = defaultRegionHandling.selectedItem as? UseAwsCredentialRegion ?: UseAwsCredentialRegion.Never
        awsSettings.profilesNotification = profilesNotification.selectedItem as? ProfilesNotification ?: ProfilesNotification.Always

        // Send telemetry if there's a change
        if (awsSettings.isAutoUpdateEnabled != enableAutoUpdate.isSelected) {
            val settingState = if (enableAutoUpdate.isSelected) "OPTIN" else "OPTOUT"
            AwsTelemetry.modifySetting(project = null, settingId = ID_AUTO_UPDATE, settingState = settingState)
        }
        if (awsSettings.isAutoUpdateNotificationEnabled != enableAutoUpdateNotification.isSelected) {
            val settingsState = if (enableAutoUpdateNotification.isSelected) "OPTIN" else "OPTOUT"
            AwsTelemetry.modifySetting(project = null, settingId = ID_AUTO_UPDATE_NOTIFY, settingState = settingsState)
        }
        awsSettings.isAutoUpdateEnabled = enableAutoUpdate.isSelected
        awsSettings.isAutoUpdateNotificationEnabled = enableAutoUpdateNotification.isSelected
    }

    private fun getSamPathWithoutSpaces() = StringUtil.nullize(samExecutablePath.text.trim { it <= ' ' })

    companion object {
        private const val SAM = "sam"
        private const val ID_AUTO_UPDATE = "autoUpdate"
        private const val ID_AUTO_UPDATE_NOTIFY = "autoUpdateNotification"
    }
}
