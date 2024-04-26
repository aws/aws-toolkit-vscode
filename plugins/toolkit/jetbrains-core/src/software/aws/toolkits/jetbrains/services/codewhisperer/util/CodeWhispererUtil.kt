// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.notification.NotificationAction
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.impl.EditorImpl
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.yield
import software.amazon.awssdk.services.codewhispererruntime.model.Completion
import software.amazon.awssdk.services.codewhispererruntime.model.OptOutPreference
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.maybeReauthProviderIfNeeded
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.credentials.reauthConnectionIfNeeded
import software.aws.toolkits.jetbrains.core.credentials.sono.isSono
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.learn.LearnCodeWhispererManager.Companion.taskTypeToFilename
import software.aws.toolkits.jetbrains.services.codewhisperer.model.Chunk
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.isTelemetryEnabled
import software.aws.toolkits.jetbrains.settings.AwsSettings
import software.aws.toolkits.jetbrains.utils.isQExpired
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodewhispererCompletionType
import software.aws.toolkits.telemetry.CodewhispererGettingStartedTask

fun <T> calculateIfIamIdentityCenterConnection(project: Project, calculationTask: (connection: ToolkitConnection) -> T): T? =
    ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())?.let {
        calculateIfIamIdentityCenterConnection(it, calculationTask)
    }

fun <T> calculateIfIamIdentityCenterConnection(connection: ToolkitConnection, calculationTask: (connection: ToolkitConnection) -> T): T? =
    if (connection.isSono()) {
        null
    } else {
        calculationTask(connection)
    }

// Controls the condition to send telemetry event to CodeWhisperer service, currently:
// 1. It will be sent for Builder ID users, only if they have optin telemetry sharing.
// 2. It will be sent for IdC users, regardless of telemetry optout status.
fun runIfIdcConnectionOrTelemetryEnabled(project: Project, callback: (connection: ToolkitConnection) -> Unit) =
    ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())?.let {
        runIfIdcConnectionOrTelemetryEnabled(it, callback)
    }

fun runIfIdcConnectionOrTelemetryEnabled(connection: ToolkitConnection, callback: (connection: ToolkitConnection) -> Unit) {
    if (connection.isSono() && !isTelemetryEnabled()) return
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
            content.isEmpty() -> CodewhispererCompletionType.Line
            nonBlankLines > 1 -> CodewhispererCompletionType.Block
            else -> CodewhispererCompletionType.Line
        }
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

    // This will be called only when there's a CW connection, but it has expired(either accessToken or refreshToken)
    // 1. If connection is expired, try to refresh
    // 2. If not able to refresh, requesting re-login by showing a notification
    // 3. The notification will be shown
    //   3.1 At most once per IDE restarts.
    //   3.2 At most once after IDE restarts,
    //   for example, when user performs security scan or fetch code completion for the first time
    // Return true if need to re-auth, false otherwise
    fun promptReAuth(project: Project, isPluginStarting: Boolean = false): Boolean {
        if (!isQExpired(project)) return false
        val tokenProvider = tokenProvider(project) ?: return false
        return maybeReauthProviderIfNeeded(project, tokenProvider) {
            runInEdt {
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

    fun getCodeWhispererStartUrl(project: Project): String? {
        val connection = ToolkitConnectionManager.getInstance(
            project
        ).activeConnectionForFeature(CodeWhispererConnection.getInstance()) as? AwsBearerTokenConnection?
        return connection?.startUrl
    }

    private fun tokenConnection(project: Project) = (
        ToolkitConnectionManager
            .getInstance(project)
            .activeConnectionForFeature(CodeWhispererConnection.getInstance()) as? AwsBearerTokenConnection
        )

    private fun tokenProvider(project: Project) =
        tokenConnection(project)
            ?.getConnectionSettings()
            ?.tokenProvider
            ?.delegate as? BearerTokenProvider

    fun reconnectCodeWhisperer(project: Project) {
        val connection = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())
        if (connection !is ManagedBearerSsoConnection) return
        ApplicationManager.getApplication().executeOnPooledThread {
            reauthConnectionIfNeeded(project, connection)
        }
    }

    // We want to know if a specific trigger happens in the Getting Started page examples files.
    // We use the current file name to know this info. If file name doesn't match any of the below, we will assume
    // that it's coming from a normal file and return null.
    fun getGettingStartedTaskType(editor: Editor): CodewhispererGettingStartedTask? {
        if (ApplicationManager.getApplication().isUnitTestMode) return null
        val filename = (editor as EditorImpl).virtualFile?.name ?: return null
        return taskTypeToFilename.filter { filename.startsWith(it.value) }.keys.firstOrNull()
    }

    fun getTelemetryOptOutPreference() =
        if (AwsSettings.getInstance().isTelemetryEnabled) {
            OptOutPreference.OPTIN
        } else {
            OptOutPreference.OPTOUT
        }

    fun <T> debounce(
        waitMs: Long = 300L,
        coroutineScope: CoroutineScope,
        destinationFunction: (T) -> Unit
    ): (T) -> Unit {
        var debounceJob: Job? = null
        return { param: T ->
            debounceJob?.cancel()
            debounceJob = coroutineScope.launch {
                delay(waitMs)
                destinationFunction(param)
            }
        }
    }
}

enum class CaretMovement {
    NO_CHANGE, MOVE_FORWARD, MOVE_BACKWARD
}
