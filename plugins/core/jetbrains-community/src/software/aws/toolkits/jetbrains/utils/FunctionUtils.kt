// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.project.Project
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull
import org.slf4j.LoggerFactory
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.credentials.pinning.QConnection
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenAuthState
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider

private val LOG = LoggerFactory.getLogger("FunctionUtils")

suspend fun <T> pollFor(func: () -> T): T? {
    val timeoutMillis = 50000L

    val result = withTimeoutOrNull(timeoutMillis) {
        while (true) {
            val result = func()
            if (result != null) {
                return@withTimeoutOrNull result
            }

            delay(50L)
        }
        null
    }

    return result
}

// TODO: move to Q package, living here because Codewhisperer package is not moved to Q
/**
 * Note: if a connection doesn't have all required scopes for Q, we determine it's NOT_AUTHENTICATED
 */
fun isQConnected(project: Project): Boolean {
    val manager = ToolkitConnectionManager.getInstance(project)
    val qState = manager.connectionStateForFeature(QConnection.getInstance())
    val cwState = manager.connectionStateForFeature(CodeWhispererConnection.getInstance())
    LOG.debug {
        "qConnectionState: $qState; cwConnectionState: $cwState"
    }
    return qState != BearerTokenAuthState.NOT_AUTHENTICATED && cwState != BearerTokenAuthState.NOT_AUTHENTICATED
}

fun isQExpired(project: Project): Boolean {
    val manager = ToolkitConnectionManager.getInstance(project)
    val qState = manager.connectionStateForFeature(QConnection.getInstance())
    val cwState = manager.connectionStateForFeature(CodeWhispererConnection.getInstance())
    LOG.debug {
        "qConnectionState: $qState; cwConnectionState: $cwState"
    }
    return qState == BearerTokenAuthState.NEEDS_REFRESH || cwState == BearerTokenAuthState.NEEDS_REFRESH
}

fun AwsBearerTokenConnection.state(): BearerTokenAuthState =
    (getConnectionSettings().tokenProvider.delegate as? BearerTokenProvider)?.state() ?: BearerTokenAuthState.NOT_AUTHENTICATED
