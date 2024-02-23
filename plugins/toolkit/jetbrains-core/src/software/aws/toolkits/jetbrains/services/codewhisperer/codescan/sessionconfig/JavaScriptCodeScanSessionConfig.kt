// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.containers.addIfNotNull
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.JS_CODE_SCAN_TIMEOUT_IN_SECONDS
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.JS_PAYLOAD_LIMIT_IN_BYTES
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodewhispererLanguage
import java.io.IOException
import java.nio.file.Path

internal class JavaScriptCodeScanSessionConfig(
    private val selectedFile: VirtualFile,
    private val project: Project,
    private val language: CodewhispererLanguage
) : CodeScanSessionConfig(selectedFile, project) {

    private val importRegex = Regex("^import.*(?:[\"'](.+)[\"']);?\$")
    private val requireRegex = Regex("^.+require\\(['\"](.+)['\"]\\)[ \\t]*;?")
    override val sourceExt by lazy {
        if (language === CodewhispererLanguage.Javascript) {
            listOf(".js")
        } else {
            listOf(".ts")
        }
    }

    override fun overallJobTimeoutInSeconds(): Long = JS_CODE_SCAN_TIMEOUT_IN_SECONDS

    override fun getPayloadLimitInBytes(): Int = JS_PAYLOAD_LIMIT_IN_BYTES

    fun parseImports(file: VirtualFile): List<String> {
        val imports = mutableSetOf<String>()
        try {
            file.inputStream.use {
                it.bufferedReader().lines().forEach { line ->
                    val importMatcher = importRegex.toPattern().matcher(line)
                    val moduleName = when (importMatcher.find()) {
                        true -> importMatcher.group(1)
                        false -> {
                            val requireMatcher = requireRegex.toPattern().matcher(line)
                            if (requireMatcher.find()) {
                                requireMatcher.group(1)
                            } else {
                                ""
                            }
                        }
                    }.trim()
                    if (moduleName.isNotEmpty()) {
                        when (moduleName.endsWith(sourceExt[0])) {
                            true -> imports.add(moduleName)
                            false -> {
                                imports.add(moduleName + sourceExt[0])
                            }
                        }
                    }
                }
            }
        } catch (e: IOException) {
            error(message("codewhisperer.codescan.cannot_read_file", file.path))
        }
        return imports.toList()
    }

    override fun getImportedFiles(file: VirtualFile, includedSourceFiles: Set<String>): List<String> {
        val importedFiles = mutableListOf<String>()
        val imports = parseImports(file)
        val importedFilePaths = mutableListOf<String>()
        imports.forEach { importPath ->
            if (getPath(importPath)?.exists() == true) {
                importedFilePaths.add(Path.of(importPath).normalize().toString())
            } else {
                val importedFilePath = getPath(file.parent.path, importPath)
                if (importedFilePath?.exists() == true) {
                    importedFilePaths.addIfNotNull(importedFilePath.toFile().toVirtualFile()?.path)
                }
            }
        }
        val validSourceFiles = importedFilePaths.filter { !includedSourceFiles.contains(it) }
        validSourceFiles.forEach { validFile ->
            importedFiles.add(validFile)
        }
        return importedFiles
    }
}
