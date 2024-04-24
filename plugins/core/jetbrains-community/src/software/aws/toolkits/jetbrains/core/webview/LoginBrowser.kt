// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.webview

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.ui.JBColor
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import kotlinx.coroutines.launch
import software.aws.toolkits.core.credentials.ToolkitBearerTokenProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.credentials.Login
import software.aws.toolkits.jetbrains.core.credentials.ManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_REGION
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.credentials.sso.PendingAuthorization
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.InteractiveBearerTokenProvider
import software.aws.toolkits.jetbrains.utils.pollFor
import software.aws.toolkits.telemetry.FeatureId
import java.util.function.Function

data class BrowserState(val feature: FeatureId, val browserCancellable: Boolean = false, val requireReauth: Boolean = false)

abstract class LoginBrowser(
    private val project: Project,
    val domain: String,
    val webScriptUri: String
) {
    abstract val jcefBrowser: JBCefBrowserBase
    abstract val query: JBCefJSQuery
    abstract val handler: Function<String, JBCefJSQuery.Response>

    protected var currentAuthorization: PendingAuthorization? = null

    // TODO: figure out a better way to do this UI update
    protected val onPendingProfile: (InteractiveBearerTokenProvider) -> Unit = { provider ->
        projectCoroutineScope(project).launch {
            val authorization = pollForAuthorization(provider)
            if (authorization != null) {
                executeJS("window.ideClient.updateAuthorization(\"${userCodeFromAuthorization(authorization)}\")")
                currentAuthorization = authorization
            }
        }
    }

    // TODO: figure out a better way to do this UI update
    protected val onPendingAwsId: () -> Unit = {
        projectCoroutineScope(project).launch {
            val conn = pollForConnection(ToolkitBearerTokenProvider.ssoIdentifier(SONO_URL, SONO_REGION))

            conn?.let { c ->
                val provider = (c as ManagedBearerSsoConnection).getConnectionSettings().tokenProvider.delegate
                val authorization = pollForAuthorization(provider as InteractiveBearerTokenProvider)

                if (authorization != null) {
                    executeJS("window.ideClient.updateAuthorization(\"${userCodeFromAuthorization(authorization)}\")")
                    currentAuthorization = authorization
                    return@launch
                }
            }
        }
    }

    abstract fun prepareBrowser(state: BrowserState)

    fun executeJS(jsScript: String) {
        this.jcefBrowser.cefBrowser.let {
            it.executeJavaScript(jsScript, it.url, 0)
        }
    }

    fun userCodeFromAuthorization(authorization: PendingAuthorization) = when (authorization) {
        is PendingAuthorization.DAGAuthorization -> authorization.authorization.userCode
        else -> ""
    }

    fun resetBrowserState() {
        executeJS("window.ideClient.reset()")
    }

    open fun loginBuilderId(scopes: List<String>) {
        runInEdt {
            Login.BuilderId(scopes, onPendingAwsId).loginBuilderId(project)
            // TODO: telemetry
        }
    }

    open fun loginIdC(profileName: String, url: String, region: AwsRegion, scopes: List<String>) {
        val onError: (String) -> Unit = { _ ->
            // TODO: telemetry
        }
        runInEdt {
            Login.IdC(profileName, url, region, scopes, onPendingProfile, onError).loginIdc(project)
            // TODO: telemetry
        }
    }

    open fun loginIAM(profileName: String, accessKey: String, secretKey: String) {
        // TODO: telemetry, callbacks
        runInEdt {
            Login.LongLivedIAM(
                profileName,
                accessKey,
                secretKey
            ).loginIAM(project, {}, {}, {})
        }
    }

    protected fun loadWebView() {
        jcefBrowser.loadHTML(getWebviewHTML())
    }

    protected fun getWebviewHTML(): String {
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
            <script type="text/javascript" src="$webScriptUri"></script>
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

    protected suspend fun pollForConnection(connectionId: String): ToolkitConnection? = pollFor {
        ToolkitAuthManager.getInstance().getConnection(connectionId)
    }

    protected suspend fun pollForAuthorization(provider: InteractiveBearerTokenProvider): PendingAuthorization? = pollFor {
        provider.pendingAuthorization
    }
}
