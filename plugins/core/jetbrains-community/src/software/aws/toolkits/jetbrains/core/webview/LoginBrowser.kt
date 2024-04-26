// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.webview

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.progress.blockingContext
import com.intellij.openapi.project.Project
import com.intellij.platform.ide.progress.withBackgroundProgress
import com.intellij.ui.JBColor
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.Login
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.reauthConnectionIfNeeded
import software.aws.toolkits.jetbrains.core.credentials.sso.PendingAuthorization
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.InteractiveBearerTokenProvider
import software.aws.toolkits.jetbrains.utils.pollFor
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.FeatureId
import java.util.concurrent.Future
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

    protected data class BearerConnectionSelectionSettings(val currentSelection: AwsBearerTokenConnection, val onChange: (AwsBearerTokenConnection) -> Unit)
    protected val selectionSettings = mutableMapOf<String, BearerConnectionSelectionSettings>()

    protected val onPendingToken: (InteractiveBearerTokenProvider) -> Unit = { provider ->
        projectCoroutineScope(project).launch {
            val authorization = pollForAuthorization(provider)
            if (authorization != null) {
                executeJS("window.ideClient.updateAuthorization(\"${userCodeFromAuthorization(authorization)}\")")
                currentAuthorization = authorization
            }
        }
    }

    abstract fun prepareBrowser(state: BrowserState)

    fun executeJS(jsScript: String) {
        this.jcefBrowser.cefBrowser.let {
            it.executeJavaScript(jsScript, it.url, 0)
        }
    }

    protected fun cancelLogin() {
        // Essentially Authorization becomes a mutable that allows browser and auth to communicate canceled
        // status. There might be a risk of race condition here by changing this global, for which effort
        // has been made to avoid it (e.g. Cancel button is only enabled if Authorization has been given
        // to browser.). The worst case is that the user will see a stale user code displayed, but not
        // affecting the current login flow.
        currentAuthorization?.progressIndicator?.cancel()
        // TODO: telemetry
    }

    fun userCodeFromAuthorization(authorization: PendingAuthorization) = when (authorization) {
        is PendingAuthorization.DAGAuthorization -> authorization.authorization.userCode
        else -> ""
    }

    open fun loginBuilderId(scopes: List<String>) {
        loginWithBackgroundContext {
            Login.BuilderId(scopes, onPendingToken) {}.loginBuilderId(project)
            // TODO: telemetry
        }
    }

    open fun loginIdC(url: String, region: AwsRegion, scopes: List<String>) {
        val onError: (String) -> Unit = { _ ->
            // TODO: telemetry
        }
        loginWithBackgroundContext {
            Login.IdC(url, region, scopes, onPendingToken, onError).loginIdc(project)
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

    protected fun<T> loginWithBackgroundContext(action: () -> T): Future<T> =
        ApplicationManager.getApplication().executeOnPooledThread<T> {
            runBlocking {
                withBackgroundProgress(project, message("credentials.pending.title")) {
                    blockingContext {
                        action()
                    }
                }
            }
        }

    protected fun reauth(connection: ToolkitConnection?) {
        if (connection is AwsBearerTokenConnection) {
            loginWithBackgroundContext {
                reauthConnectionIfNeeded(project, connection, onPendingToken)
            }
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

    protected suspend fun pollForAuthorization(provider: InteractiveBearerTokenProvider): PendingAuthorization? = pollFor {
        provider.pendingAuthorization
    }
}
