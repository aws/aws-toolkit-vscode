// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.components.panels.Wrapper
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.gridLayout.HorizontalAlign
import com.intellij.ui.dsl.gridLayout.VerticalAlign
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefJSQuery
import org.cef.CefApp
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.credentials.Login
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.credentials.sono.CODEWHISPERER_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.Q_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.Q_SCOPES_UNAVAILABLE_BUILDER_ID
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.core.webview.BrowserState
import software.aws.toolkits.jetbrains.core.webview.LoginBrowser
import software.aws.toolkits.jetbrains.core.webview.WebviewResourceHandlerFactory
import software.aws.toolkits.jetbrains.isDeveloperMode
import software.aws.toolkits.jetbrains.services.amazonq.util.createBrowser
import software.aws.toolkits.telemetry.AwsTelemetry
import software.aws.toolkits.telemetry.CredentialType
import software.aws.toolkits.telemetry.FeatureId
import software.aws.toolkits.telemetry.Result
import java.awt.event.ActionListener
import java.util.function.Function
import javax.swing.JButton
import javax.swing.JComponent

// TODO: remove by 4/30, only needed for dev purpose, and action registered in plugin-chat.xml
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

// TODO: remove by 4/30, only needed for dev purpose
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
            }
        }
    }

    companion object {
        fun getInstance(project: Project) = project.service<WebviewPanel>()
    }
}

class WebviewBrowser(val project: Project) : LoginBrowser(project, WebviewBrowser.DOMAIN) {
    // TODO: confirm if we need such configuration or the default is fine
    override val jcefBrowser = createBrowser(project)
    override val query = JBCefJSQuery.create(jcefBrowser)

    override val handler = Function<String, JBCefJSQuery.Response> {
        val jsonTree = objectMapper.readTree(it)
        val command = jsonTree.get("command").asText()
        LOG.debug { "Data received from Q browser: ${jsonTree.asText()}" }

        when (command) {
            "prepareUi" -> {
                this.prepareBrowser(BrowserState(FeatureId.Q, false))
            }

            "loginBuilderId" -> {
                val scope = CODEWHISPERER_SCOPES + Q_SCOPES - Q_SCOPES_UNAVAILABLE_BUILDER_ID.toSet()
                runInEdt {
                    Login.BuilderId(scope, onPendingAwsId).loginBuilderId(project)
                    // TODO: telemetry
                }
            }

            "loginIdC" -> {
                // TODO: make it type safe, maybe (de)serialize into a data class
                val profileName = jsonTree.get("profileName").asText()
                val url = jsonTree.get("url").asText()
                val region = jsonTree.get("region").asText()
                val awsRegion = AwsRegionProvider.getInstance()[region] ?: error("unknown region returned from Q browser")

                val scope = CODEWHISPERER_SCOPES + Q_SCOPES

                val onError: (String) -> Unit = { s ->
                    Messages.showErrorDialog(project, it, "Q Idc Login Failed")
                    // TODO: AuthTelemetry.addConnection
                }
                runInEdt {
                    Login.IdC(profileName, url, awsRegion, scope, onPendingProfile, onError).loginIdc(project)
                    // TODO: telemetry
                }
            }

            "cancelLogin" -> {
                // TODO: differentiate BearerToken vs. SsoProfile cred type
                AwsTelemetry.loginWithBrowser(project = null, result = Result.Cancelled, credentialType = CredentialType.BearerToken)

                // Essentially Authorization becomes a mutable that allows browser and auth to communicate canceled
                // status. There might be a risk of race condition here by changing this global, for which effort
                // has been made to avoid it (e.g. Cancel button is only enabled if Authorization has been given
                // to browser.). The worst case is that the user will see a stale user code displayed, but not
                // affecting the current login flow.
                currentAuthorization?.progressIndicator?.cancel()
            }

            else -> {
                error("received unknown command from Q browser: $command")
            }
        }

        null
    }

    init {
        CefApp.getInstance()
            .registerSchemeHandlerFactory(
                "http",
                domain,
                WebviewResourceHandlerFactory(
                    domain = "http://$domain/",
                    assetUri = "/webview/assets/"
                ),
            )

        loadWebView()

        query.addHandler(handler)
    }

    fun component(): JComponent? = jcefBrowser.component

    override fun prepareBrowser(state: BrowserState) {
        // previous login
        val lastLoginIdcInfo = ToolkitAuthManager.getInstance().getLastLoginIdcInfo()

        // available regions
        val regions = AwsRegionProvider.getInstance().allRegionsForService("sso").values.let {
            objectMapper.writeValueAsString(it)
        }

        val jsonData = """
            {
                stage: 'START',
                regions: $regions,
                idcInfo: {
                    profileName: '${lastLoginIdcInfo.profileName}',
                    startUrl: '${lastLoginIdcInfo.startUrl}',
                    region: '${lastLoginIdcInfo.region}'
                },
                cancellable: ${state.browserCancellable}
            }
        """.trimIndent()
        executeJS("window.ideClient.prepareUi($jsonData)")
    }

    override fun getWebviewHTML(): String {
        val colorMode = if (JBColor.isBright()) "jb-light" else "jb-dark"
        val postMessageToJavaJsCode = query.inject("JSON.stringify(message)")

        val jsScripts = """
            <script>
                (function() {
                    window.ideApi = {
                     postMessage: message => {
                         $postMessageToJavaJsCode
                     }
                };
                }())
            </script>
            <script type="text/javascript" src="$WEB_SCRIPT_URI"></script>
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
        private val LOG = getLogger<WebviewBrowser>()
        private const val WEB_SCRIPT_URI = "http://webview/js/getStart.js"
        private const val DOMAIN = "webview"
    }
}
