// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.webview

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.util.Disposer
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.components.panels.Wrapper
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.gridLayout.HorizontalAlign
import com.intellij.ui.dsl.gridLayout.VerticalAlign
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefBrowserBuilder
import com.intellij.ui.jcef.JBCefJSQuery
import org.cef.CefApp
import software.aws.toolkits.jetbrains.core.WebviewResourceHandlerFactory
import software.aws.toolkits.jetbrains.isDeveloperMode
import java.awt.event.ActionListener
import java.util.function.Function
import javax.swing.JButton
import javax.swing.JComponent

// This action is used to open the Q webview  development mode.
class OpenToolkitWebviewAction : DumbAwareAction("View Toolkit Webview") {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return

        WebviewDialog(project).showAndGet()
    }

    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = isDeveloperMode()
    }
}

private class WebviewDialog(private val project: Project) : DialogWrapper(project) {

    init {
        title = "Toolkit-Login-Webview"
        init()
    }

    override fun createCenterPanel(): JComponent = ToolkitWebviewPanel(project).component
}

// TODO: STILL WIP thus duplicate code / pending move to plugins/toolkit
class ToolkitWebviewBrowser(val project: Project) {
    val jcefBrowser: JBCefBrowserBase by lazy {
        val client = JBCefApp.getInstance().createClient()

        Disposer.register(project, client)

        JBCefBrowserBuilder()
            .setClient(client)
            .setOffScreenRendering(true)
            .build()
    }

    val query = JBCefJSQuery.create(jcefBrowser)

    fun init() {
        CefApp.getInstance()
            .registerSchemeHandlerFactory(
                "http",
                ToolkitWebviewBrowser.DOMAIN,
                WebviewResourceHandlerFactory(
                    domain = "http://$DOMAIN/",
                    assetUri = "/webview/assets/"
                ),
            )

        loadWebView()

        val handler = Function<String, JBCefJSQuery.Response> {
            val command = jacksonObjectMapper().readTree(it).get("command").asText()
            println("command received from the browser: $command")

            null
        }

        query.addHandler(handler)
    }

    fun component(): JComponent? = jcefBrowser.component

    private fun loadWebView() {
        // load the web app
        jcefBrowser.loadHTML(getWebviewHTML())
    }

    private fun getWebviewHTML(): String {
        val colorMode = if (JBColor.isBright()) "jb-light" else "jb-dark"
        val postMessageToJavaJsCode = query.inject("JSON.stringify(message)")

        val jsScripts = """
            <script type="text/javascript" src="$WEB_SCRIPT_URI"></script>
            <script>
                (function() {
                    window.ideApi = {
                     postMessage: message => {
                         $postMessageToJavaJsCode
                     }
                };
                }())
            </script>
        """.trimIndent()

        return """
            <!DOCTYPE html>
            <html>
                <head>
                    <title>AWS Q</title>
                </head>
                <body class="$colorMode">
                    <div id="app"></div>
                    $jsScripts
                </body>
            </html>
        """.trimIndent()
    }

    companion object {
        private const val WEB_SCRIPT_URI = "http://webview/js/toolkitGetStart.js"
        private const val DOMAIN = "webview"
    }
}

class ToolkitWebviewPanel(val project: Project) {
    private val webviewContainer = Wrapper()
    var browser: ToolkitWebviewBrowser? = null
        private set

    val component = panel {
        row {
            cell(webviewContainer)
                .horizontalAlign(HorizontalAlign.FILL)
                .verticalAlign(VerticalAlign.FILL)
        }.resizableRow()

        row {
            cell(
                JButton("Show Web Debugger").apply {
                    addActionListener(
                        ActionListener {
                            browser?.jcefBrowser?.openDevtools()
                        },
                    )
                },
            )
                .horizontalAlign(HorizontalAlign.CENTER)
                .verticalAlign(VerticalAlign.BOTTOM)
        }
    }

    init {
        if (!JBCefApp.isSupported()) {
            // Fallback to an alternative browser-less solution
            webviewContainer.add(JBTextArea("JCEF not supported"))
            browser = null
        } else {
            browser = ToolkitWebviewBrowser(project).also {
                webviewContainer.add(it.component())
                it.init()
            }
        }
    }
}
