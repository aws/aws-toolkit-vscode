// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.language

import com.intellij.openapi.components.service
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererCsharp
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJavaScript
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJsx
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPlainText
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPython
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererTsx
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererTypeScript
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererUnknownLanguage

class CodeWhispererLanguageManager {
    fun getLanguage(vFile: VirtualFile): CodeWhispererProgrammingLanguage {
        val fileTypeName = vFile.fileType.name.lowercase()
        return when {
            fileTypeName.contains("python") -> CodeWhispererPython.INSTANCE
            fileTypeName.contains("javascript") -> CodeWhispererJavaScript.INSTANCE
            fileTypeName.contains("java") -> CodeWhispererJava.INSTANCE
            fileTypeName.contains("jsx harmony") -> CodeWhispererJsx.INSTANCE
            fileTypeName.contains("c#") -> CodeWhispererCsharp.INSTANCE
            fileTypeName.contains("typescript jsx") -> CodeWhispererTsx.INSTANCE
            fileTypeName.contains("typescript") -> CodeWhispererTypeScript.INSTANCE
            fileTypeName.contains("plain_text") -> CodeWhispererPlainText.INSTANCE
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
    }
}

fun PsiFile.programmingLanguage(): CodeWhispererProgrammingLanguage = CodeWhispererLanguageManager.getInstance().getLanguage(this)

fun VirtualFile.programmingLanguage(): CodeWhispererProgrammingLanguage = CodeWhispererLanguageManager.getInstance().getLanguage(this)
