// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import org.apache.commons.codec.digest.DigestUtils
import software.aws.toolkits.core.utils.createTemporaryZipFile
import software.aws.toolkits.core.utils.putNextEntry
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.model.ZipCreationResult
import java.io.File
import java.io.FileInputStream
import java.util.Base64
import kotlin.io.path.Path
import kotlin.io.path.relativeTo

class FeatureDevSessionContext(val project: Project) {

    private var _projectRoot = project.guessProjectDir() ?: error("Cannot guess base directory for project ${project.name}")
    private val ignorePatterns = listOf(
        "\\.aws-sam",
        "\\.svn",
        "\\.hg/",
        "\\.rvm",
        "\\.git/",
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

    fun getProjectZip(): ZipCreationResult {
        val zippedProject = runReadAction { zipFiles(projectRoot) }
        val checkSum256: String = Base64.getEncoder().encodeToString(DigestUtils.sha256(FileInputStream(zippedProject)))
        return ZipCreationResult(zippedProject, checkSum256, zippedProject.length())
    }

    private fun ignoreFile(file: File): Boolean {
        val ignorePatternsWithGitIgnore = ignorePatterns + parseGitIgnore(File(projectRoot.path, ".gitignore")).map { Regex(it) }
        return ignorePatternsWithGitIgnore.any { p -> p.containsMatchIn(file.path) }
    }

    private fun zipFiles(projectRoot: VirtualFile): File = createTemporaryZipFile {
        VfsUtil.collectChildrenRecursively(projectRoot).map { virtualFile -> File(virtualFile.path) }.forEach { file ->
            if (file.isFile() && !ignoreFile(file)) {
                val relativePath = Path(file.path).relativeTo(projectRoot.toNioPath())
                it.putNextEntry(relativePath.toString(), Path(file.path))
            }
        }
    }.toFile()

    private fun parseGitIgnore(gitIgnoreFile: File): List<String> {
        if (!gitIgnoreFile.exists()) {
            return emptyList()
        }
        return gitIgnoreFile.readLines()
            .filterNot { it.isBlank() || it.startsWith("#") }
            .map { it.trim() }
            .map { convertGitIgnorePatternToRegex(it) }
    }

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
