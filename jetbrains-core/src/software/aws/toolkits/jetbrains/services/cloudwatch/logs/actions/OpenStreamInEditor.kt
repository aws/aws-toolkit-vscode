// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileTypes.PlainTextLanguage
import com.intellij.openapi.project.Project
import com.intellij.testFramework.ReadOnlyLightVirtualFile
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.cloudwatchlogs.model.OutputLogEvent
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogStreamEntry
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.toLogStreamEntry
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import kotlin.coroutines.CoroutineContext

object OpenStreamInEditor {
    suspend fun open(project: Project, edt: CoroutineContext, logStream: String, fileContent: String): Boolean {
        val file = ReadOnlyLightVirtualFile(logStream, PlainTextLanguage.INSTANCE, fileContent)
        return withContext(edt) {
            // set virtual file to read only
            FileEditorManager.getInstance(project).openFile(file, true, true).ifEmpty {
                if (!fileContent.isBlank()) {
                    notifyError(message("cloudwatch.logs.open_in_editor_failed"))
                    return@withContext false
                }
            }
            true
        }
    }
}

// This is named differently because buildStringFromLogs with two different lists has the same type on JVM, yay type erasure
fun List<OutputLogEvent>.buildStringFromLogsOutput() = map { it.toLogStreamEntry() }.buildStringFromLogs()

fun List<LogStreamEntry>.buildStringFromLogs() = buildString {
    this@buildStringFromLogs.forEach { log ->
        val msg = log.message
        append(msg)
        if (!msg.endsWith('\n')) {
            append('\n')
        }
    }
}
