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
import java.nio.file.Path
import java.util.stream.Collectors
import kotlin.io.path.isDirectory
import kotlin.io.path.listDirectoryEntries

internal class GoCodeScanSessionConfig(
    private val selectedFile: VirtualFile,
    private val project: Project,
    private val scanType: CodeWhispererConstants.SecurityScanType
) : CodeScanSessionConfig(selectedFile, project, scanType) {
    private val importRegex = Regex("^\\s*import\\s+([^(]+?\$|\\([^)]+\\))", RegexOption.MULTILINE)
    private val moduleRegex = Regex("\"[^\"\\r\\n]+\"", RegexOption.MULTILINE)

    private val projectContentRoots = ProjectRootManager.getInstance(project).contentRoots

    override val sourceExt: List<String> = listOf(".go")

    override fun overallJobTimeoutInSeconds(): Long = CodeWhispererConstants.GO_CODE_SCAN_TIMEOUT_IN_SECONDS

    override fun getPayloadLimitInBytes(): Int = CodeWhispererConstants.GO_PAYLOAD_LIMIT_IN_BYTES

    private fun extractModulePaths(importGroup: String): Set<String> {
        val modulePaths = mutableSetOf<String>()
        val moduleMatcher = moduleRegex.toPattern().matcher(importGroup)
        while (moduleMatcher.find()) {
            val match = moduleMatcher.group()
            modulePaths.add(match.substring(1, match.length - 1))
        }
        return modulePaths.toSet()
    }

    fun parseImports(file: VirtualFile): List<String> {
        val imports = mutableSetOf<String>()
        try {
            file.inputStream.use {
                val lines = it.bufferedReader().lines().collect(Collectors.joining("\n"))
                val importMatcher = importRegex.toPattern().matcher(lines)
                while (importMatcher.find()) {
                    val goalImports = extractModulePaths(importMatcher.group())
                    imports.addAll(goalImports)
                }
            }
        } catch (e: IOException) {
            error(message("codewhisperer.codescan.cannot_read_file", file.path))
        }
        return imports.toList()
    }

    private fun generateSourceFilePath(modulePath: String, dirPath: String): Path? {
        if (modulePath.isEmpty()) {
            return null
        }
        val packageDir = getPath(dirPath, modulePath)
        val slashPos = modulePath.indexOf("/")
        val newModulePath = if (slashPos != -1) modulePath.substring(slashPos + 1) else ""
        return if (packageDir?.exists() == true) packageDir else generateSourceFilePath(newModulePath, dirPath)
    }

    private fun getImportedPackages(file: VirtualFile): List<Path> {
        val importedPackages = mutableListOf<Path>()
        val imports = parseImports(file)
        projectContentRoots.forEach { root ->
            imports.forEach { importPath ->
                val importedFilePath = generateSourceFilePath(importPath, root.path)
                importedPackages.addIfNotNull(importedFilePath)
            }
        }
        return importedPackages
    }

    private fun getSiblingFiles(file: VirtualFile): List<Path> = listGoFilesInDir(file.parent.toNioPath()).filter {
        it.fileName.toString() != file.name
    }

    private fun listGoFilesInDir(path: Path): List<Path> = path.listDirectoryEntries().filter {
        !it.isDirectory() && it.fileName.toString().endsWith(sourceExt[0])
    }

    override fun getImportedFiles(file: VirtualFile, includedSourceFiles: Set<String>): List<String> {
        val importedFiles = mutableListOf<String>()
        val importedFilePaths = mutableListOf<String>()

        val siblingFiles = getSiblingFiles(file)
        siblingFiles.forEach { sibling ->
            importedFilePaths.addIfNotNull(sibling.toFile().toVirtualFile()?.path)
        }

        val importedPackages = getImportedPackages(file)
        importedPackages.forEach { pkg ->
            val files = listGoFilesInDir(pkg)
                .mapNotNull { it.toFile().toVirtualFile()?.path }
            importedFilePaths.addAll(files)
        }

        val validSourceFiles = importedFilePaths.filter { !includedSourceFiles.contains(it) }
        validSourceFiles.forEach { validFile ->
            importedFiles.add(validFile)
        }

        return importedFiles
    }
}
