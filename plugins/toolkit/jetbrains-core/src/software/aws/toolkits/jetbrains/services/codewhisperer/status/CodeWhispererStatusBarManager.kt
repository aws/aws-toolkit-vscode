// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.status

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.StatusBarWidgetFactory
import com.intellij.openapi.wm.impl.status.widget.StatusBarWidgetSettings
import com.intellij.openapi.wm.impl.status.widget.StatusBarWidgetsManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManagerListener
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.credentials.pinning.ConnectionPinningManagerListener
import software.aws.toolkits.jetbrains.core.credentials.pinning.FeatureWithPinnedConnection
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererEnabled

/**
 * Manager visibility of CodeWhisperer status bar widget, only display it when CodeWhisperer is connected
 */
@Service(Service.Level.PROJECT)
class CodeWhispererStatusBarManager(private val project: Project) : Disposable {
    private val widgetsManager = project.getService(StatusBarWidgetsManager::class.java)
    private val settings = ApplicationManager.getApplication().getService(StatusBarWidgetSettings::class.java)

    init {
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            ToolkitConnectionManagerListener.TOPIC,
            object : ToolkitConnectionManagerListener {
                override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
                    updateWidget()
                }
            }
        )

        project.messageBus.connect().subscribe(
            ConnectionPinningManagerListener.TOPIC,
            object : ConnectionPinningManagerListener {
                override fun pinnedConnectionChanged(feature: FeatureWithPinnedConnection, newConnection: ToolkitConnection?) {
                    if (feature !is CodeWhispererConnection) return
                    updateWidget()
                }
            }
        )
    }

    fun updateWidget() {
        ExtensionPointName<StatusBarWidgetFactory>("com.intellij.statusBarWidgetFactory").extensionList.find {
            it.id == CodeWhispererStatusBarWidgetFactory.ID
        }?.let {
            settings.setEnabled(it, isCodeWhispererEnabled(project))
            widgetsManager.updateWidget(it)
        }
    }

    override fun dispose() {}

    companion object {
        fun getInstance(project: Project): CodeWhispererStatusBarManager = project.service()
    }
}
