// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.notification.NotificationAction
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import kotlinx.coroutines.yield
import software.amazon.awssdk.services.codewhispererruntime.model.Completion
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.loginSso
import software.aws.toolkits.jetbrains.core.credentials.maybeReauthProviderIfNeeded
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.credentials.sono.isSono
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenAuthState
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider
import software.aws.toolkits.jetbrains.core.explorer.refreshDevToolTree
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.CodeWhispererLoginLearnMoreAction
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.CodeWhispererSsoLearnMoreAction
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.ConnectWithAwsToContinueActionError
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.ConnectWithAwsToContinueActionWarn
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.DoNotShowAgainActionError
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.DoNotShowAgainActionWarn
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererExpired
import software.aws.toolkits.jetbrains.services.codewhisperer.model.Chunk
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.jetbrains.utils.notifyWarn
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodewhispererCompletionType

fun runIfIamIdentityCenterConnection(project: Project, callback: (connection: ToolkitConnection) -> Unit) =
    ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())?.let {
        runIfIamIdentityCenterConnection(it, callback)
    }

fun runIfIamIdentityCenterConnection(connection: ToolkitConnection, callback: (connection: ToolkitConnection) -> Unit) {
    if (connection.isSono()) return
    callback(connection)
}

fun VirtualFile.content(): String = VfsUtil.loadText(this)

// we call it a chunk every 10 lines of code
// [[L1, L2, ...L10], [L11, L12, ...L20]...]
// use VirtualFile.toCodeChunk instead
suspend fun String.toCodeChunk(path: String): List<Chunk> {
    val chunks = this.trimEnd()

    var chunksOfStringsPreprocessed = chunks
        .split("\n")
        .chunked(10)
        .map { chunkContent ->
            yield()
            chunkContent.joinToString(separator = "\n").trimEnd()
        }

    // special process for edge case: first since first chunk is never referenced by other chunk, we define first 3 lines of its content referencing the first
    chunksOfStringsPreprocessed = listOf(
        chunksOfStringsPreprocessed
            .first()
            .split("\n")
            .take(3)
            .joinToString(separator = "\n").trimEnd()
    ) + chunksOfStringsPreprocessed

    return chunksOfStringsPreprocessed.mapIndexed { index, chunkContent ->
        yield()
        val nextChunkContent = if (index == chunksOfStringsPreprocessed.size - 1) {
            chunkContent
        } else {
            chunksOfStringsPreprocessed[index + 1]
        }
        Chunk(
            content = chunkContent,
            path = path,
            nextChunk = nextChunkContent
        )
    }
}

// we refer 10 lines of code as "Code Chunk"
// [[L1, L2, ...L10], [L11, L12, ...L20]...]
// use VirtualFile.toCodeChunk
// TODO: path as param is weird
fun VirtualFile.toCodeChunk(path: String): Sequence<Chunk> = sequence {
    var prevChunk: String? = null
    inputStream.bufferedReader(Charsets.UTF_8).useLines {
        val iter = it.chunked(10).iterator()
        while (iter.hasNext()) {
            val currentChunk = iter.next().joinToString("\n").trimEnd()

            // chunk[0]
            if (prevChunk == null) {
                val first3Lines = currentChunk.split("\n").take(3).joinToString("\n").trimEnd()
                yield(Chunk(content = first3Lines, path = path, nextChunk = currentChunk))
            } else {
                // chunk[1]...chunk[n-1]
                prevChunk?.let { chunk ->
                    yield(Chunk(content = chunk, path = path, nextChunk = currentChunk))
                }
            }

            prevChunk = currentChunk
        }

        prevChunk?.let { lastChunk ->
            // chunk[n]
            yield(Chunk(content = lastChunk, path = path, nextChunk = lastChunk))
        }
    }
}

object CodeWhispererUtil {
    fun getCompletionType(completion: Completion): CodewhispererCompletionType {
        val content = completion.content()
        val nonBlankLines = content.split("\n").count { it.isNotBlank() }

        return when {
            content.isEmpty() -> CodewhispererCompletionType.Unknown
            nonBlankLines > 1 -> CodewhispererCompletionType.Block
            else -> CodewhispererCompletionType.Line
        }
    }

    fun notifyWarnCodeWhispererUsageLimit(project: Project? = null) {
        notifyWarn(
            message("codewhisperer.notification.usage_limit.warn.title"),
            message("codewhisperer.notification.usage_limit.codesuggestion.warn.content"),
            project,
        )
    }

    fun notifyErrorCodeWhispererUsageLimit(project: Project? = null, isCodeScan: Boolean = false) {
        notifyError(
            "",
            if (!isCodeScan) {
                message("codewhisperer.notification.usage_limit.codesuggestion.warn.content")
            } else {
                message("codewhisperer.notification.usage_limit.codescan.warn.content")
            },
            project,
        )
    }

    // show when user login with Accountless
    fun notifyWarnAccountless() = notifyWarn(
        "",
        message("codewhisperer.notification.accountless.warn.message"),
        null,
        listOf(CodeWhispererSsoLearnMoreAction(), ConnectWithAwsToContinueActionWarn(), DoNotShowAgainActionWarn())
    )

    // show after user selects Don't Show Again in Accountless login message
    fun notifyInfoAccountless() = notifyInfo(
        "",
        message("codewhisperer.notification.accountless.info.dont.show.again.message"),
        null,
        listOf(CodeWhispererLoginLearnMoreAction())
    )

    // show when user login with Accountless and Accountless is not supported by CW
    fun notifyErrorAccountless() = notifyError(
        "",
        message("codewhisperer.notification.accountless.error.message"),
        null,
        listOf(CodeWhispererSsoLearnMoreAction(), ConnectWithAwsToContinueActionError(), DoNotShowAgainActionError())
    )

    fun isAccessTokenExpired(project: Project): Boolean {
        val tokenProvider = tokenProvider(project) ?: return false
        val state = tokenProvider.state()
        return state == BearerTokenAuthState.NEEDS_REFRESH
    }

    fun isRefreshTokenExpired(project: Project): Boolean {
        val tokenProvider = tokenProvider(project) ?: return false
        val state = tokenProvider.state()
        return state == BearerTokenAuthState.NOT_AUTHENTICATED
    }

    // This will be called only when there's a CW connection, but it has expired(either accessToken or refreshToken)
    // 1. If connection is expired, try to refresh
    // 2. If not able to refresh, requesting re-login by showing a notification
    // 3. The notification will be shown
    //   3.1 At most once per IDE restarts.
    //   3.2 At most once after IDE restarts,
    //   for example, when user performs security scan or fetch code completion for the first time
    // Return true if need to re-auth, false otherwise
    fun promptReAuth(project: Project, isPluginStarting: Boolean = false): Boolean {
        if (!isCodeWhispererExpired(project)) return false
        val tokenProvider = tokenProvider(project) ?: return false
        return maybeReauthProviderIfNeeded(project, tokenProvider) {
            runInEdt {
                project.refreshDevToolTree()
                if (!CodeWhispererService.hasReAuthPromptBeenShown()) {
                    notifyConnectionExpiredRequestReauth(project)
                }
                if (!isPluginStarting) {
                    CodeWhispererService.markReAuthPromptShown()
                }
            }
        }
    }

    private fun notifyConnectionExpiredRequestReauth(project: Project) {
        if (CodeWhispererExplorerActionManager.getInstance().getConnectionExpiredDoNotShowAgain()) {
            return
        }
        notifyError(
            message("toolkit.sso_expire.dialog.title"),
            message("toolkit.sso_expire.dialog_message"),
            project,
            listOf(
                NotificationAction.create(message("toolkit.sso_expire.dialog.yes_button")) { _, notification ->
                    reconnectCodeWhisperer(project)
                    notification.expire()
                },
                NotificationAction.create(message("toolkit.sso_expire.dialog.no_button")) { _, notification ->
                    CodeWhispererExplorerActionManager.getInstance().setConnectionExpiredDoNotShowAgain(true)
                    notification.expire()
                }
            )
        )
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

    fun reconnectCodeWhisperer(project: Project) {
        val connection = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())
        if (connection !is ManagedBearerSsoConnection) return
        ApplicationManager.getApplication().executeOnPooledThread {
            loginSso(project, connection.startUrl, connection.region, connection.scopes)
        }
    }
}

enum class CaretMovement {
    NO_CHANGE, MOVE_FORWARD, MOVE_BACKWARD
}
