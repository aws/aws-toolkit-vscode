// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.startup

import com.intellij.ide.plugins.IdeaPluginDescriptor
import com.intellij.ide.plugins.InstalledPluginsState
import com.intellij.notification.NotificationAction
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.service
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.updateSettings.impl.PluginDownloader
import com.intellij.openapi.updateSettings.impl.PluginDownloader.compareVersionsSkipBrokenAndIncompatible
import com.intellij.openapi.updateSettings.impl.UpdateChecker
import com.intellij.util.Alarm
import com.intellij.util.concurrency.annotations.RequiresBackgroundThread
import org.jetbrains.annotations.VisibleForTesting
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.settings.AwsSettings
import software.aws.toolkits.jetbrains.settings.AwsSettingsConfigurable
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Component
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.ToolkitTelemetry

// TODO: Still need to keep one for toolkit standalone
class QPluginUpdateManager {
    private val alarm = Alarm(Alarm.ThreadToUse.SWING_THREAD)

    init {
        runTask()
    }

    @VisibleForTesting
    internal fun runTask() {
        if (alarm.isDisposed) return
        scheduleUpdateTask()

        val enabled = AwsSettings.getInstance().isAutoUpdateEnabled
        LOG.debug { "AWS Toolkit checking for new updates. Auto update enabled: $enabled" }

        if (!enabled) return

        runInEdt {
            ProgressManager.getInstance().run(
                object : Task.Backgroundable(null, message("aws.settings.auto_update.progress.message")) {
                    override fun run(indicator: ProgressIndicator) {
                        checkForUpdates(indicator)
                    }
                }
            )
        }
    }

    private fun scheduleUpdateTask() {
        alarm.addRequest({ runTask() }, UPDATE_CHECK_INTERVAL_IN_MS)
    }

    @RequiresBackgroundThread
    fun checkForUpdates(progressIndicator: ProgressIndicator) {
        // Note: This will need to handle exceptions and ensure thread-safety
        try {
            // wasUpdatedWithRestart means that, it was an update and it needs to restart to apply
            if (InstalledPluginsState.getInstance().wasUpdatedWithRestart(PluginId.getId(AwsToolkit.Q_PLUGIN_ID))) {
                LOG.debug { "AWS Toolkit was recently updated and needed restart, not performing auto-update again" }
                return
            }

            val toolkitPlugin = AwsToolkit.Q_DESCRIPTOR as IdeaPluginDescriptor? ?: return
            if (toolkitPlugin.version.contains("SNAPSHOT", ignoreCase = true)) {
                LOG.debug { "AWS Toolkit is a SNAPSHOT version, not performing auto-update" }
                return
            }
            if (!toolkitPlugin.isEnabled) {
                LOG.debug { "AWS Toolkit is disabled, not performing auto-update" }
                return
            }
            LOG.debug { "Current version: ${toolkitPlugin.version}" }
            val latestToolkitPluginDownloader = getUpdate(toolkitPlugin)
            if (latestToolkitPluginDownloader == null) {
                LOG.debug { "No newer version found, not performing auto-update" }
                return
            } else {
                LOG.debug { "Found newer version: ${latestToolkitPluginDownloader.pluginVersion}" }
            }

            if (!latestToolkitPluginDownloader.prepareToInstall(progressIndicator)) return
            latestToolkitPluginDownloader.install()
            ToolkitTelemetry.showAction(
                project = null,
                success = true,
                id = SOURCE_AUTO_UPDATE_FINISH_NOTIFY,
                source = SOURCE_AUTO_UPDATE_FINISH_NOTIFY,
                component = Component.Filesystem
            )
        } catch (e: Exception) {
            LOG.debug(e) { "Unable to update AWS Toolkit" }
            ToolkitTelemetry.showAction(
                project = null,
                success = false,
                id = SOURCE_AUTO_UPDATE_FINISH_NOTIFY,
                source = SOURCE_AUTO_UPDATE_FINISH_NOTIFY,
                component = Component.Filesystem,
                reason = e.message
            )
            return
        } catch (e: Error) {
            // Handle cases like NoSuchMethodError when the API is not available in certain versions
            LOG.debug(e) { "Unable to update AWS Toolkit" }
            ToolkitTelemetry.showAction(
                project = null,
                success = false,
                id = SOURCE_AUTO_UPDATE_FINISH_NOTIFY,
                source = SOURCE_AUTO_UPDATE_FINISH_NOTIFY,
                component = Component.Filesystem,
                reason = e.message
            )
            return
        }
        if (!AwsSettings.getInstance().isAutoUpdateNotificationEnabled) return
        notifyInfo(
            title = message("aws.notification.auto_update.title"),
            content = message("aws.settings.auto_update.notification.message"),
            project = null,
            notificationActions = listOf(
                NotificationAction.createSimpleExpiring(message("aws.settings.auto_update.notification.yes")) {
                    ToolkitTelemetry.invokeAction(
                        project = null,
                        result = Result.Succeeded,
                        id = "autoUpdateActionRestart",
                        source = SOURCE_AUTO_UPDATE_FINISH_NOTIFY,
                        component = Component.Filesystem
                    )
                    ApplicationManager.getApplication().restart()
                },
                NotificationAction.createSimpleExpiring(message("aws.settings.auto_update.notification.no")) {
                    ToolkitTelemetry.invokeAction(
                        project = null,
                        result = Result.Succeeded,
                        id = "autoUpdateActionNotNow",
                        source = SOURCE_AUTO_UPDATE_FINISH_NOTIFY,
                        component = Component.Filesystem
                    )
                },
                NotificationAction.createSimple(message("aws.notification.auto_update.settings.title")) {
                    ToolkitTelemetry.invokeAction(
                        project = null,
                        result = Result.Succeeded,
                        id = ID_ACTION_AUTO_UPDATE_SETTINGS,
                        source = SOURCE_AUTO_UPDATE_FINISH_NOTIFY,
                        component = Component.Filesystem
                    )
                    ShowSettingsUtil.getInstance().showSettingsDialog(null, AwsSettingsConfigurable::class.java)
                }
            )
        )
    }

    @VisibleForTesting
    internal fun getUpdate(pluginDescriptor: IdeaPluginDescriptor): PluginDownloader? =
        getUpdateInfo().firstOrNull {
            it.id == pluginDescriptor.pluginId &&
                compareVersionsSkipBrokenAndIncompatible(it.pluginVersion, pluginDescriptor) > 0
        }

    // TODO: Optimize this to only search the result for AWS Toolkit
    @VisibleForTesting
    internal fun getUpdateInfo(): Collection<PluginDownloader> = UpdateChecker.getPluginUpdates() ?: emptyList()

    companion object {
        fun getInstance(): QPluginUpdateManager = service()
        private val LOG = getLogger<QPluginUpdateManager>()
        private const val UPDATE_CHECK_INTERVAL_IN_MS = 4 * 60 * 60 * 1000 // 4 hours
        private const val SOURCE_AUTO_UPDATE_FINISH_NOTIFY = "autoUpdateFinishNotification"
        const val SOURCE_AUTO_UPDATE_FEATURE_INTRO_NOTIFY = "autoUpdateFeatureIntroNotification"
        const val ID_ACTION_AUTO_UPDATE_SETTINGS = "autoUpdateActionSettings"
    }
}
