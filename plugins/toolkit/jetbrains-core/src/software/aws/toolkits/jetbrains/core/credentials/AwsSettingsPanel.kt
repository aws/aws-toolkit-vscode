// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.icons.AllIcons
import com.intellij.ide.DataManager
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.ListPopup
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory
import com.intellij.util.Consumer
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.core.coroutines.disposableCoroutineScope
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProviderListener
import software.aws.toolkits.resources.message
import java.awt.event.MouseEvent
import javax.swing.Icon

private const val WIDGET_ID = "AwsSettingsPanel"

class AwsSettingsPanelInstaller : StatusBarWidgetFactory {
    override fun getId(): String = WIDGET_ID

    override fun getDisplayName(): String = message("settings.title")

    override fun isAvailable(project: Project): Boolean = true

    override fun createWidget(project: Project): StatusBarWidget = AwsSettingsPanel(project)

    override fun disposeWidget(widget: StatusBarWidget) {
        Disposer.dispose(widget)
    }

    override fun canBeEnabledOn(statusBar: StatusBar): Boolean = true
}

private class AwsSettingsPanel(private val project: Project) :
    StatusBarWidget,
    StatusBarWidget.MultipleTextValuesPresentation,
    ConnectionSettingsStateChangeNotifier,
    ToolkitConnectionManagerListener {
    private val settingsSelector = ProjectLevelSettingSelector(project, ChangeSettingsMode.BOTH)
    private val accountSettingsManager = AwsConnectionManager.getInstance(project)
    private val connectionManager = ToolkitConnectionManager.getInstance(project)
    private lateinit var statusBar: StatusBar

    override fun ID(): String = WIDGET_ID

    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this

    override fun getTooltipText(): String {
        val displayMessage = when (val connection = connectionManager.activeConnection()) {
            null, is AwsConnectionManagerConnection -> accountSettingsManager.connectionState.displayMessage
            else -> connection.label
        }

        return "${message("settings.title")} [$displayMessage]"
    }

    override fun getSelectedValue(): String {
        if (!accountSettingsManager.connectionState.isTerminal) {
            return accountSettingsManager.connectionState.shortMessage
        }

        val currentProfileInvalid = accountSettingsManager.connectionState.let { it.isTerminal && it !is ConnectionState.ValidConnection }
        val invalidBearerConnections = lazyGetUnauthedBearerConnections()

        if (currentProfileInvalid || invalidBearerConnections.isNotEmpty()) {
            val numInvalid = invalidBearerConnections.size + if (currentProfileInvalid) 1 else 0
            if (numInvalid == 1) {
                invalidBearerConnections.firstOrNull()?.let {
                    return message("settings.statusbar.widget.format", message("settings.statusbar.widget.expired.1", it.label))
                }

                return message("settings.statusbar.widget.format", accountSettingsManager.connectionState.shortMessage)
            }

            return message("settings.statusbar.widget.format", message("settings.statusbar.widget.expired.n", numInvalid))
        }

        val totalConnections = ToolkitAuthManager.getInstance().listConnections().size + CredentialManager.getInstance().getCredentialIdentifiers().size
        if (totalConnections == 1) {
            val displayText = when (val connection = connectionManager.activeConnection()) {
                null -> message("settings.credentials.none_selected")
                is AwsConnectionManagerConnection -> accountSettingsManager.connectionState.shortMessage
                else -> connection.label
            }

            return message("settings.statusbar.widget.format", displayText)
        }

        return message("settings.statusbar.widget.format", message("settings.statusbar.widget.connections.n", totalConnections))
    }

    override fun getPopupStep(): ListPopup = settingsSelector.createPopup(DataManager.getInstance().getDataContext(statusBar.component))

    override fun getClickConsumer(): Consumer<MouseEvent>? = null

    override fun install(statusBar: StatusBar) {
        this.statusBar = statusBar
        project.messageBus.connect(this).subscribe(AwsConnectionManager.CONNECTION_SETTINGS_STATE_CHANGED, this)
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(ToolkitConnectionManagerListener.TOPIC, this)
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            BearerTokenProviderListener.TOPIC,
            object : BearerTokenProviderListener {
                override fun onChange(providerId: String) {
                    updateWidget()
                }

                override fun invalidate(providerId: String) {
                    updateWidget()
                }
            }
        )

        updateWidget()

        // ideally should be through notification bus. instead we simulate the update() method used by the actions
        disposableCoroutineScope(this, "AwsSettingsPanel icon update loop").launch {
            while (isActive) {
                updateWidget()
                delay(10000)
            }
        }
    }

    override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
        updateWidget()
    }

    override fun settingsStateChanged(newState: ConnectionState) {
        updateWidget()
    }

    private fun updateWidget() {
        statusBar.updateWidget(ID())
    }

    override fun getIcon(): Icon? =
        if (lazyGetUnauthedBearerConnections().isNotEmpty()) {
            AllIcons.General.Warning
        } else {
            null
        }

    override fun dispose() {}
}
