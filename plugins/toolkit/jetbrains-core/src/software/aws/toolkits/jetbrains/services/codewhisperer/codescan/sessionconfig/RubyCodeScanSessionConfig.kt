// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig

import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.containers.addIfNotNull
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.resources.message
import java.io.IOException

internal class RubyCodeScanSessionConfig(
    private val selectedFile: VirtualFile,
    private val project: Project,
    private val scanType: CodeWhispererConstants.SecurityScanType
) : CodeScanSessionConfig(selectedFile, project, scanType) {

    private val importRegex = Regex("^(require|require_relative|load|include|extend)\\s+('[^']+'|\"[^\"]+\"|\\w+)(\\s+as\\s+(\\w+))?")
    private val projectContentRoots = ProjectRootManager.getInstance(project).contentRoots
    override val sourceExt: List<String> = listOf(".rb")

    override fun overallJobTimeoutInSeconds(): Long = CodeWhispererConstants.RUBY_CODE_SCAN_TIMEOUT_IN_SECONDS
    override fun getPayloadLimitInBytes(): Int = CodeWhispererConstants.RUBY_PAYLOAD_LIMIT_IN_BYTES

    private fun generateModulePaths(inputPath: String): MutableSet<String> {
        val positionOfExt = inputPath.indexOf(sourceExt[0])
        val inputPathString = if (positionOfExt != -1) {
            inputPath.substring(0, positionOfExt).trim()
        } else {
            inputPath
        }
        val inputPaths = inputPathString.split('/')
        val outputPaths = mutableSetOf<String>()
        for (i in inputPaths.indices) {
            val outputPath = inputPaths.subList(0, i + 1).joinToString(FILE_SEPARATOR.toString())
            outputPaths.add(outputPath)
        }
        return outputPaths
    }

    private fun getModulePath(modulePathStr: String): MutableSet<String> {
        val pos = modulePathStr.indexOf(" ${CodeWhispererConstants.AS} ")
        val modifiedModulePathStr = if (pos != -1) {
            modulePathStr.substring(0, pos)
        } else {
            modulePathStr
        }

        return generateModulePaths(modifiedModulePathStr.replace(Regex("[\",'\\s()]"), "").trim())
    }

    private fun extractModulePaths(importStr: String): Set<String> {
        val modulePaths = mutableSetOf<String>()
        val requireKeyword = CodeWhispererConstants.REQUIRE
        val requireRelativeKeyword = CodeWhispererConstants.REQUIRE_RELATIVE
        val includeKeyword = CodeWhispererConstants.INCLUDE
        val extendKeyword = CodeWhispererConstants.EXTEND
        val loadKeyword = CodeWhispererConstants.LOAD

        var keyword: String? = null

        when {
            importStr.startsWith(requireRelativeKeyword) -> {
                keyword = requireRelativeKeyword
            }
            importStr.startsWith(requireKeyword) -> {
                keyword = requireKeyword
            }
            importStr.startsWith(includeKeyword) -> {
                keyword = includeKeyword
            }
            importStr.startsWith(extendKeyword) -> {
                keyword = extendKeyword
            }
            importStr.startsWith(loadKeyword) -> {
                keyword = loadKeyword
            }
        }

        if (keyword != null) {
            val modulePathStr = importStr
                .substring(keyword.length)
                .trim()
                .replace(Regex("\\s+"), "")
            modulePaths.addAll(getModulePath(modulePathStr))
        }

        return modulePaths
    }

    fun parseImports(file: VirtualFile): List<String> {
        val imports = mutableSetOf<String>()
        try {
            file.inputStream.use {
                it.bufferedReader().lines().forEach { line ->
                    val importMatcher = importRegex.toPattern().matcher(line)
                    if (importMatcher.find()) {
                        val modulePathLine = line.replace(";", "")
                        val goalImports = extractModulePaths(modulePathLine)
                        imports.addAll(goalImports)
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

        projectContentRoots.forEach { root ->
            imports.forEach { importPath ->
                val importedFilePath = getPath(root.path, importPath + sourceExt[0])
                if (importedFilePath?.exists() == true) {
                    importedFilePaths.addIfNotNull(importedFilePath.toFile().toVirtualFile()?.path)
                }
            }
        }

        val validSourceFiles = importedFilePaths.filter { it !in includedSourceFiles }
        validSourceFiles.forEach { validFile ->
            importedFiles.add(validFile)
        }
        return importedFiles
    }
}
