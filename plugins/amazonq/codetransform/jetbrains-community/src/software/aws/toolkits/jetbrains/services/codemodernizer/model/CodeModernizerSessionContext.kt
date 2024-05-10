// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.projectRoots.JavaSdkVersion
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.wm.ToolWindowManager
import software.aws.toolkits.core.utils.createTemporaryZipFile
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.putNextEntry
import software.aws.toolkits.jetbrains.services.codemodernizer.CodeTransformTelemetryManager
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.HIL_DEPENDENCIES_ROOT_NAME
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.HIL_MANIFEST_FILE_NAME
import software.aws.toolkits.jetbrains.services.codemodernizer.ideMaven.runDependencyReportCommands
import software.aws.toolkits.jetbrains.services.codemodernizer.ideMaven.runHilMavenCopyDependency
import software.aws.toolkits.jetbrains.services.codemodernizer.ideMaven.runMavenCopyCommands
import software.aws.toolkits.jetbrains.services.codemodernizer.panels.managers.CodeModernizerBottomWindowPanelManager
import software.aws.toolkits.jetbrains.services.codemodernizer.toolwindow.CodeModernizerBottomToolWindowFactory
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.getPathToHilArtifactPomFolder
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.getPathToHilDependenciesRootDir
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.getPathToHilUploadZip
import software.aws.toolkits.resources.message
import java.io.File
import java.io.IOException
import java.nio.file.FileVisitOption
import java.nio.file.FileVisitResult
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.SimpleFileVisitor
import java.nio.file.attribute.BasicFileAttributes
import java.util.zip.ZipOutputStream
import kotlin.io.path.Path
import kotlin.io.path.pathString

const val MANIFEST_PATH = "manifest.json"
const val ZIP_SOURCES_PATH = "sources"
const val ZIP_DEPENDENCIES_PATH = "dependencies"
const val BUILD_LOG_PATH = "build-logs.txt"
const val MAVEN_CONFIGURATION_FILE_NAME = "pom.xml"
const val MAVEN_DEFAULT_BUILD_DIRECTORY_NAME = "target"
const val IDEA_DIRECTORY_NAME = ".idea"
const val INVALID_SUFFIX_SHA = "sha1"
const val INVALID_SUFFIX_REPOSITORIES = "repositories"
data class CodeModernizerSessionContext(
    val project: Project,
    val configurationFile: VirtualFile,
    val sourceJavaVersion: JavaSdkVersion,
    val targetJavaVersion: JavaSdkVersion,
) {
    private val mapper = jacksonObjectMapper()
    private val ignoredDependencyFileExtensions = setOf(INVALID_SUFFIX_SHA, INVALID_SUFFIX_REPOSITORIES)

    fun File.isMavenTargetFolder(): Boolean {
        val hasPomSibling = this.resolveSibling(MAVEN_CONFIGURATION_FILE_NAME).exists()
        val isMavenTargetDirName = this.isDirectory && this.name == MAVEN_DEFAULT_BUILD_DIRECTORY_NAME
        return isMavenTargetDirName && hasPomSibling
    }

    fun File.isIdeaFolder(): Boolean {
        val isIdea = this.isDirectory && this.name == IDEA_DIRECTORY_NAME
        return isIdea
    }

    private fun findDirectoriesToExclude(sourceFolder: File): List<File> {
        val excluded = mutableListOf<File>()
        sourceFolder.walkTopDown().onEnter {
            if (it.isMavenTargetFolder() || it.isIdeaFolder()) {
                excluded.add(it)
                return@onEnter false
            }
            return@onEnter true
        }.forEach {
            // noop, collects the sequence
        }
        return excluded
    }

    fun executeMavenCopyCommands(sourceFolder: File, buildLogBuilder: StringBuilder) = runMavenCopyCommands(sourceFolder, buildLogBuilder, LOG, project)

    private fun executeHilMavenCopyDependency(sourceFolder: File, destinationFolder: File, buildLogBuilder: StringBuilder) = runHilMavenCopyDependency(
        sourceFolder,
        destinationFolder,
        buildLogBuilder,
        LOG,
        project
    )

    fun copyHilDependencyUsingMaven(hilTepDirPath: Path): MavenCopyCommandsResult {
        val sourceFolder = File(getPathToHilArtifactPomFolder(hilTepDirPath).pathString)
        val destinationFolder = Files.createDirectories(getPathToHilDependenciesRootDir(hilTepDirPath)).toFile()
        val buildLogBuilder = StringBuilder("Starting Build Log...\n")

        return executeHilMavenCopyDependency(sourceFolder, destinationFolder, buildLogBuilder)
    }

    fun getDependenciesUsingMaven(): MavenCopyCommandsResult {
        val root = configurationFile.parent
        val sourceFolder = File(root.path)
        val buildLogBuilder = StringBuilder("Starting Build Log...\n")
        return executeMavenCopyCommands(sourceFolder, buildLogBuilder)
    }

    fun createDependencyReportUsingMaven(hilTempPomPath: Path): MavenDependencyReportCommandsResult {
        val sourceFolder = File(hilTempPomPath.pathString)
        val buildLogBuilder = StringBuilder("Starting Build Log...\n")
        return executeDependencyVersionReportUsingMaven(sourceFolder, buildLogBuilder)
    }
    private fun executeDependencyVersionReportUsingMaven(
        sourceFolder: File,
        buildLogBuilder: StringBuilder
    ) = runDependencyReportCommands(sourceFolder, buildLogBuilder, LOG, project)

    fun createZipForHilUpload(hilTempPath: Path, manifest: CodeTransformHilDownloadManifest?, targetVersion: String): ZipCreationResult =
        runReadAction {
            try {
                if (manifest == null) {
                    throw CodeModernizerException("No Hil manifest found")
                }

                val depRootPath = getPathToHilDependenciesRootDir(hilTempPath)
                val depDirectory = File(depRootPath.pathString)

                val dependencyFiles = iterateThroughDependencies(depDirectory)

                val depSources = File(HIL_DEPENDENCIES_ROOT_NAME)

                val file = Files.createFile(getPathToHilUploadZip(hilTempPath))
                ZipOutputStream(Files.newOutputStream(file)).use { zip ->
                    // 1) manifest.json
                    mapper.writeValueAsString(
                        CodeTransformHilUploadManifest(
                            hilInput = HilInput(
                                dependenciesRoot = "$HIL_DEPENDENCIES_ROOT_NAME/",
                                pomGroupId = manifest.pomGroupId,
                                pomArtifactId = manifest.pomArtifactId,
                                targetPomVersion = targetVersion,
                            )
                        )
                    )
                        .byteInputStream()
                        .use {
                            zip.putNextEntry(HIL_MANIFEST_FILE_NAME, it)
                        }

                    // 2) Dependencies
                    dependencyFiles.forEach { depFile ->
                        val relativePath = File(depFile.path).relativeTo(depDirectory)
                        val paddedPath = depSources.resolve(relativePath)
                        var paddedPathString = paddedPath.toPath().toString()
                        // Convert Windows file path to work on Linux
                        if (File.separatorChar != '/') {
                            paddedPathString = paddedPathString.replace('\\', '/')
                        }
                        depFile.inputStream().use {
                            zip.putNextEntry(paddedPathString, it)
                        }
                    }
                }

                ZipCreationResult.Succeeded(file.toFile())
            } catch (e: Exception) {
                LOG.error(e) { e.message.toString() }
                throw CodeModernizerException("Unknown exception occurred")
            }
        }

    fun createZipWithModuleFiles(copyResult: MavenCopyCommandsResult): ZipCreationResult {
        val telemetry = CodeTransformTelemetryManager.getInstance(project)
        val root = configurationFile.parent
        val sourceFolder = File(root.path)
        val buildLogBuilder = StringBuilder("Starting Build Log...\n")
        val depDirectory = if (copyResult is MavenCopyCommandsResult.Success) {
            showTransformationHub()
            telemetry.dependenciesCopied()
            copyResult.dependencyDirectory
        } else {
            null
        }

        return runReadAction {
            try {
                val directoriesToExclude = findDirectoriesToExclude(sourceFolder)
                val files = VfsUtil.collectChildrenRecursively(root).filter { child ->
                    val childPath = Path(child.path)
                    !child.isDirectory && directoriesToExclude.none { childPath.startsWith(it.toPath()) }
                }
                val dependencyFiles = if (depDirectory != null) {
                    iterateThroughDependencies(depDirectory)
                } else {
                    mutableListOf()
                }

                val zipSources = File(ZIP_SOURCES_PATH)
                val depSources = File(ZIP_DEPENDENCIES_PATH)
                val outputFile = createTemporaryZipFile { zip ->
                    // 1) Manifest file
                    val dependenciesRoot = if (depDirectory != null) "$ZIP_DEPENDENCIES_PATH/${depDirectory.name}" else null
                    mapper.writeValueAsString(ZipManifest(dependenciesRoot = dependenciesRoot))
                        .byteInputStream()
                        .use {
                            zip.putNextEntry(Path(MANIFEST_PATH).toString(), it)
                        }

                    // 2) Dependencies
                    if (depDirectory != null) {
                        dependencyFiles.forEach { depfile ->
                            val relativePath = File(depfile.path).relativeTo(depDirectory.parentFile)
                            val paddedPath = depSources.resolve(relativePath)
                            var paddedPathString = paddedPath.toPath().toString()
                            // Convert Windows file path to work on Linux
                            if (File.separatorChar != '/') {
                                paddedPathString = paddedPathString.replace('\\', '/')
                            }
                            depfile.inputStream().use {
                                zip.putNextEntry(paddedPathString, it)
                            }
                        }
                    }

                    // 3) Sources
                    files.forEach { file ->
                        val relativePath = File(file.path).relativeTo(sourceFolder)
                        val paddedPath = zipSources.resolve(relativePath)
                        var paddedPathString = paddedPath.toPath().toString()
                        // Convert Windows file path to work on Linux
                        if (File.separatorChar != '/') {
                            paddedPathString = paddedPathString.replace('\\', '/')
                        }
                        file.inputStream.use {
                            zip.putNextEntry(paddedPathString, it)
                        }
                    }

                    // 4) Build Log
                    buildLogBuilder.toString().byteInputStream().use {
                        zip.putNextEntry(Path(BUILD_LOG_PATH).toString(), it)
                    }
                }.toFile()
                if (depDirectory != null) ZipCreationResult.Succeeded(outputFile) else ZipCreationResult.Missing1P(outputFile)
            } catch (e: NoSuchFileException) {
                throw CodeModernizerException("Source folder not found")
            } catch (e: Exception) {
                LOG.error(e) { e.message.toString() }
                throw CodeModernizerException("Unknown exception occurred")
            } finally {
                depDirectory?.deleteRecursively()
            }
        }
    }

    private fun Path.isIgnoredDependency() = this.toFile().extension in ignoredDependencyFileExtensions

    fun iterateThroughDependencies(depDirectory: File): MutableList<File> {
        val dependencyFiles = mutableListOf<File>()
        Files.walkFileTree(
            depDirectory.toPath(),
            setOf(FileVisitOption.FOLLOW_LINKS),
            Int.MAX_VALUE,
            object : SimpleFileVisitor<Path>() {
                override fun visitFile(path: Path, attrs: BasicFileAttributes?): FileVisitResult {
                    if (!path.isIgnoredDependency()) {
                        dependencyFiles.add(path.toFile())
                    }
                    return FileVisitResult.CONTINUE
                }

                override fun visitFileFailed(file: Path?, exc: IOException?): FileVisitResult =
                    FileVisitResult.CONTINUE
            }
        )
        return dependencyFiles
    }

    fun showTransformationHub() = runInEdt {
        val appModernizerBottomWindow = ToolWindowManager.getInstance(project).getToolWindow(CodeModernizerBottomToolWindowFactory.id)
            ?: error(message("codemodernizer.toolwindow.problems_window_not_found"))
        appModernizerBottomWindow.show()
        CodeModernizerBottomWindowPanelManager.getInstance(project).setJobStartingUI()
    }

    companion object {
        private val LOG = getLogger<CodeModernizerSessionContext>()
    }
}
