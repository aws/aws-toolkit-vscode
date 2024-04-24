// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.learn

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava
import software.aws.toolkits.telemetry.CodewhispererGettingStartedTask

@Service(Service.Level.PROJECT)
class LearnCodeWhispererManager(private val project: Project) {
    // Only supporting Java at the moment
    val language: CodeWhispererProgrammingLanguage = CodeWhispererJava.INSTANCE
    val fileExtension = ".java"

    fun getEditor(file: VirtualFile) = LearnCodeWhispererEditor(project, file)

    companion object {
        fun getInstance(project: Project) = project.service<LearnCodeWhispererManager>()
        val taskTypeToFilename = mapOf(
            CodewhispererGettingStartedTask.AutoTrigger to "CodeWhisperer_generate_suggestion",
            CodewhispererGettingStartedTask.ManualTrigger to "CodeWhisperer_manual_invoke",
            CodewhispererGettingStartedTask.UnitTest to "CodeWhisperer_generate_unit_tests",
        )
    }
}
