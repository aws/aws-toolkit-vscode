// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig

import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.containers.addIfNotNull
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.PYTHON_CODE_SCAN_TIMEOUT_IN_SECONDS
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.PYTHON_PAYLOAD_LIMIT_IN_BYTES
import software.aws.toolkits.resources.message
import java.io.IOException

internal class PythonCodeScanSessionConfig(
    private val selectedFile: VirtualFile,
    private val project: Project,
    private val scanType: String
) : CodeScanSessionConfig(selectedFile, project, scanType) {

    private val importRegex = Regex("^(?:from\\s+(\\S+)\\s+)?(?:import\\s+((?:\\S+(?:\\s+as\\s+\\S+)?\\s*[,]?\\s*)+))\$")
    private val projectContentRoots = ProjectRootManager.getInstance(project).contentRoots
    override val sourceExt: List<String> = listOf(".py")

    override fun overallJobTimeoutInSeconds(): Long = PYTHON_CODE_SCAN_TIMEOUT_IN_SECONDS

    override fun getPayloadLimitInBytes(): Int = PYTHON_PAYLOAD_LIMIT_IN_BYTES

    fun parseImports(file: VirtualFile): List<String> {
        val imports = mutableSetOf<String>()
        try {
            file.inputStream.use {
                it.bufferedReader().lines().forEach { line ->
                    val importMatcher = importRegex.toPattern().matcher(line)
                    if (importMatcher.find()) {
                        // Group(1) is the 'from' module in the import statement.
                        // For E.g. in "from <Module1> import xyz", import module is Module1
                        val fromModule = importMatcher.group(1)?.plus(FILE_SEPARATOR) ?: ""
                        // Group(2) is the "<Module1> as <asName1>, <Module2> as <asName2>, <Module3>,..." statement
                        val importStatements = importMatcher.group(2)
                        importStatements.split(",").forEach { statement ->
                            // Just get the first word in <module> [as <name>] statement
                            val importModule = statement.trim().split(" ").first()
                            val importPath = fromModule + importModule.replace(".", FILE_SEPARATOR.toString()) + sourceExt[0]
                            imports.add(importPath)
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
        projectContentRoots.forEach { root ->
            imports.forEach { importPath ->
                val importedFilePath = getPath(root.path, importPath)
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
