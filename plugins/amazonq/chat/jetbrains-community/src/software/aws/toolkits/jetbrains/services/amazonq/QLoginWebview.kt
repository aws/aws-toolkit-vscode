// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.components.panels.Wrapper
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.gridLayout.HorizontalAlign
import com.intellij.ui.dsl.gridLayout.VerticalAlign
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefJSQuery
import org.cef.CefApp
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.actions.SsoLogoutAction
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.credentials.sono.CODEWHISPERER_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.Q_SCOPES
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.core.webview.BrowserState
import software.aws.toolkits.jetbrains.core.webview.LoginBrowser
import software.aws.toolkits.jetbrains.core.webview.WebviewResourceHandlerFactory
import software.aws.toolkits.jetbrains.isDeveloperMode
import software.aws.toolkits.jetbrains.services.amazonq.util.createBrowser
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererExpired
import software.aws.toolkits.telemetry.AwsTelemetry
import software.aws.toolkits.telemetry.CredentialType
import software.aws.toolkits.telemetry.FeatureId
import software.aws.toolkits.telemetry.Result
import java.awt.event.ActionListener
import java.util.function.Function
import javax.swing.JButton
import javax.swing.JComponent

@Service(Service.Level.PROJECT)
class QWebviewPanel(val project: Project) {
    private val webviewContainer = Wrapper()
    var browser: QWebviewBrowser? = null
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
            browser = QWebviewBrowser(project).also {
                webviewContainer.add(it.component())
            }
        }
    }

    companion object {
        fun getInstance(project: Project) = project.service<QWebviewPanel>()
    }
}

class QWebviewBrowser(val project: Project) : LoginBrowser(project, QWebviewBrowser.DOMAIN, QWebviewBrowser.WEB_SCRIPT_URI) {
    // TODO: confirm if we need such configuration or the default is fine
    override val jcefBrowser = createBrowser(project)
    override val query = JBCefJSQuery.create(jcefBrowser)
    private val objectMapper = jacksonObjectMapper()

    override val handler = Function<String, JBCefJSQuery.Response> {
        val jsonTree = objectMapper.readTree(it)
        val command = jsonTree.get("command").asText()
        LOG.debug { "Data received from Q browser: ${jsonTree.asText()}" }

        when (command) {
            "prepareUi" -> {
                this.prepareBrowser(BrowserState(FeatureId.Q, false))
            }

            "loginBuilderId" -> {
                loginBuilderId(CODEWHISPERER_SCOPES + Q_SCOPES)
            }

            "loginIdC" -> {
                // TODO: make it type safe, maybe (de)serialize into a data class
                val profileName = jsonTree.get("profileName").asText()
                val url = jsonTree.get("url").asText()
                val region = jsonTree.get("region").asText()
                val awsRegion = AwsRegionProvider.getInstance()[region] ?: error("unknown region returned from Q browser")

                val scopes = CODEWHISPERER_SCOPES + Q_SCOPES

                loginIdC(profileName, url, awsRegion, scopes)
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

            "signout" -> {
                // TODO: CodeWhispererConnection/QConnection
                (
                    ToolkitConnectionManager.getInstance(project)
                        .activeConnectionForFeature(CodeWhispererConnection.getInstance()) as? AwsBearerTokenConnection
                    )?.let { connection ->
                    SsoLogoutAction(connection).actionPerformed(
                        AnActionEvent.createFromDataContext(
                            "qBrowser",
                            null,
                            DataContext.EMPTY_CONTEXT
                        )
                    )
                }
            }

            "reauth" -> {
                // TODO: implementation
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

        // TODO: pass "REAUTH" if connection expires
        val stage = if (isCodeWhispererExpired(project)) {
            "REAUTH"
        } else {
            "START"
        }

        val jsonData = """
            {
                stage: '$stage',
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

    override fun loginIAM(profileName: String, accessKey: String, secretKey: String) {
        LOG.error { "IAM is not supported by Q" }
        return
    }

    companion object {
        private val LOG = getLogger<QWebviewBrowser>()
        private const val WEB_SCRIPT_URI = "http://webview/js/getStart.js"
        private const val DOMAIN = "webview"
    }
}
