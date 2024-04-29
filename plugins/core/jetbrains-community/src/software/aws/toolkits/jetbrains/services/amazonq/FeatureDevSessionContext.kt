// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq

import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import org.apache.commons.codec.digest.DigestUtils
import software.aws.toolkits.core.utils.createTemporaryZipFile
import software.aws.toolkits.core.utils.putNextEntry
import java.io.File
import java.io.FileInputStream
import java.util.Base64
import kotlin.io.path.Path
import kotlin.io.path.relativeTo

class FeatureDevSessionContext(val project: Project) {
    // TODO: Need to correct this class location in the modules going further to support both amazonq and codescan.

    private val ignorePatterns = listOf(
        "\\.aws-sam",
        "\\.svn",
        "\\.hg/",
        "\\.rvm",
        "\\.git/",
        "\\.gitignore",
        "\\.project",
        "\\.gem",
        "/\\.idea/",
        "\\.zip$",
        "\\.bin$",
        "\\.png$",
        "\\.jpg$",
        "\\.svg$",
        "\\.pyc$",
        "/license\\.txt$",
        "/License\\.txt$",
        "/LICENSE\\.txt$",
        "/license\\.md$",
        "/License\\.md$",
        "/LICENSE\\.md$",
    ).map { Regex(it) }

    private var _projectRoot = project.guessProjectDir() ?: error("Cannot guess base directory for project ${project.name}")
    private var ignorePatternsWithGitIgnore = emptyList<Regex>()
    private val gitIgnoreFile = File(projectRoot.path, ".gitignore")

    init {
        ignorePatternsWithGitIgnore = ignorePatterns + parseGitIgnore().map { Regex(it) }
    }

    fun getProjectZip(): ZipCreationResult {
        val zippedProject = runReadAction { zipFiles(projectRoot) }
        val checkSum256: String = Base64.getEncoder().encodeToString(DigestUtils.sha256(FileInputStream(zippedProject)))
        return ZipCreationResult(zippedProject, checkSum256, zippedProject.length())
    }

    fun ignoreFile(file: File): Boolean = try {
        ignorePatternsWithGitIgnore.any { p -> p.containsMatchIn(file.path) }
    } catch (e: Exception) {
        true
    }

    fun ignoreFile(file: VirtualFile): Boolean = ignoreFile(File(file.path))

    private fun zipFiles(projectRoot: VirtualFile): File = createTemporaryZipFile {
        VfsUtil.collectChildrenRecursively(projectRoot).map { virtualFile -> File(virtualFile.path) }.forEach { file ->
            if (file.isFile() && !ignoreFile(file)) {
                val relativePath = Path(file.path).relativeTo(projectRoot.toNioPath())
                it.putNextEntry(relativePath.toString(), Path(file.path))
            }
        }
    }.toFile()

    private fun parseGitIgnore(): List<String> {
        if (!gitIgnoreFile.exists()) {
            return emptyList()
        }
        return gitIgnoreFile.readLines()
            .filterNot { it.isBlank() || it.startsWith("#") }
            .map { it.trim() }
            .map { convertGitIgnorePatternToRegex(it) }
    }

    // gitignore patterns are not regex, method update needed.
    private fun convertGitIgnorePatternToRegex(pattern: String): String = pattern
        .replace(".", "\\.")
        .replace("*", ".*")
        .let { if (it.endsWith("/")) "$it?" else it } // Handle directory-specific patterns by optionally matching trailing slash

    var projectRoot: VirtualFile
        set(newRoot) {
            _projectRoot = newRoot
        }
        get() = _projectRoot
}

data class ZipCreationResult(val payload: File, val checksum: String, val contentLength: Long)
