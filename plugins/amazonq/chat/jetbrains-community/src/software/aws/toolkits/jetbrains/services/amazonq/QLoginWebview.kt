// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.application.ApplicationManager
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
import software.aws.toolkits.jetbrains.core.credentials.ManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.actions.SsoLogoutAction
import software.aws.toolkits.jetbrains.core.credentials.pinning.QConnection
import software.aws.toolkits.jetbrains.core.credentials.reauthConnectionIfNeeded
import software.aws.toolkits.jetbrains.core.credentials.sono.Q_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.isSono
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.core.webview.BrowserState
import software.aws.toolkits.jetbrains.core.webview.LoginBrowser
import software.aws.toolkits.jetbrains.core.webview.WebviewResourceHandlerFactory
import software.aws.toolkits.jetbrains.isDeveloperMode
import software.aws.toolkits.jetbrains.services.amazonq.util.createBrowser
import software.aws.toolkits.jetbrains.utils.isQConnected
import software.aws.toolkits.jetbrains.utils.isQExpired
import software.aws.toolkits.telemetry.FeatureId
import java.awt.event.ActionListener
import java.util.function.Function
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

class QWebviewBrowser(val project: Project, private val parentDisposable: Disposable) : LoginBrowser(
    project,
    QWebviewBrowser.DOMAIN,
    QWebviewBrowser.WEB_SCRIPT_URI
) {
    // TODO: confirm if we need such configuration or the default is fine
    override val jcefBrowser = createBrowser(parentDisposable)
    private val query = JBCefJSQuery.create(jcefBrowser)
    private val objectMapper = jacksonObjectMapper()

    private val handler = Function<String, JBCefJSQuery.Response> {
        val jsonTree = objectMapper.readTree(it)
        val command = jsonTree.get("command").asText()
        LOG.debug { "Data received from Q browser: ${jsonTree.asText()}" }

        when (command) {
            "prepareUi" -> {
                this.prepareBrowser(BrowserState(FeatureId.Q, false))
            }

            "selectConnection" -> {
                val connId = jsonTree.get("connectionId").asText()
                this.selectionSettings[connId]?.let { settings ->
                    settings.onChange(settings.currentSelection)
                }
            }

            "loginBuilderId" -> {
                loginBuilderId(Q_SCOPES)
            }

            "loginIdC" -> {
                // TODO: make it type safe, maybe (de)serialize into a data class
                val url = jsonTree.get("url").asText()
                val region = jsonTree.get("region").asText()
                val awsRegion = AwsRegionProvider.getInstance()[region] ?: error("unknown region returned from Q browser")

                val scopes = Q_SCOPES

                loginIdC(url, awsRegion, scopes)
            }

            "cancelLogin" -> {
                cancelLogin()
            }

            "signout" -> {
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

            "reauth" -> {
                ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(QConnection.getInstance())?.let { conn ->
                    if (conn is ManagedBearerSsoConnection) {
                        ApplicationManager.getApplication().executeOnPooledThread {
                            reauthConnectionIfNeeded(project, conn, onPendingToken)
                        }
                    }
                }
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

        loadWebView(query)

        query.addHandler(handler)
    }

    fun component(): JComponent? = jcefBrowser.component

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
        val lastLoginIdcInfo = ToolkitAuthManager.getInstance().getLastLoginIdcInfo()

        // available regions
        val regions = AwsRegionProvider.getInstance().allRegionsForService("sso").values.let {
            objectMapper.writeValueAsString(it)
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
                existConnections: ${objectMapper.writeValueAsString(selectionSettings.values.map { it.currentSelection }.toList())}
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
