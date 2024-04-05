// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.JBColor
import com.intellij.ui.components.panels.Wrapper
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.gridLayout.HorizontalAlign
import com.intellij.ui.dsl.gridLayout.VerticalAlign
import com.intellij.ui.jcef.JBCefJSQuery
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.cef.CefApp
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.network.CefRequest
import software.aws.toolkits.core.credentials.ToolkitBearerTokenProvider
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.credentials.ManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.credentials.loginSso
import software.aws.toolkits.jetbrains.core.credentials.sono.CODEWHISPERER_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.Q_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.Q_SCOPES_UNAVAILABLE_BUILDER_ID
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_REGION
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.credentials.sso.Authorization
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.InteractiveBearerTokenProvider
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.isDeveloperMode
import software.aws.toolkits.jetbrains.services.amazonq.util.createBrowser
import software.aws.toolkits.jetbrains.services.amazonq.webview.AssetResourceHandler
import software.aws.toolkits.telemetry.AwsTelemetry
import software.aws.toolkits.telemetry.CredentialType
import software.aws.toolkits.telemetry.Result
import java.awt.event.ActionListener
import java.io.IOException
import java.util.function.Function
import javax.swing.JButton
import javax.swing.JComponent
import kotlin.random.Random

// This action is used to open the Q webview  development mode.
class OpenAmazonQAction : DumbAwareAction("View Q Webview") {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return

        QWebviewDialog(project).showAndGet()
    }

    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = isDeveloperMode()
    }
}

class QWebviewDialog(private val project: Project) : DialogWrapper(project) {

    init {
        title = "Q-Login-Webview"
        init()
    }

    override fun createCenterPanel(): JComponent = WebviewPanel(project).component
}

class WebviewPanel(val project: Project) {
    private val webviewContainer = Wrapper()
    val browser: WebviewBrowser = WebviewBrowser(project).apply {
        this.init()
    }.also {
        webviewContainer.add(it.component())
    }

    val component = panel {
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

class WebviewBrowser(val project: Project) {
    val jcefBrowser = createBrowser(project)
    val query = JBCefJSQuery.create(jcefBrowser)

    fun init() {
        CefApp.getInstance()
            .registerSchemeHandlerFactory(
                "http",
                "q-webview",
                MyAssetResourceHandler.MyAssetResourceHandlerFactory(),
            )

        loadWebView()

        val handler = Function<String, JBCefJSQuery.Response> {
            val command = jacksonObjectMapper().readTree(it).get("command").asText()
            println("command received from the browser: $command")

            when (command) {
                "fetchSsoRegion" -> {
                    val regions = AwsRegionProvider.getInstance().allRegionsForService("sso").values
                    val json = jacksonObjectMapper().writeValueAsString(regions)
                    jcefBrowser.cefBrowser.executeJavaScript(
                        "window.ideClient.updateSsoRegions($json)",
                        jcefBrowser.cefBrowser.url,
                        0
                    )

                    // seems we're not able to send the return value back to the JS code
                    // https://intellij-support.jetbrains.com/hc/en-us/community/posts/16846628651538-idea-plugin-jbCefJSQuery-return-undefined
//                    return@Function Response(json)
                }

                "loginBuilderId" -> {
                    println("log in with builder id........")
                    val scope = CODEWHISPERER_SCOPES + Q_SCOPES - Q_SCOPES_UNAVAILABLE_BUILDER_ID.toSet()
                    runInEdt {
                        projectCoroutineScope(project).launch {
                            pollForAuthorizationCode(SONO_URL, SONO_REGION)
                        }
                        val conn = loginSso(project, SONO_URL, SONO_REGION, scope)
                        println("loginSso returned, ${conn.state().name}")
                        jcefBrowser.cefBrowser.executeJavaScript(
                            "window.ideClient.reset()",
                            jcefBrowser.cefBrowser.url,
                            0
                        )
                    }
                }

                "loginIdC" -> {
                    val url = jacksonObjectMapper().readTree(it).get("url").asText()
                    val region = jacksonObjectMapper().readTree(it).get("region").asText()
                    println(
                        "log in with idc........" +
                            "region: $region" +
                            "url: $url"
                    )

                    val scope = CODEWHISPERER_SCOPES + Q_SCOPES
                    projectCoroutineScope(project).launch {
                        pollForAuthorizationCode(url, region)
                    }
                    runInEdt {
                        loginSso(project, url, region, scope)
                        jcefBrowser.cefBrowser.executeJavaScript(
                            "window.ideClient.reset()",
                            jcefBrowser.cefBrowser.url,
                            0
                        )
                    }
                }

                "cancelLogin" -> {
                    println("cancel login........")
                    // TODO: BearerToken vs. SsoProfile
                    AwsTelemetry.loginWithBrowser(project = null, result = Result.Cancelled, credentialType = CredentialType.BearerToken)
                }

                else -> {
                    println("received unknown command from the browser: $command")
                }
            }

            null
        }

        query.addHandler(handler)
    }

    fun component() = jcefBrowser.component

    private suspend fun pollForAuthorizationCode(url: String, region: String): Authorization? {
        val factor = 2
        val maxBackoffMillis = 10000L
        val timeoutMillis = 50000L

        val startTime = System.currentTimeMillis()
        var nextDelay = 1L

        while (true) {
            try {
                val authManager = ToolkitAuthManager.getInstance()
                val connectionId = ToolkitBearerTokenProvider.ssoIdentifier(url, region)
                val conn = authManager.getConnection(connectionId)

                val authorization = if (conn != null) {
                    (conn as ManagedBearerSsoConnection).getConnectionSettings().tokenProvider.delegate.let {
                        (it as InteractiveBearerTokenProvider).pendingAuthorization
                    }
                } else {
                    null
                }

                // if there is pending connection working in progress, try read authorization
                if (authorization != null) {
                    jcefBrowser.cefBrowser.executeJavaScript(
                        "window.ideClient.updateAuthorization(\"${authorization.userCode}\")",
                        jcefBrowser.cefBrowser.url,
                        0
                    )

                    return authorization
                }

                val elapsed = System.currentTimeMillis() - startTime
                if (elapsed >= timeoutMillis) {
                    return null
                }

                val backoffTime = Random.nextLong(0, nextDelay.coerceAtMost(maxBackoffMillis))
                delay(backoffTime)

                nextDelay = (nextDelay * factor).coerceAtMost(maxBackoffMillis)
            } catch (e: Exception) {
                throw e
            }
        }
    }

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
