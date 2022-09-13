// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.language

import com.intellij.openapi.components.service
import software.aws.toolkits.jetbrains.services.codewhisperer.model.ProgrammingLanguage
import software.aws.toolkits.telemetry.CodewhispererLanguage

class CodeWhispererLanguageManager {
    private val supportedLanguage = setOf(
        CodewhispererLanguage.Java.toString(),
        CodewhispererLanguage.Python.toString(),
        CodewhispererLanguage.Javascript.toString()
    )

    fun isLanguageSupported(language: ProgrammingLanguage): Boolean {
        val mappedLanguage = getParentLanguage(language)
        return supportedLanguage.contains(mappedLanguage.languageName)
    }

    /**
     * This should be called to map some language dialect to their mother language
     * e.g. JSX -> JavaScript, TypeScript -> JavaScript etc.
     */
    internal fun getParentLanguage(language: ProgrammingLanguage): ProgrammingLanguage =
        when {
            language.languageName.contains("jsx") -> ProgrammingLanguage(CodewhispererLanguage.Javascript)
            else -> language
        }

    companion object {
        fun getInstance(): CodeWhispererLanguageManager = service()
    }
}

fun ProgrammingLanguage.toCodeWhispererLanguage() = when {
    languageName.contains("python") -> CodewhispererLanguage.Python
    languageName.contains("javascript") -> CodewhispererLanguage.Javascript
    languageName.contains("java") -> CodewhispererLanguage.Java
    languageName.contains("jsx") -> CodewhispererLanguage.Jsx
    languageName.contains("plain_text") -> CodewhispererLanguage.Plaintext
    else -> CodewhispererLanguage.Unknown
}

fun CodewhispererLanguage.toProgrammingLanguage() = ProgrammingLanguage(this.toString())
