// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig

import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.fileTooLarge
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.PYTHON_CODE_SCAN_TIMEOUT_IN_SECONDS
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.PYTHON_PAYLOAD_LIMIT_IN_BYTES
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodewhispererLanguage
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant

internal class PythonCodeScanSessionConfig(
    private val selectedFile: VirtualFile,
    private val project: Project
) : CodeScanSessionConfig() {

    private val projectRoot = project.guessProjectDir()
    private val importRegex = Regex("^(?:from\\s+(\\S+)\\s+)?(?:import\\s+((?:\\S+(?:\\s+as\\s+\\S+)?\\s*[,]?\\s*)+))\$")
    private val projectContentRoots = ProjectRootManager.getInstance(project).contentRoots
    private val sourceExt = ".py"

    override fun overallJobTimeoutInSeconds(): Long = PYTHON_CODE_SCAN_TIMEOUT_IN_SECONDS

    override fun getPayloadLimitInBytes(): Int = PYTHON_PAYLOAD_LIMIT_IN_BYTES

    override fun createPayload(): Payload {
        // Fail fast if the selected file size is greater than the payload limit.
        if (selectedFile.length > getPayloadLimitInBytes()) {
            fileTooLarge(getPresentablePayloadLimit())
        }

        val start = Instant.now().toEpochMilli()

        LOG.debug { "Creating payload. File selected as root for the context truncation: ${selectedFile.path}" }

        val (includedSourceFiles, payloadSize, totalLines) = includeDependencies()

        // Copy all the included source files to the source zip
        val srcZip = zipFiles(includedSourceFiles.map { Path.of(it) })
        val payloadContext = PayloadContext(
            CodewhispererLanguage.Python,
            totalLines,
            includedSourceFiles.size,
            Instant.now().toEpochMilli() - start,
            payloadSize,
            srcZip.length()
        )

        return Payload(payloadContext, srcZip)
    }

    private data class PayloadMetadata(val sourceFiles: Set<String>, val payloadSize: Long, val linesScanned: Long)

    private fun parseImports(file: VirtualFile): List<String> {
        val imports = mutableSetOf<String>()
        val inputStream = file.inputStream
        try {
            inputStream.use {
                it.bufferedReader().lines().forEach { line ->
                    val importMatcher = importRegex.toPattern().matcher(line)
                    if (importMatcher.find()) {
                        // Group(1) is the 'from' module in the import statement.
                        // For E.g. in "from <Module1> import xyz", import module is Module1
                        val fromModule = importMatcher.group(1)?.plus(File.separator) ?: ""
                        // Group(2) is the "<Module1> as <asName1>, <Module2> as <asName2>, <Module3>,..." statement
                        val importStatements = importMatcher.group(2)
                        importStatements.split(",").forEach { statement ->
                            // Just get the first word in <module> [as <name>] statement
                            val importModule = statement.trim().split(" ").first()
                            val importPath = fromModule + importModule.replace(".", File.separator) + sourceExt
                            imports.add(importPath)
                        }
                    }
                }
            }
        } catch (e: IOException) {
            error(message("codewhisperer.codescan.cannot_read_file", file.path))
        } finally {
            inputStream.close()
        }
        return imports.toList()
    }

    private fun getAbsoluteFilePaths(importPaths: List<String>): List<String> {
        val filePaths = mutableListOf<String>()
        projectContentRoots.forEach { root ->
            importPaths.forEach { importPath ->
                val filePath = Path.of(root.path, importPath)
                if (filePath.toFile().exists()) filePaths.add(filePath.toString())
            }
        }
        return filePaths
    }

    private fun getImportedFiles(file: VirtualFile, includedSourceFiles: Set<String>): List<String> {
        val importedFiles = mutableListOf<String>()
        val imports = parseImports(file)
        val importedFilePaths = getAbsoluteFilePaths(imports)
        val validSourceFiles = importedFilePaths.filter { !includedSourceFiles.contains(it) }
        validSourceFiles.forEach { validFile ->
            importedFiles.add(validFile)
        }
        return importedFiles
    }

    private fun includeDependencies(): PayloadMetadata {
        val includedSourceFiles = mutableSetOf<String>()
        var currentTotalFileSize = 0L
        var currentTotalLines = 0L
        val files = getSourceFilesUnderProjectRoot()
        val queue = ArrayDeque<String>()

        files.forEach { pivotFile ->
            val filePath = pivotFile.path
            queue.addLast(filePath)

            // BFS
            while (queue.isNotEmpty()) {
                val currentFilePath = queue.removeFirst()
                val currentFile = File(currentFilePath).toVirtualFile()
                if (includedSourceFiles.contains(currentFilePath) || currentFile == null) continue

                val currentFileSize = currentFile.length

                // Ignore file greater than the payload size.
                if (currentFileSize > getPayloadLimitInBytes()) continue

                if (currentTotalFileSize > getPayloadLimitInBytes() - currentFileSize) {
                    return PayloadMetadata(includedSourceFiles, currentTotalFileSize, currentTotalLines)
                }

                currentTotalFileSize += currentFileSize
                currentTotalLines += Files.lines(currentFile.toNioPath()).count()
                includedSourceFiles.add(currentFilePath)

                getImportedFiles(currentFile, includedSourceFiles).forEach {
                    if (!includedSourceFiles.contains(it)) queue.addLast(it)
                }
            }
        }

        return PayloadMetadata(includedSourceFiles, currentTotalFileSize, currentTotalLines)
    }

    private fun getSourceFilesUnderProjectRoot(): List<VirtualFile> {
        // Include the current selected file
        val files = mutableListOf(selectedFile)
        // Include other files only if the current file is in the project.
        if (projectRoot != null && selectedFile.path.startsWith(projectRoot.path)) {
            files.addAll(
                VfsUtil.collectChildrenRecursively(projectRoot).filter {
                    it.path.endsWith(sourceExt) && it != selectedFile
                }
            )
        }
        return files
    }

    companion object {
        private val LOG = getLogger<PythonCodeScanSessionConfig>()
    }
}
