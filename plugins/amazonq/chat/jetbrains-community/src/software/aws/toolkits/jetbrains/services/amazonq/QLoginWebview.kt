// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq

import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.components.panels.Wrapper
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.gridLayout.HorizontalAlign
import com.intellij.ui.dsl.gridLayout.VerticalAlign
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefJSQuery
import org.cef.CefApp
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.actions.SsoLogoutAction
import software.aws.toolkits.jetbrains.core.credentials.pinning.QConnection
import software.aws.toolkits.jetbrains.core.credentials.sono.Q_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.isSono
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.core.webview.BrowserMessage
import software.aws.toolkits.jetbrains.core.webview.BrowserState
import software.aws.toolkits.jetbrains.core.webview.LoginBrowser
import software.aws.toolkits.jetbrains.core.webview.WebviewResourceHandlerFactory
import software.aws.toolkits.jetbrains.isDeveloperMode
import software.aws.toolkits.jetbrains.services.amazonq.util.createBrowser
import software.aws.toolkits.jetbrains.utils.isQConnected
import software.aws.toolkits.jetbrains.utils.isQExpired
import software.aws.toolkits.telemetry.FeatureId
import software.aws.toolkits.telemetry.UiTelemetry
import software.aws.toolkits.telemetry.WebviewTelemetry
import java.awt.event.ActionListener
import javax.swing.JButton
import javax.swing.JComponent

@Service(Service.Level.PROJECT)
class QWebviewPanel private constructor(val project: Project) : Disposable {
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
        init()
    }

    fun disposeAndRecreate() {
        webviewContainer.removeAll()
        val toDispose = browser
        init()
        if (toDispose != null) {
            Disposer.dispose(toDispose)
        }
    }

    private fun init() {
        if (!JBCefApp.isSupported()) {
            // Fallback to an alternative browser-less solution
            webviewContainer.add(JBTextArea("JCEF not supported"))
            browser = null
        } else {
            browser = QWebviewBrowser(project, this).also {
                webviewContainer.add(it.component())
            }
        }
    }

    companion object {
        fun getInstance(project: Project) = project.service<QWebviewPanel>()
    }

    override fun dispose() {
    }
}

class QWebviewBrowser(val project: Project, private val parentDisposable: Disposable) :
    LoginBrowser(
        project,
        QWebviewBrowser.DOMAIN,
        QWebviewBrowser.WEB_SCRIPT_URI
    ),
    Disposable {
    // TODO: confirm if we need such configuration or the default is fine
    override val jcefBrowser = createBrowser(parentDisposable)
    private val query = JBCefJSQuery.create(jcefBrowser)

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

        loadWebView(query)

        query.addHandler(jcefHandler)
    }

    override fun dispose() {
        Disposer.dispose(jcefBrowser)
    }

    fun component(): JComponent? = jcefBrowser.component

    override fun handleBrowserMessage(message: BrowserMessage?) {
        if (message == null) {
            return
        }

        when (message) {
            is BrowserMessage.PrepareUi -> {
                this.prepareBrowser(BrowserState(FeatureId.Q, false))
                WebviewTelemetry.amazonqSignInOpened(
                    project,
                    reAuth = isQExpired(project)
                )
            }

            is BrowserMessage.SelectConnection -> {
                this.selectionSettings[message.connectionId]?.let { settings ->
                    settings.onChange(settings.currentSelection)
                }
            }

            is BrowserMessage.LoginBuilderId -> {
                loginBuilderId(Q_SCOPES)
            }

            is BrowserMessage.LoginIdC -> {
                val awsRegion = AwsRegionProvider.getInstance()[message.region] ?: error("unknown region returned from Q browser")
                loginIdC(message.url, awsRegion, Q_SCOPES)
            }

            is BrowserMessage.CancelLogin -> {
                cancelLogin()
            }

            is BrowserMessage.Signout -> {
                (
                    ToolkitConnectionManager.getInstance(project)
                        .activeConnectionForFeature(QConnection.getInstance()) as? AwsBearerTokenConnection
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

            is BrowserMessage.Reauth -> {
                reauth(ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(QConnection.getInstance()))
            }

            is BrowserMessage.LoginIAM, is BrowserMessage.ToggleBrowser -> {
                error("QBrowser doesn't support the provided command ${message::class.simpleName}")
            }

            is BrowserMessage.SendUiClickTelemetry -> {
                UiTelemetry.click(project, message.signInOptionClicked)
            }
        }
    }

    override fun prepareBrowser(state: BrowserState) {
        // TODO: duplicate code in ToolkitLoginWebview
        selectionSettings.clear()

        if (!isQConnected(project)) {
            // existing connections
            // TODO: filter "active"(state == 'AUTHENTICATED') connection only maybe?
            val bearerCreds = ToolkitAuthManager.getInstance().listConnections().filterIsInstance<AwsBearerTokenConnection>().associate {
                it.id to BearerConnectionSelectionSettings(it) { conn ->
                    if (conn.isSono()) {
                        loginBuilderId(Q_SCOPES)
                    } else {
                        // TODO: rewrite scope logic, it's short term solution only
                        AwsRegionProvider.getInstance()[conn.region]?.let { region ->
                            loginIdC(conn.startUrl, region, Q_SCOPES)
                        }
                    }
                }
            }

            selectionSettings.putAll(bearerCreds)
        }

        // previous login
        val lastLoginIdcInfo = ToolkitAuthManager.getInstance().getLastLoginIdcInfo().apply {
            // set default option as us-east-1
            if (this.region.isBlank()) {
                this.region = AwsRegionProvider.getInstance().defaultRegion().id
            }
        }

        // available regions
        val regions = AwsRegionProvider.getInstance().allRegionsForService("sso").values.let {
            writeValueAsString(it)
        }

        // TODO: pass "REAUTH" if connection expires
        val stage = if (isQExpired(project)) {
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
                cancellable: ${state.browserCancellable},
                feature: '${state.feature}',
                existConnections: ${writeValueAsString(selectionSettings.values.map { it.currentSelection }.toList())}
            }
        """.trimIndent()
        executeJS("window.ideClient.prepareUi($jsonData)")
    }

    override fun loginIAM(profileName: String, accessKey: String, secretKey: String) {
        LOG.error { "IAM is not supported by Q" }
        return
    }

    override fun loadWebView(query: JBCefJSQuery) {
        jcefBrowser.loadHTML(getWebviewHTML(webScriptUri, query))
    }

    companion object {
        private val LOG = getLogger<QWebviewBrowser>()
        private const val WEB_SCRIPT_URI = "http://webview/js/getStart.js"
        private const val DOMAIN = "webview"
    }
}
