// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileTypes.PlainTextLanguage
import com.intellij.openapi.project.Project
import com.intellij.testFramework.ReadOnlyLightVirtualFile
import kotlinx.coroutines.withContext
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import kotlin.coroutines.CoroutineContext

object OpenStreamInEditor {
    suspend fun open(project: Project, edt: CoroutineContext, logStream: String, fileContent: String) {
        val file = ReadOnlyLightVirtualFile(logStream, PlainTextLanguage.INSTANCE, fileContent)
        withContext(edt) {
            // set virtual file to read only
            FileEditorManager.getInstance(project).openFile(file, true, true).ifEmpty {
                if (!fileContent.isBlank()) {
                    notifyError(message("cloudwatch.logs.open_in_editor_failed"))
                }
            }
        }
    }
}
