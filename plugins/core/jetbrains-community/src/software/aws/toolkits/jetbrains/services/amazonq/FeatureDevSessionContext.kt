// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq

import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileVisitor
import com.intellij.openapi.vfs.isFile
import com.intellij.platform.ide.progress.withBackgroundProgress
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.apache.commons.codec.digest.DigestUtils
import software.aws.toolkits.core.utils.outputStream
import software.aws.toolkits.core.utils.putNextEntry
import software.aws.toolkits.jetbrains.core.coroutines.EDT
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineBgContext
import software.aws.toolkits.resources.message
import java.io.File
import java.io.FileInputStream
import java.nio.file.Files
import java.nio.file.Path
import java.util.Base64
import java.util.zip.ZipOutputStream
import kotlin.io.path.Path
import kotlin.io.path.relativeTo

class FeatureDevSessionContext(val project: Project) {
    // TODO: Need to correct this class location in the modules going further to support both amazonq and codescan.

    private val ignorePatterns = setOf(
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
        "node_modules/",
        "build/",
        "dist/"
    ).map { Regex(it) }

    private var _projectRoot = project.guessProjectDir() ?: error("Cannot guess base directory for project ${project.name}")
    private var ignorePatternsWithGitIgnore = emptyList<Regex>()
    private val gitIgnoreFile = File(projectRoot.path, ".gitignore")

    init {
        ignorePatternsWithGitIgnore = (ignorePatterns + parseGitIgnore().map { Regex(it) }).toList()
    }

    fun getProjectZip(): ZipCreationResult {
        val zippedProject = runBlocking {
            withBackgroundProgress(project, message("amazonqFeatureDev.create_plan.background_progress_title")) {
                zipFiles(projectRoot)
            }
        }
        val checkSum256: String = Base64.getEncoder().encodeToString(DigestUtils.sha256(FileInputStream(zippedProject)))
        return ZipCreationResult(zippedProject, checkSum256, zippedProject.length())
    }

    private suspend fun ignoreFile(file: File, scope: CoroutineScope): Boolean = with(scope) {
        val deferredResults = ignorePatternsWithGitIgnore.map { pattern ->
            async {
                pattern.containsMatchIn(file.path)
            }
        }
        deferredResults.any { it.await() }
    }

    suspend fun ignoreFile(file: VirtualFile, scope: CoroutineScope): Boolean = ignoreFile(File(file.path), scope)

    suspend fun zipFiles(projectRoot: VirtualFile): File = withContext(getCoroutineBgContext()) {
        val files = mutableListOf<VirtualFile>()
        VfsUtil.visitChildrenRecursively(
            projectRoot,
            object : VirtualFileVisitor<Unit>() {
                override fun visitFile(file: VirtualFile): Boolean {
                    if (file.isFile) {
                        files.add(file)
                        return true
                    }
                    return runBlocking {
                        !ignoreFile(file, this)
                    }
                }
            }
        )

        // Process files in parallel
        val filesToIncludeFlow = channelFlow {
            // chunk with some reasonable number because we don't actually need a new job for each file
            files.chunked(50).forEach { chunk ->
                launch {
                    for (file in chunk) {
                        if (file.isFile && !ignoreFile(file, this)) {
                            send(file)
                        }
                    }
                }
            }
        }

        createTemporaryZipFileAsync { zipOutput ->
            filesToIncludeFlow.collect { file ->
                val relativePath = Path(file.path).relativeTo(projectRoot.toNioPath())
                zipOutput.putNextEntry(relativePath.toString(), Path(file.path))
            }
        }
    }.toFile()

    private suspend fun createTemporaryZipFileAsync(block: suspend (ZipOutputStream) -> Unit): Path = withContext(EDT) {
        val file = Files.createTempFile(null, ".zip")
        ZipOutputStream(file.outputStream()).use { zipOutput -> block(zipOutput) }
        file
    }

    private fun parseGitIgnore(): Set<String> {
        if (!gitIgnoreFile.exists()) {
            return emptySet()
        }
        return gitIgnoreFile.readLines()
            .filterNot { it.isBlank() || it.startsWith("#") }
            .map { it.trim() }
            .map { convertGitIgnorePatternToRegex(it) }
            .toSet()
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
