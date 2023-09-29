// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.learn

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererCsharp
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJavaScript
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPython
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererTypeScript
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodewhispererGettingStartedTask
import javax.swing.JButton

class LearnCodeWhispererManager(private val project: Project) {
    val tryExampleButtons = mutableListOf<JButton>()
    var language: CodeWhispererProgrammingLanguage = CodeWhispererJava.INSTANCE
        set(value) {
            field = value
            tryExampleButtons.forEach {
                it.text = message("codewhisperer.learn_page.examples.tasks.button", getButtonSuffix())
            }
        }

    fun getEditor(file: VirtualFile) = LearnCodeWhispererEditor(project, file)

    fun getFileExtension() = when (language) {
        CodeWhispererJava.INSTANCE -> ".java"
        CodeWhispererPython.INSTANCE -> ".py"
        CodeWhispererJavaScript.INSTANCE -> ".js"
        CodeWhispererTypeScript.INSTANCE -> ".ts"
        CodeWhispererCsharp.INSTANCE -> ".cs"
        else -> ".java"
    }

    fun getButtonSuffix() = when (language) {
        CodeWhispererJava.INSTANCE -> "Java"
        CodeWhispererPython.INSTANCE -> "Python"
        CodeWhispererJavaScript.INSTANCE -> "JavaScript"
        CodeWhispererTypeScript.INSTANCE -> "TypeScript"
        CodeWhispererCsharp.INSTANCE -> "C#"
        else -> "Java"
    }

    companion object {
        fun getInstance(project: Project) = project.service<LearnCodeWhispererManager>()
        val taskTypeToFilename = mapOf(
            CodewhispererGettingStartedTask.AutoTrigger to "CodeWhisperer_generate_suggestion",
            CodewhispererGettingStartedTask.ManualTrigger to "CodeWhisperer_manual_invoke",
            CodewhispererGettingStartedTask.CommentAsPrompt to "CodeWhisperer_use_comments",
            CodewhispererGettingStartedTask.UnitTest to "CodeWhisperer_generate_unit_tests",
            CodewhispererGettingStartedTask.Navigation to "CodeWhisperer_navigate_suggestions",
        )
    }
}
