// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.webview

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
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
import software.aws.toolkits.core.credentials.validatedSsoIdentifierFromUrl
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.Login
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.credentials.sono.CODECATALYST_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.IDENTITY_CENTER_ROLE_ACCESS_SCOPE
import software.aws.toolkits.jetbrains.core.credentials.sono.isSono
import software.aws.toolkits.jetbrains.core.explorer.showExplorerTree
import software.aws.toolkits.jetbrains.core.gettingstarted.IdcRolePopup
import software.aws.toolkits.jetbrains.core.gettingstarted.IdcRolePopupState
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.core.webview.BrowserState
import software.aws.toolkits.jetbrains.core.webview.LoginBrowser
import software.aws.toolkits.jetbrains.core.webview.WebviewResourceHandlerFactory
import software.aws.toolkits.jetbrains.isDeveloperMode
import software.aws.toolkits.jetbrains.utils.inspectExistingConnectionForToolkit
import software.aws.toolkits.telemetry.FeatureId
import java.awt.event.ActionListener
import java.util.function.Function
import javax.swing.JButton
import javax.swing.JComponent

class ToolkitWebviewPanel(val project: Project) : Disposable {
    private val webviewContainer = Wrapper()
    var browser: ToolkitWebviewBrowser? = null
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
            browser = ToolkitWebviewBrowser(project, this).also {
                webviewContainer.add(it.component())
            }
        }
    }

    companion object {
        fun getInstance(project: Project?) = project?.service<ToolkitWebviewPanel>() ?: error("")
    }

    override fun dispose() {}
}

// TODO: STILL WIP thus duplicate code / pending move to plugins/toolkit
class ToolkitWebviewBrowser(val project: Project, private val parentDisposable: Disposable) : LoginBrowser(
    project,
    ToolkitWebviewBrowser.DOMAIN,
    ToolkitWebviewBrowser.WEB_SCRIPT_URI
) {
    // TODO: confirm if we need such configuration or the default is fine
    override val jcefBrowser: JBCefBrowserBase by lazy {
        val client = JBCefApp.getInstance().createClient()
        Disposer.register(parentDisposable, client)
        JBCefBrowserBuilder()
            .setClient(client)
            .setOffScreenRendering(true)
            .setCreateImmediately(true)
            .build()
    }
    override val query: JBCefJSQuery = JBCefJSQuery.create(jcefBrowser)
    private val objectMapper = jacksonObjectMapper()

    override val handler = Function<String, JBCefJSQuery.Response> {
        val jsonTree = objectMapper.readTree(it)
        val command = jsonTree.get("command").asText()
        LOG.debug { "Data received from Toolkit browser: ${jsonTree.toPrettyString()}" }

        when (command) {
            // TODO: handler functions could live in parent class
            "prepareUi" -> {
                this.prepareBrowser(BrowserState(FeatureId.AwsExplorer))
            }

            "selectConnection" -> {
                val connId = jsonTree.get("connectionId").asText()
                this.selectionSettings[connId]?.let { settings ->
                    settings.onChange(settings.currentSelection)
                }
            }

            "loginBuilderId" -> {
                loginBuilderId(CODECATALYST_SCOPES)
            }

            "loginIdC" -> {
                // TODO: make it type safe, maybe (de)serialize into a data class
                val url = jsonTree.get("url").asText()
                val region = jsonTree.get("region").asText()
                val awsRegion = AwsRegionProvider.getInstance()[region] ?: error("unknown region returned from Toolkit browser")
                val feature: String = jsonTree.get("feature").asText()

                val scopes = if (FeatureId.from(feature) == FeatureId.Codecatalyst) {
                    CODECATALYST_SCOPES
                } else {
                    listOf(IDENTITY_CENTER_ROLE_ACCESS_SCOPE)
                }

                loginIdC(url, awsRegion, scopes)
            }

            "loginIAM" -> {
                // TODO: make it type safe, maybe (de)serialize into a data class
                val profileName = jsonTree.get("profileName").asText()
                val accessKey = jsonTree.get("accessKey").asText()
                val secretKey = jsonTree.get("secretKey").asText()
                loginIAM(profileName, accessKey, secretKey)
            }

            "toggleBrowser" -> {
                showExplorerTree(project)
            }

            "cancelLogin" -> {
                // TODO:   AwsTelemetry.loginWithBrowser

                // Essentially Authorization becomes a mutable that allows browser and auth to communicate canceled
                // status. There might be a risk of race condition here by changing this global, for which effort
                // has been made to avoid it (e.g. Cancel button is only enabled if Authorization has been given
                // to browser.). The worst case is that the user will see a stale user code displayed, but not
                // affecting the current login flow.
                currentAuthorization?.progressIndicator?.cancel()
            }

            "signout" -> {
                // TODO: implementation
            }

            "reauth" -> {
                // TODO: implementation
            }

            else -> {
                error("received unknown command from Toolkit login browser")
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

    override fun prepareBrowser(state: BrowserState) {
        selectionSettings.clear()

        if (!inspectExistingConnectionForToolkit(project)) {
            // existing connections
            val bearerCreds = ToolkitAuthManager.getInstance().listConnections()
                .filterIsInstance<AwsBearerTokenConnection>()
                .associate {
                    it.id to BearerConnectionSelectionSettings(it) { conn ->
                        if (conn.isSono()) {
                            loginBuilderId(CODECATALYST_SCOPES)
                        } else {
                            // TODO: rewrite scope logic, it's short term solution only
                            AwsRegionProvider.getInstance()[conn.region]?.let { region ->
                                loginIdC(conn.startUrl, region, listOf(IDENTITY_CENTER_ROLE_ACCESS_SCOPE))
                            }
                        }
                    }
                }

            selectionSettings.putAll(bearerCreds)
        }

        // previous login
        val lastLoginIdcInfo = ToolkitAuthManager.getInstance().getLastLoginIdcInfo()

        // available regions
        val regions = AwsRegionProvider.getInstance().allRegionsForService("sso").values
        val regionJson = objectMapper.writeValueAsString(regions)

        // TODO: if codecatalyst connection expires, set stage to 'REAUTH'
        // TODO: make these strings type safe
        val stage = if (state.feature == FeatureId.Codecatalyst) {
            "SSO_FORM"
        } else {
            "START"
        }

        val jsonData = """
            {
                stage: '$stage',
                regions: $regionJson,
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

    override fun loginIdC(url: String, region: AwsRegion, scopes: List<String>) {
        val onError: (String) -> Unit = { _ ->
            // TODO: telemetry
        }

        val login = Login.IdC(url, region, scopes, onPendingProfile, onError)

        runInEdt {
            val connection = login.loginIdc(project)
            if (connection != null && scopes.contains(IDENTITY_CENTER_ROLE_ACCESS_SCOPE)) {
                val tokenProvider = connection.getConnectionSettings().tokenProvider

                val rolePopup = IdcRolePopup(
                    project,
                    region.id,
                    validatedSsoIdentifierFromUrl(url),
                    tokenProvider,
                    IdcRolePopupState(), // TODO: is it correct <<?
                )

                rolePopup.show()
            }
        }
    }

    fun component(): JComponent? = jcefBrowser.component

    companion object {
        private val LOG = getLogger<ToolkitWebviewBrowser>()
        private const val WEB_SCRIPT_URI = "http://webview/js/toolkitGetStart.js"
        private const val DOMAIN = "webview"
    }
}
