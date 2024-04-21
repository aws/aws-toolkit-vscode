// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.webview

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
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
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.credentials.Login
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.credentials.sono.CODECATALYST_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.IDENTITY_CENTER_ROLE_ACCESS_SCOPE
import software.aws.toolkits.jetbrains.core.explorer.showExplorerTree
import software.aws.toolkits.jetbrains.core.gettingstarted.IdcRolePopup
import software.aws.toolkits.jetbrains.core.gettingstarted.IdcRolePopupState
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.core.webview.BrowserState
import software.aws.toolkits.jetbrains.core.webview.LoginBrowser
import software.aws.toolkits.jetbrains.core.webview.WebviewResourceHandlerFactory
import software.aws.toolkits.jetbrains.isDeveloperMode
import software.aws.toolkits.telemetry.FeatureId
import java.awt.event.ActionListener
import java.util.function.Function
import javax.swing.JButton
import javax.swing.JComponent

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
            browser = ToolkitWebviewBrowser(project).also {
                webviewContainer.add(it.component())
            }
        }
    }

    companion object {
        fun getInstance(project: Project?) = project?.service<ToolkitWebviewPanel>() ?: error("")
    }
}

// TODO: STILL WIP thus duplicate code / pending move to plugins/toolkit
class ToolkitWebviewBrowser(val project: Project) : LoginBrowser(project, ToolkitWebviewBrowser.DOMAIN) {
    // TODO: confirm if we need such configuration or the default is fine
    override val jcefBrowser: JBCefBrowserBase by lazy {
        val client = JBCefApp.getInstance().createClient()
        Disposer.register(project, client)
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

            "loginBuilderId" -> {
                runInEdt {
                    Login.BuilderId(CODECATALYST_SCOPES, onPendingAwsId).loginBuilderId(project)
                }
            }

            "loginIdC" -> {
                // TODO: make it type safe, maybe (de)serialize into a data class
                val profileName = jsonTree.get("profileName").asText()
                val url = jsonTree.get("url").asText()
                val region = jsonTree.get("region").asText()
                val awsRegion = AwsRegionProvider.getInstance()[region] ?: error("unknown region returned from Toolkit browser")

                val feature: String = jsonTree.get("feature").asText()

                val onError: (String) -> Unit = { _ ->
                    // TODO: telemetry
                }

                val scope = if (FeatureId.from(feature) == FeatureId.Codecatalyst) {
                    CODECATALYST_SCOPES
                } else {
                    listOf(IDENTITY_CENTER_ROLE_ACCESS_SCOPE)
                }

                val login = Login.IdC(profileName, url, awsRegion, scope, onPendingProfile, onError)

                runInEdt {
                    val connection = login.loginIdc(project)
                    if (connection != null && scope.contains(IDENTITY_CENTER_ROLE_ACCESS_SCOPE)) {
                        val tokenProvider = connection.getConnectionSettings().tokenProvider

                        val rolePopup = IdcRolePopup(
                            project,
                            awsRegion.id,
                            profileName,
                            tokenProvider,
                            IdcRolePopupState(), // TODO: is it correct <<?
                        )

                        rolePopup.show()
                    }
                }
            }

            "loginIAM" -> {
                // TODO: make it type safe, maybe (de)serialize into a data class
                val profileName = jsonTree.get("profileName").asText()
                val accessKey = jsonTree.get("accessKey").asText()
                val secretKey = jsonTree.get("secretKey").asText()

                // TODO: telemetry, callbacks
                runInEdt {
                    Login.LongLivedIAM(
                        profileName,
                        accessKey,
                        secretKey
                    ).loginIAM(project, {}, {}, {})
                }
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
        // previous login
        val lastLoginIdcInfo = ToolkitAuthManager.getInstance().getLastLoginIdcInfo()

        // available regions
        val regions = AwsRegionProvider.getInstance().allRegionsForService("sso").values
        val regionJson = objectMapper.writeValueAsString(regions)

        // TODO: if codecatalyst connection expires, set stage to 'REAUTH'
        val stage = "START"

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
                feature: '${state.feature}'
            }
        """.trimIndent()
        executeJS("window.ideClient.prepareUi($jsonData)")
    }

    fun component(): JComponent? = jcefBrowser.component

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
        private val LOG = getLogger<ToolkitWebviewBrowser>()
        private const val WEB_SCRIPT_URI = "http://webview/js/toolkitGetStart.js"
        private const val DOMAIN = "webview"
    }
}
