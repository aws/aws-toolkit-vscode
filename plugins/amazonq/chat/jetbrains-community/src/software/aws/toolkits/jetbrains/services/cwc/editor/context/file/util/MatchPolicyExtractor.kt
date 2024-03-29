// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.editor.context.file.util

import com.fasterxml.jackson.module.kotlin.readValue
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.amazonq.webview.FqnWebviewAdapter
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.MatchPolicy
import software.aws.toolkits.jetbrains.services.cwc.controller.ChatController

object MatchPolicyExtractor {
    suspend fun extractMatchPolicyFromCurrentFile(
        isCodeSelected: Boolean = false,
        fileLanguage: String?,
        fileText: String?,
        fqnWebviewAdapter: FqnWebviewAdapter,
    ): MatchPolicy? {
        val should = extractAdditionalLanguageMatchPolicies(fileLanguage)

        val must = mutableSetOf<String>()

        if (fileLanguage == null || fileText == null) return MatchPolicy()

        if (isCodeSelected) must.add(fileLanguage) else should.add(fileLanguage)

        val readImportsRequest = ReadImportsRequest(fileText, fileLanguage)
        val requestString = ChatController.objectMapper.writeValueAsString(readImportsRequest)

        return try {
            val importsString = fqnWebviewAdapter.readImports(requestString)
            val imports = ChatController.objectMapper.readValue<List<String>>(importsString)

            imports
                .filterIndexed { index, elem -> index == imports.indexOf(elem) && elem != fileLanguage }
                .forEach { importKey -> should.add(importKey) }
            MatchPolicy(must, should)
        } catch (e: Exception) {
            getLogger<MatchPolicyExtractor>().warn(e) { "Failed to extract imports from file" }
            null
        }
    }

    private fun extractAdditionalLanguageMatchPolicies(languageId: String?): MutableSet<String> {
        if (languageId == null) {
            return mutableSetOf()
        }

        if (
            languages.contains(languageId)
        ) {
            return mutableSetOf()
        }

        return when (languageId) {
            "bat" -> mutableSetOf("windows")
            "cpp", "csharp", "fsharp", "git-commit", "git-rebase", "objective-c", "objective-cpp",
            "plaintext", "jade", "shellscript", "vb",
            -> mutableSetOf()

            "cuda-cpp" -> mutableSetOf("cuda")
            "dockerfile" -> mutableSetOf("docker")
            "javascriptreact", "typescriptreact" -> mutableSetOf("react")
            "jsonc" -> mutableSetOf("comments")
            "razor" -> mutableSetOf("html")
            "scss" -> mutableSetOf("scss", "css")
            "vue-html" -> mutableSetOf("html")
            else -> {
                if (listOf("javascript", "node").any { identifier -> languageId.contains(identifier) } ||
                    languageId.contains("typescript") ||
                    languageId.contains("python")
                ) {
                    mutableSetOf()
                } else {
                    mutableSetOf()
                }
            }
        }
    }

    val languages = listOf(
        "yaml",
        "xsl",
        "xml",
        "vue",
        "tex",
        "typescript",
        "swift",
        "stylus",
        "sql",
        "slim",
        "shaderlab",
        "sass",
        "rust",
        "ruby",
        "r",
        "python",
        "pug",
        "powershell",
        "php",
        "perl",
        "markdown",
        "makefile",
        "lua",
        "less",
        "latex",
        "json",
        "javascript",
        "java",
        "ini",
        "html",
        "haml",
        "handlebars",
        "groovy",
        "go",
        "diff",
        "css",
        "c",
        "coffeescript",
        "clojure",
        "bibtex",
        "abap",
    )
}

data class ReadImportsRequest(
    val fileContent: String,
    val language: String,
)
