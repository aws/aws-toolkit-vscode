// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.language

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererC
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererCpp
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererCsharp
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererGo
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJavaScript
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJson
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
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererTf
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererTsx
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererTypeScript
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererUnknownLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererYaml

@Service
class CodeWhispererLanguageManager {
    // Always use this method to check for language support for CodeWhisperer features.
    // The return type here implicitly means that the corresponding language plugin has been installed to the user's IDE,
    // (e.g. 'Python' plugin for Python and 'JavaScript and TypeScript' for JS/TS). So we can leverage these language
    // plugin features when developing CodeWhisperer features.
    /**
     * resolve language by
     * 1. file type
     * 2. extension
     * 3. fallback to unknown
     */
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
            fileTypeName.contains("json") -> CodeWhispererJson.INSTANCE
            fileTypeName.contains("yaml") -> CodeWhispererYaml.INSTANCE
            fileTypeName.contains("tf") -> CodeWhispererTf.INSTANCE
            fileTypeName.contains("hcl") -> CodeWhispererTf.INSTANCE
            fileTypeName.contains("terraform") -> CodeWhispererTf.INSTANCE
            fileTypeName.contains("packer") -> CodeWhispererTf.INSTANCE
            fileTypeName.contains("terragrunt") -> CodeWhispererTf.INSTANCE
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
            // fileTypeName.contains("plain_text") -> CodeWhispererPlainText.INSTANCE // This needs to be removed because Hcl files are recognised as plain_text by JB
            else -> null
        }
            ?: languageExtensionsMap[fileExtension]
            ?: CodeWhispererUnknownLanguage.INSTANCE
    }

    /**
     * will call getLanguage(virtualFile) first, then fallback to string resolve in case of psi only exists in memeory
     */
    fun getLanguage(psiFile: PsiFile): CodeWhispererProgrammingLanguage = psiFile.virtualFile?.let {
        getLanguage(it)
    } ?: languageExtensionsMap.keys.find { ext -> psiFile.name.endsWith(ext) }?.let { languageExtensionsMap[it] }
        ?: CodeWhispererUnknownLanguage.INSTANCE

    companion object {
        fun getInstance(): CodeWhispererLanguageManager = service()

        /**
         * languageExtensionMap will look like
         * {
         *      "cpp" to CodeWhispererCpp,
         *      "c++" to CodeWhispererCpp,
         *      "cc" to CodeWhispererCpp,
         *      "java" to CodeWhispererJava,
         *      ...
         * }
         */
        val languageExtensionsMap = listOf(
            listOf("java") to CodeWhispererJava.INSTANCE,
            listOf("py") to CodeWhispererPython.INSTANCE,
            listOf("js") to CodeWhispererJavaScript.INSTANCE,
            listOf("jsx") to CodeWhispererJsx.INSTANCE,
            listOf("ts") to CodeWhispererTypeScript.INSTANCE,
            listOf("tsx") to CodeWhispererTsx.INSTANCE,
            listOf("cs") to CodeWhispererCsharp.INSTANCE,
            listOf("yaml") to CodeWhispererYaml.INSTANCE,
            listOf("json") to CodeWhispererJson.INSTANCE,
            listOf("tf") to CodeWhispererTf.INSTANCE,
            listOf("hcl") to CodeWhispererTf.INSTANCE, // TF and HCL both emit "tf" as Telemetry Language
            listOf("kt") to CodeWhispererKotlin.INSTANCE,
            listOf("scala") to CodeWhispererScala.INSTANCE,
            listOf("c", "h") to CodeWhispererC.INSTANCE,
            listOf("cpp", "c++", "cc") to CodeWhispererCpp.INSTANCE,
            listOf("sh") to CodeWhispererShell.INSTANCE,
            listOf("rb") to CodeWhispererRuby.INSTANCE,
            listOf("rs") to CodeWhispererRust.INSTANCE,
            listOf("go") to CodeWhispererGo.INSTANCE,
            listOf("php") to CodeWhispererPhp.INSTANCE,
            listOf("sql") to CodeWhispererSql.INSTANCE,
            listOf("txt") to CodeWhispererPlainText.INSTANCE
        ).map {
            val exts = it.first
            val lang = it.second
            exts.map { ext -> ext to lang }
        }.flatten()
            .associateBy({ it.first }, { it.second })
    }
}

fun PsiFile.programmingLanguage(): CodeWhispererProgrammingLanguage = CodeWhispererLanguageManager.getInstance().getLanguage(this)

fun VirtualFile.programmingLanguage(): CodeWhispererProgrammingLanguage = CodeWhispererLanguageManager.getInstance().getLanguage(this)
