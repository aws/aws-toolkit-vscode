// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq

import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.components.panels.Wrapper
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.gridLayout.HorizontalAlign
import com.intellij.ui.dsl.gridLayout.VerticalAlign
import org.cef.CefApp
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.network.CefRequest
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.services.amazonq.util.createBrowser
import software.aws.toolkits.jetbrains.services.amazonq.webview.AssetResourceHandler
import java.awt.event.ActionListener
import java.io.IOException
import javax.swing.JButton
import javax.swing.JComponent

// This action is used to open the Q webview  development mode.
class OpenAmazonQAction : DumbAwareAction("View Q Webview") {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return

        QWebviewDialog(project).showAndGet()
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = AwsToolkit.isDeveloperMode()
    }
}

class QWebviewDialog(private val project: Project) : DialogWrapper(project) {

    init {
        title = "Q-Login-Webview"
        init()
    }


    override fun createCenterPanel(): JComponent = panel {
        val browser = WebviewBrowser(project).apply {
            this.init()
        }

        row {
            val wrapper = Wrapper().also {
                it.add(browser.component())
            }
            cell(wrapper)
                .horizontalAlign(HorizontalAlign.FILL)
                .verticalAlign(VerticalAlign.FILL)
        }.resizableRow()

        row {
            cell(
                JButton("Show Web Debugger").apply {
                    addActionListener(
                        ActionListener {
                            browser.jcefBrowser.openDevtools()
                        },
                    )
                },
            )
                .horizontalAlign(HorizontalAlign.CENTER)
                .verticalAlign(VerticalAlign.BOTTOM)
        }
    }
}

class WebviewBrowser(parent: Disposable) {
    val jcefBrowser = createBrowser(parent)

    fun init() {
        CefApp.getInstance()
            .registerSchemeHandlerFactory(
                "http",
                "q-webview",
                MyAssetResourceHandler.MyAssetResourceHandlerFactory(),
            )

        loadWebView()
    }

    fun component() = jcefBrowser.component

    private fun loadWebView() {
        // setup empty state. The message request handlers use this for storing state
        // that's persistent between page loads.
        jcefBrowser.setProperty("state", "")
        // load the web app
        jcefBrowser.loadHTML(getWebviewHTML())
    }

    private fun getWebviewHTML(): String {
        val jsScripts = """
            <script type="text/javascript" src="$WEB_SCRIPT_URI"></script>
        """.trimIndent()

        return """
            <!DOCTYPE html>
            <html>
                <head>
                    <title>AWS Q</title>
                </head>
                <body>
                    <div id="app"></div>
                    $jsScripts
                </body>
            </html>
        """.trimIndent()
    }

    companion object {
        private const val WEB_SCRIPT_URI = "http://q-webview/js/getStart.js"
    }
}

class MyAssetResourceHandler(data: ByteArray) : AssetResourceHandler(data) {
    class MyAssetResourceHandlerFactory : AssetResourceHandler.AssetResourceHandlerFactory() {
        override fun create(
            browser: CefBrowser?,
            frame: CefFrame?,
            schemeName: String?,
            request: CefRequest?,
        ): MyAssetResourceHandler? {
            val resourceUri = request?.url ?: return null
            if (!resourceUri.startsWith(LOCAL_RESOURCE_URL_PREFIX)) return null

            val resource = resourceUri.replace(LOCAL_RESOURCE_URL_PREFIX, "/q-webview/assets/")
            val resourceInputStream = this.javaClass.getResourceAsStream(resource)

            try {
                resourceInputStream.use {
                    if (resourceInputStream != null) {
                        return MyAssetResourceHandler(resourceInputStream.readAllBytes())
                    }
                    return null
                }
            } catch (e: IOException) {
                throw RuntimeException(e)
            }
        }
    }

    companion object {
        private const val LOCAL_RESOURCE_URL_PREFIX = "http://q-webview/"
    }
}
