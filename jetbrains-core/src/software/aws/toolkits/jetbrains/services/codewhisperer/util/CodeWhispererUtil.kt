// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.codewhisperer.model.Recommendation
import software.amazon.awssdk.services.ssooidc.model.SsoOidcException
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.SsoConnectionExpiredDialog
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenAuthState
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.CodeWhispererSsoLearnMoreAction
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.ConnectWithAwsToContinueActionError
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.ConnectWithAwsToContinueActionWarn
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyWarn
import software.aws.toolkits.jetbrains.utils.runUnderProgressIfNeeded
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodewhispererCompletionType

object CodeWhispererUtil {

    fun checkCompletionType(
        results: List<Recommendation>,
        noRecommendation: Boolean
    ): CodewhispererCompletionType {
        if (noRecommendation) {
            return CodewhispererCompletionType.Unknown
        }
        return if (results[0].content().contains("\n")) {
            CodewhispererCompletionType.Block
        } else {
            CodewhispererCompletionType.Line
        }
    }

    // return true if every recommendation is empty
    fun checkEmptyRecommendations(recommendations: List<Recommendation>): Boolean =
        recommendations.all { it.content().isEmpty() }

    fun notifyWarnCodeWhispererUsageLimit(project: Project? = null) {
        notifyWarn(
            message("codewhisperer.notification.usage_limit.warn.title"),
            message("codewhisperer.notification.usage_limit.warn.content"),
            project,
        )
    }

    fun notifyErrorCodeWhispererUsageLimit(project: Project? = null) {
        notifyError(
            "",
            message("codewhisperer.notification.usage_limit.warn.content"),
            project,
        )
    }

    // show when user login with Accountless
    fun notifyWarnAccountless() =
        notifyWarn(
            "",
            message("codewhisperer.notification.accountless.warn.message"),
            null,
            listOf(CodeWhispererSsoLearnMoreAction(), ConnectWithAwsToContinueActionWarn())
        )

    // show when user login with Accountless and Accountless is not supported by CW
    fun notifyErrorAccountless() = notifyError(
        "",
        message("codewhisperer.notification.accountless.error.message"),
        null,
        listOf(CodeWhispererSsoLearnMoreAction(), ConnectWithAwsToContinueActionError())
    )

    fun isConnectionExpired(project: Project): Boolean {
        val tokenProvider = tokenProvider(project) ?: return false
        val state = tokenProvider.state()
        return state == BearerTokenAuthState.NEEDS_REFRESH || state == BearerTokenAuthState.NOT_AUTHENTICATED
    }

    fun promptReAuth(project: Project, callback: () -> Unit = {}) {
        val connection = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())
        val tokenProvider = tokenProvider(project) ?: return
        val state = tokenProvider.state()
        if (state == BearerTokenAuthState.NEEDS_REFRESH) {
            try {
                runUnderProgressIfNeeded(null, message("settings.states.validating.short"), false) {
                    tokenProvider.resolveToken()
                }
            } catch (e: SsoOidcException) {
                runInEdt {
                    SsoConnectionExpiredDialog(project, connection).show()
                    callback()
                }
            }
        } else if (state == BearerTokenAuthState.NOT_AUTHENTICATED) {
            runInEdt {
                SsoConnectionExpiredDialog(project, connection).show()
                callback()
            }
        }
    }

    fun getConnectionStartUrl(connection: ToolkitConnection?): String? {
        connection ?: return null
        if (connection !is ManagedBearerSsoConnection) return null
        return connection.startUrl
    }

    private fun tokenProvider(project: Project) = (
        ToolkitConnectionManager
            .getInstance(project)
            .activeConnectionForFeature(CodeWhispererConnection.getInstance()) as? AwsBearerTokenConnection
        )
        ?.getConnectionSettings()
        ?.tokenProvider
        ?.delegate as? BearerTokenProvider
}

enum class CaretMovement {
    NO_CHANGE, MOVE_FORWARD, MOVE_BACKWARD
}
