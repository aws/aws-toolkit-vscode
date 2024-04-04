// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig

import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.containers.addIfNotNull
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.SecurityScanType
import software.aws.toolkits.resources.message
import java.io.IOException

internal class CsharpCodeScanSessionConfig(
    private val selectedFile: VirtualFile,
    private val project: Project,
    private val scanType: SecurityScanType
) : CodeScanSessionConfig(selectedFile, project, scanType) {

    private val importRegex = Regex("^(global\\s)?using\\s(static\\s)?((\\b[A-Z][A-Za-z]+(\\.\\b[A-Z][A-Za-z]+)*)|\\w+\\s*=\\s*([\\w.]+));$")

    private val projectContentRoots = ProjectRootManager.getInstance(project).contentRoots
    override val sourceExt: List<String> = listOf(".cs")

    override fun overallJobTimeoutInSeconds(): Long = CodeWhispererConstants.CSHARP_CODE_SCAN_TIMEOUT_IN_SECONDS

    // Payload Size for C#: 1MB
    override fun getPayloadLimitInBytes(): Int = CodeWhispererConstants.CSHARP_PAYLOAD_LIMIT_IN_BYTES

    // Generate the combinations for module paths
    private fun generateModulePaths(inputPath: String): MutableSet<String> {
        val inputPaths = inputPath.split('.')
        val outputPaths = mutableSetOf<String>()
        for (i in inputPaths.indices) {
            val outputPath = inputPaths.subList(0, i + 1).joinToString(FILE_SEPARATOR.toString())
            outputPaths.add(outputPath)
        }
        return outputPaths
    }

    private fun getModulePath(modulePathString: String): MutableSet<String> {
        val index = modulePathString.indexOf("=")
        val modulePathStrings = if (index != -1) {
            modulePathString.substring(index + 1)
        } else {
            modulePathString
        }
        return generateModulePaths(modulePathStrings.trim())
    }

    private fun extractModulePaths(modulePathLine: String): Set<String> {
        val modulePaths = mutableSetOf<String>()
        // Check if Import statement starts with either "using" or "global using"
        if (modulePathLine.startsWith(CodeWhispererConstants.USING) || modulePathLine.startsWith(CodeWhispererConstants.GLOBAL_USING)) {
            // Check for "static" keyword in the Import statement
            val indexStatic = modulePathLine.indexOf(CodeWhispererConstants.STATIC)
            if (indexStatic != -1) {
                val modulePathString = modulePathLine.substring(indexStatic + CodeWhispererConstants.STATIC.length).trim()
                modulePaths.addAll(getModulePath(modulePathString.replace(" ", "")))
            } else {
                // Check for "using" keyword in the Import statement
                val indexOfUsing = modulePathLine.indexOf(CodeWhispererConstants.USING)
                if (indexOfUsing != -1) {
                    val modulePathString = modulePathLine.substring(indexOfUsing + CodeWhispererConstants.USING.length).trim()
                    modulePaths.addAll(getModulePath(modulePathString.replace(" ", "")))
                }
            }
        }
        return modulePaths.toSet()
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

        val validSourceFiles = importedFilePaths.filter { !includedSourceFiles.contains(it) }
        validSourceFiles.forEach { validFile ->
            importedFiles.add(validFile)
        }
        return importedFiles
    }
}
