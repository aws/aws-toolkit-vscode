// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.language

import com.intellij.openapi.components.service
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererC
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererCpp
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererCsharp
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererGo
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJavaScript
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJsx
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererKotlin
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPhp
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPlainText
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPython
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererRuby
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererRust
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererScala
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererShell
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererSql
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererTsx
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererTypeScript
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererUnknownLanguage

class CodeWhispererLanguageManager {
    // Always use this method to check for language support for CodeWhisperer features.
    // The return type here implicitly means that the corresponding language plugin has been installed to the user's IDE,
    // (e.g. 'Python' plugin for Python and 'JavaScript and TypeScript' for JS/TS). So we can leverage these language
    // plugin features when developing CodeWhisperer features.
    fun getLanguage(vFile: VirtualFile): CodeWhispererProgrammingLanguage {
        val fileTypeName = vFile.fileType.name.lowercase()
        val fileExtension = vFile.extension?.lowercase()

        // We want to support Python Console which does not have a file extension
        if (fileExtension == null && !fileTypeName.contains("python")) {
            return CodeWhispererUnknownLanguage.INSTANCE
        }
        return when {
            fileTypeName.contains("python") -> CodeWhispererPython.INSTANCE
            fileTypeName.contains("javascript") -> CodeWhispererJavaScript.INSTANCE
            fileTypeName.contains("java") -> CodeWhispererJava.INSTANCE
            fileTypeName.contains("jsx harmony") -> CodeWhispererJsx.INSTANCE
            fileTypeName.contains("c#") -> CodeWhispererCsharp.INSTANCE
            fileTypeName.contains("typescript jsx") -> CodeWhispererTsx.INSTANCE
            fileTypeName.contains("typescript") -> CodeWhispererTypeScript.INSTANCE
            fileTypeName.contains("scala") -> CodeWhispererScala.INSTANCE
            fileTypeName.contains("kotlin") -> CodeWhispererKotlin.INSTANCE
            fileTypeName.contains("ruby") -> CodeWhispererRuby.INSTANCE
            fileTypeName.contains("php") -> CodeWhispererPhp.INSTANCE
            fileTypeName.contains("sql") -> CodeWhispererSql.INSTANCE
            fileTypeName.contains("go") -> CodeWhispererGo.INSTANCE
            fileTypeName.contains("shell") -> CodeWhispererShell.INSTANCE
            fileTypeName.contains("rust") -> CodeWhispererRust.INSTANCE
            fileTypeName.contains("plain_text") -> CodeWhispererPlainText.INSTANCE
            languageExtensionsMap.any { it.value.contains(fileExtension) } -> {
                val language = languageExtensionsMap.entries.find { it.value.contains(fileExtension) }?.key
                language ?: CodeWhispererUnknownLanguage.INSTANCE
            }
            else -> CodeWhispererUnknownLanguage.INSTANCE
        }
    }

    fun getLanguage(psiFile: PsiFile): CodeWhispererProgrammingLanguage = psiFile.virtualFile?.let {
        getLanguage(psiFile.virtualFile)
    } ?: run {
        CodeWhispererUnknownLanguage.INSTANCE
    }

    companion object {
        fun getInstance(): CodeWhispererLanguageManager = service()
        val languageExtensionsMap = mapOf(
            CodeWhispererJava.INSTANCE to listOf("java"),
            CodeWhispererPython.INSTANCE to listOf("py"),
            CodeWhispererJavaScript.INSTANCE to listOf("js"),
            CodeWhispererJsx.INSTANCE to listOf("jsx"),
            CodeWhispererTypeScript.INSTANCE to listOf("ts"),
            CodeWhispererTsx.INSTANCE to listOf("tsx"),
            CodeWhispererCsharp.INSTANCE to listOf("cs"),
            CodeWhispererKotlin.INSTANCE to listOf("kt"),
            CodeWhispererScala.INSTANCE to listOf("scala"),
            CodeWhispererC.INSTANCE to listOf("c", "h"),
            CodeWhispererCpp.INSTANCE to listOf("cpp", "c++", "cc"),
            CodeWhispererShell.INSTANCE to listOf("sh"),
            CodeWhispererRuby.INSTANCE to listOf("rb"),
            CodeWhispererRust.INSTANCE to listOf("rs"),
            CodeWhispererGo.INSTANCE to listOf("go"),
            CodeWhispererPhp.INSTANCE to listOf("php"),
            CodeWhispererSql.INSTANCE to listOf("sql"),
            CodeWhispererPlainText.INSTANCE to listOf("txt")
        )
    }
}

fun PsiFile.programmingLanguage(): CodeWhispererProgrammingLanguage = CodeWhispererLanguageManager.getInstance().getLanguage(this)

fun VirtualFile.programmingLanguage(): CodeWhispererProgrammingLanguage = CodeWhispererLanguageManager.getInstance().getLanguage(this)
