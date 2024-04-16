// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.startup

import com.intellij.codeInsight.lookup.LookupManagerListener
import com.intellij.notification.NotificationAction
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.invokeLater
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.explorer.refreshCwQTree
import software.aws.toolkits.jetbrains.core.plugins.ToolkitUpdateManager
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanManager
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererModelConfigurator
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererEnabled
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererExpired
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isUserBuilderId
import software.aws.toolkits.jetbrains.services.codewhisperer.importadder.CodeWhispererImportAdderListener
import software.aws.toolkits.jetbrains.services.codewhisperer.popup.CodeWhispererPopupManager.Companion.CODEWHISPERER_USER_ACTION_PERFORMED
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererFeatureConfigService
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.FEATURE_CONFIG_POLL_INTERVAL_IN_MS
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.notifyErrorAccountless
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.notifyWarnAccountless
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.promptReAuth
import software.aws.toolkits.jetbrains.services.codewhisperer.util.calculateIfIamIdentityCenterConnection
import software.aws.toolkits.jetbrains.settings.AwsSettings
import software.aws.toolkits.jetbrains.settings.AwsSettingsConfigurable
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Component
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.ToolkitTelemetry
import java.time.LocalDateTime
import java.util.Date
import java.util.Timer
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.schedule

// TODO: add logics to check if we want to remove recommendation suspension date when user open the IDE
class CodeWhispererProjectStartupActivity : StartupActivity.DumbAware {
    private var runOnce = false
    private val autoUpdateRunOnce = AtomicBoolean(false)

    /**
     * Should be invoked when
     * (1) new users accept CodeWhisperer ToS (have to be triggered manually))
     * (2) existing users open the IDE (automatically triggered)
     */
    override fun runActivity(project: Project) {
        // We want the auto-update feature to be triggered only once per running application
        if (!autoUpdateRunOnce.getAndSet(true)) {
            ToolkitUpdateManager.getInstance()
            if (!AwsSettings.getInstance().isAutoUpdateFeatureNotificationShownOnce) {
                notifyAutoUpdateFeature(project)
                AwsSettings.getInstance().isAutoUpdateFeatureNotificationShownOnce = true
            }
        }

        if (!isCodeWhispererEnabled(project)) return
        if (runOnce) return

        // Reconnect CodeWhisperer on startup
        promptReAuth(project, isPluginStarting = true)
        if (isCodeWhispererExpired(project)) return

        // Init featureConfig job
        initFeatureConfigPollingJob(project)

        calculateIfIamIdentityCenterConnection(project) {
            ApplicationManager.getApplication().executeOnPooledThread {
                CodeWhispererModelConfigurator.getInstance().listCustomizations(project, passive = true)
            }
        }

        // install intellsense autotrigger listener, this only need to be executed once
        project.messageBus.connect().subscribe(LookupManagerListener.TOPIC, CodeWhispererIntelliSenseAutoTriggerListener)
        project.messageBus.connect().subscribe(CODEWHISPERER_USER_ACTION_PERFORMED, CodeWhispererImportAdderListener)

        // show notification to accountless users
        showAccountlessNotificationIfNeeded(project)

        //  Run Proactive Code File Scan and disabling Auto File Scan for Builder Id Users.
        if (isUserBuilderId(project)) {
            CodeWhispererExplorerActionManager.getInstance().setAutoCodeScan(project, false)
        } else {
            CodeWhispererCodeScanManager.getInstance(project).debouncedRunCodeScan(CodeWhispererConstants.SecurityScanType.FILE)
            runOnce = true
        }
    }

    private fun notifyAutoUpdateFeature(project: Project) {
        notifyInfo(
            title = message("aws.notification.auto_update.feature_intro.title"),
            project = project,
            notificationActions = listOf(
                NotificationAction.createSimpleExpiring(message("aws.notification.auto_update.feature_intro.ok")) {},
                NotificationAction.createSimple(message("aws.notification.auto_update.settings.title")) {
                    ToolkitTelemetry.invokeAction(
                        project = null,
                        result = Result.Succeeded,
                        id = ToolkitUpdateManager.ID_ACTION_AUTO_UPDATE_SETTINGS,
                        source = ToolkitUpdateManager.SOURCE_AUTO_UPDATE_FEATURE_INTRO_NOTIFY,
                        component = Component.Filesystem
                    )
                    ShowSettingsUtil.getInstance().showSettingsDialog(project, AwsSettingsConfigurable::class.java)
                }
            )
        )
    }

    private fun showAccountlessNotificationIfNeeded(project: Project) {
        if (CodeWhispererExplorerActionManager.getInstance().checkActiveCodeWhispererConnectionType(project) == CodeWhispererLoginType.Accountless) {
            // simply show a notification when user login with Accountless, and it's still supported by CodeWhisperer
            if (!isExpired()) {
                // don't show warn notification if user selected Don't show again or if notification was shown less than a week ago
                if (!timeToShowAccessTokenWarn() || CodeWhispererExplorerActionManager.getInstance().getDoNotShowAgainWarn()) {
                    return
                }
                notifyWarnAccountless()
                CodeWhispererExplorerActionManager.getInstance().setAccountlessNotificationWarnTimestamp()

                // to handle the case when user open the IDE when Accountless not yet expired but expire soon e.g. 30min etc.
                Timer().schedule(CodeWhispererConstants.EXPIRE_DATE) { notifyErrorAndDisableAccountless(project) }
            } else {
                if (!timeToShowAccessTokenError() || CodeWhispererExplorerActionManager.getInstance().getDoNotShowAgainError()) {
                    return
                }
                CodeWhispererExplorerActionManager.getInstance().setAccountlessNotificationErrorTimestamp()
                notifyErrorAndDisableAccountless(project)
            }
        } else if (CodeWhispererExplorerActionManager.getInstance().getAccountlessNullified()) {
            if (!timeToShowAccessTokenError() || CodeWhispererExplorerActionManager.getInstance().getDoNotShowAgainError()) {
                return
            }
            CodeWhispererExplorerActionManager.getInstance().setAccountlessNotificationErrorTimestamp()
            notifyErrorAndDisableAccountless(project)
        }
    }

    private fun notifyErrorAndDisableAccountless(project: Project) {
        // show an error and deactivate CW when user login with Accountless, and it already expired
        notifyErrorAccountless()
        CodeWhispererExplorerActionManager.getInstance().nullifyAccountlessCredentialIfNeeded()
        invokeLater { project.refreshCwQTree() }
    }

    private fun timeToShowAccessTokenWarn(): Boolean {
        val lastShown = CodeWhispererExplorerActionManager.getInstance().getAccountlessWarnNotificationTimestamp()
        return lastShown?.let {
            val parsedLastShown = LocalDateTime.parse(lastShown, CodeWhispererConstants.TIMESTAMP_FORMATTER)
            parsedLastShown.plusDays(7) <= LocalDateTime.now()
        } ?: true
    }

    private fun timeToShowAccessTokenError(): Boolean {
        val lastShown = CodeWhispererExplorerActionManager.getInstance().getAccountlessErrorNotificationTimestamp()
        return lastShown?.let {
            val parsedLastShown = LocalDateTime.parse(lastShown, CodeWhispererConstants.TIMESTAMP_FORMATTER)
            parsedLastShown.plusDays(7) <= LocalDateTime.now()
        } ?: true
    }

    // Start a job that runs every 30 mins
    private fun initFeatureConfigPollingJob(project: Project) {
        projectCoroutineScope(project).launch {
            while (isActive) {
                CodeWhispererFeatureConfigService.getInstance().fetchFeatureConfigs(project)
                delay(FEATURE_CONFIG_POLL_INTERVAL_IN_MS)
            }
        }
    }
}

// TODO: do we have time zone issue with Date?
private fun isExpired() = CodeWhispererConstants.EXPIRE_DATE.before(Date())
