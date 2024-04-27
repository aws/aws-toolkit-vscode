// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.startup

import com.intellij.ide.BrowserUtil
import com.intellij.ide.plugins.PluginManagerConfigurable
import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.ide.plugins.PluginManagerMain
import com.intellij.notification.NotificationAction
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.credentials.pinning.QConnection
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.settings.AwsSettings
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.AwsToolkitBundle.message
import java.net.URI
import java.util.concurrent.atomic.AtomicBoolean

class QMigrationActivity : StartupActivity.DumbAware {
    private val qMigrationShownOnce = AtomicBoolean(false)

    override fun runActivity(project: Project) {
        if (!qMigrationShownOnce.getAndSet(true)) {
            displayQMigrationInfo(project)
        }
    }

    // For the Q migration notification, we want to notify it only once the first time user has updated Toolkit,
    // if we have detected Q is not yet installed.
    // Check the user's current connection, if it contains CW or Q, auto-install for them, if they don't have one,
    // it means they have not used CW or Q before so show the opt-in/install notification for them.
    private fun displayQMigrationInfo(project: Project) {
        if (AwsSettings.getInstance().isQMigrationNotificationShownOnce) return

        val hasUsedCodeWhisperer = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance()) != null
        val hasUsedQ = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(QConnection.getInstance()) != null
        if (hasUsedCodeWhisperer || hasUsedQ) {
            // do auto-install
            installQPlugin(project, autoInstall = true)
        } else {
            // show opt-in/install notification
            notifyInfo(
                // TODO: change text
                title = message("aws.q.migration.new_users.notify.title"),
                content = message("aws.q.migration.new_users.notify.message"),
                project = project,
                notificationActions = listOf(
                    NotificationAction.createSimple(message("aws.q.migration.action.read_more.text")) {
                        // TODO: open url
                    },
                    NotificationAction.createSimpleExpiring(message("aws.q.migration.action.install.text")) {
                        installQPlugin(project, autoInstall = false)
                    }
                )
            )
        }
        AwsSettings.getInstance().isQMigrationNotificationShownOnce = true
    }

    private fun installQPlugin(project: Project, autoInstall: Boolean) {
        val qPluginId = PluginId.getId(AwsToolkit.Q_PLUGIN_ID)
        if (PluginManagerCore.isPluginInstalled(qPluginId)) {
            LOG.debug { "Amazon Q plugin is already installed, not performing migration" }
            return
        }

        ProgressManager.getInstance().run(
            // TODO: change title
            object : Task.Backgroundable(project, "Installing Amazon Q...") {
                override fun run(indicator: ProgressIndicator) {
                    val succeeded = lookForPluginToInstall(PluginId.getId(AwsToolkit.Q_PLUGIN_ID), indicator)
                    if (succeeded) {
                        if (!autoInstall) {
                            PluginManagerMain.notifyPluginsUpdated(project)
                        } else {
                            notifyInfo(
                                title = message("aws.q.migration.existing_users.notify.title"),
                                content = message("aws.q.migration.existing_users.notify.message"),
                                project = project,
                                // TODO: change text
                                notificationActions = listOf(
                                    NotificationAction.createSimple(message("aws.q.migration.action.read_more.text")) {
                                        BrowserUtil.browse(URI(CodeWhispererConstants.Q_MARKETPLACE_URI))
                                    },
                                    NotificationAction.createSimple(message("aws.q.migration.action.manage_plugins.text")) {
                                        ShowSettingsUtil.getInstance().showSettingsDialog(
                                            project,
                                            PluginManagerConfigurable::class.java
                                        ) { configurable: PluginManagerConfigurable ->
                                            configurable.openMarketplaceTab("Amazon Q")
                                        }
                                    },
                                    NotificationAction.createSimpleExpiring(message("aws.q.migration.action.restart.text")) {
                                        ApplicationManager.getApplication().restart()
                                    },
                                )
                            )
                        }
                    } else {
                        notifyError(
                            title = message("aws.q.migration.failed_to_install.message"),
                            project = project,
                            notificationActions = listOf(
                                NotificationAction.createSimpleExpiring(message("aws.q.migration.action.manage_plugins.text")) {
                                    // TODO: change search text
                                    ShowSettingsUtil.getInstance().showSettingsDialog(
                                        project,
                                        PluginManagerConfigurable::class.java
                                    ) { configurable: PluginManagerConfigurable ->
                                        configurable.openMarketplaceTab("Amazon Q")
                                    }
                                }
                            )
                        )
                    }
                }
            }
        )
    }

    companion object {
        private val LOG = getLogger<QMigrationActivity>()
    }
}
