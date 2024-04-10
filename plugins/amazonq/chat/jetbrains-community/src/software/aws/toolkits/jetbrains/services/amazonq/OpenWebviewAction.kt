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
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.components.panels.Wrapper
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.gridLayout.HorizontalAlign
import com.intellij.ui.dsl.gridLayout.VerticalAlign
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefJSQuery
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import org.cef.CefApp
import software.aws.toolkits.core.credentials.ToolkitBearerTokenProvider
import software.aws.toolkits.jetbrains.core.WebviewResourceHandlerFactory
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.credentials.ManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
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
import software.aws.toolkits.telemetry.AwsTelemetry
import software.aws.toolkits.telemetry.CredentialType
import software.aws.toolkits.telemetry.Result
import java.awt.event.ActionListener
import java.util.function.Function
import javax.swing.JButton
import javax.swing.JComponent

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
    var browser: WebviewBrowser? = null
        private set

    val component = panel {
        row {
            cell(webviewContainer)
                .horizontalAlign(HorizontalAlign.FILL)
                .verticalAlign(VerticalAlign.FILL)
        }.resizableRow()

        if (isDeveloperMode()) {
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
    }

    init {
        if (!JBCefApp.isSupported()) {
            // Fallback to an alternative browser-less solution
            webviewContainer.add(JBTextArea("JCEF not supported"))
            browser = null
        } else {
            browser = WebviewBrowser(project).also {
                webviewContainer.add(it.component())
                it.init()
            }
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
                WebviewBrowser.DOMAIN,
                WebviewResourceHandlerFactory(
                    domain = "http://${WebviewBrowser.DOMAIN}/",
                    assetUri = "/webview/assets/"
                ),
            )

        loadWebView()
        var currentAuthorization: Authorization? = null

        val handler = Function<String, JBCefJSQuery.Response> {
            val command = jacksonObjectMapper().readTree(it).get("command").asText()
            println("command received from the browser: $command")

            when (command) {
                "fetchLastLoginIdcInfo" -> {
                    val lastLoginIdcInfo = ToolkitAuthManager.getInstance().getLastLoginIdcInfo()

                    val profileName = lastLoginIdcInfo.profileName
                    val startUrl = lastLoginIdcInfo.startUrl
                    val directoryId = extractDirectoryIdFromStartUrl(startUrl)
                    val region = lastLoginIdcInfo.region

                    jcefBrowser.cefBrowser.executeJavaScript(
                        "window.ideClient.updateLastLoginIdcInfo({" +
                            "profileName: \"$profileName\"," +
                            "directoryId: \"$directoryId\"," +
                            "region: \"$region\"})",
                        jcefBrowser.cefBrowser.url,
                        0
                    )
                }
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
                    val scope = CODEWHISPERER_SCOPES + Q_SCOPES - Q_SCOPES_UNAVAILABLE_BUILDER_ID.toSet()
                    runInEdt {
                        requestCredentialsForQ(
                            project,
                            Login.BuilderId(scope) {
                                projectCoroutineScope(project).launch {
                                    val conn = pollForConnection(ToolkitBearerTokenProvider.ssoIdentifier(SONO_URL, SONO_REGION))

                                    conn?.let { c ->
                                        val provider = (c as ManagedBearerSsoConnection).getConnectionSettings().tokenProvider.delegate
                                        val authorization = pollForAuthorization(provider as InteractiveBearerTokenProvider)

                                        if (authorization != null) {
                                            jcefBrowser.cefBrowser.executeJavaScript(
                                                "window.ideClient.updateAuthorization(\"${authorization.userCode}\")",
                                                jcefBrowser.cefBrowser.url,
                                                0
                                            )
                                            currentAuthorization = authorization

                                            return@launch
                                        }
                                    }
                                }
                            }
                        )
                    }
                }

                "loginIdC" -> {
                    val profileName = jacksonObjectMapper().readTree(it).get("profileName").asText()
                    val url = jacksonObjectMapper().readTree(it).get("url").asText()
                    val region = jacksonObjectMapper().readTree(it).get("region").asText()
                    val awsRegion = AwsRegionProvider.getInstance()[region] ?: return@Function null

                    val scope = CODEWHISPERER_SCOPES + Q_SCOPES
                    runInEdt {
                        requestCredentialsForQ(
                            project,
                            Login.IdC(profileName, url, awsRegion, scope) {
                                projectCoroutineScope(project).launch {
                                    val authorization = pollForAuthorization(it)
                                    if (authorization != null) {
                                        jcefBrowser.cefBrowser.executeJavaScript(
                                            "window.ideClient.updateAuthorization(\"${authorization.userCode}\")",
                                            jcefBrowser.cefBrowser.url,
                                            0
                                        )
                                        currentAuthorization = authorization
                                    }

                                    return@launch
                                }
                            }
                        )
                    }
                }

                "cancelLogin" -> {
                    println("cancel login........")
                    // TODO: BearerToken vs. SsoProfile
                    AwsTelemetry.loginWithBrowser(project = null, result = Result.Cancelled, credentialType = CredentialType.BearerToken)

                    // Essentially Authorization becomes a mutable that allows browser and auth to communicate canceled
                    // status. There might be a risk of race condition here by changing this global, for which effort
                    // has been made to avoid it (e.g. Cancel button is only enabled if Authorization has been given
                    // to browser.). The worst case is that the user will see a stale user code displayed, but not
                    // affecting the current login flow.
                    currentAuthorization?.isCanceled = true
                }

                else -> {
                    println("received unknown command from the browser: $command")
                }
            }

            null
        }

        query.addHandler(handler)
    }

    private fun extractDirectoryIdFromStartUrl(startUrl: String): String {
        val pattern = "https://(.*?).awsapps.com/start.*".toRegex()
        return pattern.matchEntire(startUrl)?.groupValues?.get(1).orEmpty()
    }

    fun component(): JComponent? = jcefBrowser.component

    private suspend fun <T> pollFor(func: () -> T): T? {
        val timeoutMillis = 50000L
        val factor = 2
        var nextDelay = 1L

        val result = withTimeoutOrNull(timeoutMillis) {
            while (true) {
                val result = func()
                if (result != null) {
                    return@withTimeoutOrNull result
                }

                delay(nextDelay)
                nextDelay *= factor
            }
            null
        }

        return result
    }

    private suspend fun pollForConnection(connectionId: String): ToolkitConnection? = pollFor {
        ToolkitAuthManager.getInstance().getConnection(connectionId)
    }

    private suspend fun pollForAuthorization(provider: InteractiveBearerTokenProvider): Authorization? = pollFor {
        provider.pendingAuthorization
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
        private const val WEB_SCRIPT_URI = "http://webview/js/getStart.js"
        private const val DOMAIN = "webview"
    }
}
