// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.toolwindow

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManagerListener
import software.aws.toolkits.jetbrains.core.credentials.sono.CODEWHISPERER_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.Q_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.Q_SCOPES_UNAVAILABLE_BUILDER_ID
import software.aws.toolkits.jetbrains.core.credentials.sono.isSono
import software.aws.toolkits.jetbrains.core.webview.BrowserState
import software.aws.toolkits.jetbrains.services.amazonq.WebviewPanel
import software.aws.toolkits.jetbrains.services.amazonq.isQSupportedInThisVersion
import software.aws.toolkits.jetbrains.utils.isRunningOnRemoteBackend
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.FeatureId
import java.util.concurrent.atomic.AtomicBoolean

class AmazonQToolWindowFactory : ToolWindowFactory, DumbAware {
    private val isConnected = AtomicBoolean()

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val contentManager = toolWindow.contentManager

        project.messageBus.connect().subscribe(
            ToolkitConnectionManagerListener.TOPIC,
            object : ToolkitConnectionManagerListener {
                override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
                    onConnectionChanged(project, newConnection, toolWindow)
                }
            }
        )

        val hasConnection = isQConnected(project).also {
            isConnected.set(it)
        }
        val component = if (hasConnection) {
            AmazonQToolWindow.getInstance(project).component
        } else {
            WebviewPanel.getInstance(project).browser?.prepareBrowser(BrowserState(FeatureId.Q))
            WebviewPanel.getInstance(project).component
        }

        val content = contentManager.factory.createContent(component, null, false).also {
            it.isCloseable = true
            it.isPinnable = true
        }
        contentManager.addContent(content)
        toolWindow.activate(null)
        contentManager.setSelectedContent(content)
    }

    override fun init(toolWindow: ToolWindow) {
        toolWindow.stripeTitle = message("q.window.title")
    }

    override fun shouldBeAvailable(project: Project): Boolean = !isRunningOnRemoteBackend() && isQSupportedInThisVersion()

    private fun onConnectionChanged(project: Project, newConnection: ToolkitConnection?, toolWindow: ToolWindow) {
        val contentManager = toolWindow.contentManager
        val isQConnection = newConnection?.let {
            (it as? AwsBearerTokenConnection)?.let { conn ->
                val scopeShouldHave = if (it.isSono()) {
                    Q_SCOPES + CODEWHISPERER_SCOPES - Q_SCOPES_UNAVAILABLE_BUILDER_ID
                } else {
                    Q_SCOPES + CODEWHISPERER_SCOPES
                }

                LOG.debug { "newConnection: ${conn.id}; scope: ${conn.scopes}; scope must-have: $scopeShouldHave" }

                scopeShouldHave.all { s -> s in conn.scopes }
            } ?: false
        } ?: false

        val isQConnected = (isQConnection || isQConnected(project)).also {
            val old = isConnected.getAndSet(it)
            if (old == it) {
                return
            }
        }

        // isQConnected alone is not robust and there is race condition (read/update connection states)
        val component = if (isQConnected) {
            LOG.debug { "returning Q-chat window; isQConnection=$isQConnection; hasPinnedConnection=$isQConnection" }
            AmazonQToolWindow.getInstance(project).component
        } else {
            LOG.debug { "returning login window; no Q connection found" }
            WebviewPanel.getInstance(project).let {
                it.browser?.prepareBrowser(BrowserState(FeatureId.Q))
                it.component
            }
        }

        val content = contentManager.factory.createContent(component, null, false).also {
            it.isCloseable = true
            it.isPinnable = true
        }

        runInEdt {
            contentManager.removeAllContents(true)
            contentManager.addContent(content)
        }
    }

    companion object {
        private val LOG = getLogger<AmazonQToolWindowFactory>()
        const val WINDOW_ID = AMAZON_Q_WINDOW_ID
    }
}
