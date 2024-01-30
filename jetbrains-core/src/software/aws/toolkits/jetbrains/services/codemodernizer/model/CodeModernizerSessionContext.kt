// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.ProcessNotCreatedException
import com.intellij.execution.process.ProcessOutput
import com.intellij.execution.util.ExecUtil
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.projectRoots.JavaSdkVersion
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.wm.ToolWindowManager
import org.jetbrains.idea.maven.execution.MavenRunner
import org.jetbrains.idea.maven.execution.MavenRunnerParameters
import software.aws.toolkits.core.utils.createTemporaryZipFile
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.putNextEntry
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.codemodernizer.ideMaven.TransformMavenRunner
import software.aws.toolkits.jetbrains.services.codemodernizer.ideMaven.TransformRunnable
import software.aws.toolkits.jetbrains.services.codemodernizer.panels.managers.CodeModernizerBottomWindowPanelManager
import software.aws.toolkits.jetbrains.services.codemodernizer.state.CodeTransformTelemetryState
import software.aws.toolkits.jetbrains.services.codemodernizer.toolwindow.CodeModernizerBottomToolWindowFactory
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodeTransformMavenBuildCommand
import software.aws.toolkits.telemetry.CodetransformTelemetry
import java.io.File
import java.io.IOException
import java.lang.Thread.sleep
import java.nio.file.FileVisitOption
import java.nio.file.FileVisitResult
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.SimpleFileVisitor
import java.nio.file.attribute.BasicFileAttributes
import kotlin.io.NoSuchFileException
import kotlin.io.byteInputStream
import kotlin.io.deleteRecursively
import kotlin.io.inputStream
import kotlin.io.path.Path
import kotlin.io.relativeTo
import kotlin.io.resolve
import kotlin.io.resolveSibling
import kotlin.io.walkTopDown

const val MANIFEST_PATH = "manifest.json"
const val ZIP_SOURCES_PATH = "sources"
const val ZIP_DEPENDENCIES_PATH = "dependencies"
const val BUILD_LOG_PATH = "build-logs.txt"
const val MAVEN_CONFIGURATION_FILE_NAME = "pom.xml"
const val MAVEN_DEFAULT_BUILD_DIRECTORY_NAME = "target"
const val IDEA_DIRECTORY_NAME = ".idea"

data class CodeModernizerSessionContext(
    val project: Project,
    val configurationFile: VirtualFile,
    val sourceJavaVersion: JavaSdkVersion,
    val targetJavaVersion: JavaSdkVersion,
) {
    private val mapper = jacksonObjectMapper()

    fun File.isMavenTargetFolder(): Boolean {
        val hasPomSibling = this.resolveSibling(MAVEN_CONFIGURATION_FILE_NAME).exists()
        val isMavenTargetDirName = this.isDirectory && this.name == MAVEN_DEFAULT_BUILD_DIRECTORY_NAME
        return isMavenTargetDirName && hasPomSibling
    }

    fun File.isIdeaFolder(): Boolean {
        val isIdea = this.isDirectory && this.name == IDEA_DIRECTORY_NAME
        return isIdea
    }

    /**
     * TODO use an approach based on walkTopDown instead of VfsUtil.collectChildrenRecursively(root) in createZipWithModuleFiles.
     * We now recurse the file tree twice and then filter which hurts performance for large projects.
     */
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

    fun createZipWithModuleFiles(): ZipCreationResult {
        val root = configurationFile.parent
        val sourceFolder = File(root.path)
        val buildLogBuilder = StringBuilder("Starting Build Log...\n")
        val depDirectory = runMavenCommand(sourceFolder, buildLogBuilder)
        if (depDirectory != null) {
            CodetransformTelemetry.dependenciesCopied(
                codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
            )
        }
        return runReadAction {
            try {
                val directoriesToExclude = findDirectoriesToExclude(sourceFolder)
                val files = VfsUtil.collectChildrenRecursively(root).filter { child ->
                    val childPath = Path(child.path)
                    !child.isDirectory && directoriesToExclude.none { childPath.startsWith(it.toPath()) }
                }
                val dependencyfiles = if (depDirectory != null) {
                    iterateThroughDependencies(depDirectory)
                } else {
                    mutableListOf()
                }

                val dependenciesRoot = if (depDirectory != null) "$ZIP_DEPENDENCIES_PATH/${depDirectory.name}" else null
                val zipManifest = mapper.writeValueAsString(ZipManifest(dependenciesRoot = dependenciesRoot)).byteInputStream()

                val zipSources = File(ZIP_SOURCES_PATH)
                val depSources = File(ZIP_DEPENDENCIES_PATH)
                val outputFile = createTemporaryZipFile {
                    // 1) Manifest file
                    it.putNextEntry(Path(MANIFEST_PATH).toString(), zipManifest)
                    // 2) Dependencies
                    if (depDirectory != null) {
                        dependencyfiles.forEach { depfile ->
                            val relativePath = File(depfile.path).relativeTo(depDirectory.parentFile)
                            val paddedPath = depSources.resolve(relativePath)
                            var paddedPathString = paddedPath.toPath().toString()
                            // Convert Windows file path to work on Linux
                            if (File.separatorChar != '/') {
                                paddedPathString = paddedPathString.replace('\\', '/')
                            }
                            it.putNextEntry(paddedPathString, depfile.inputStream())
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
                        it.putNextEntry(paddedPathString, file.inputStream)
                    }
                    // 4) Build Log
                    it.putNextEntry(Path(BUILD_LOG_PATH).toString(), buildLogBuilder.toString().byteInputStream())
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

    /**
     * @description
     * this command is used to run the maven commmand which copies all the dependencies to a temp file which we will use to zip our own files to
     */
    fun runMavenCommand(sourceFolder: File, buildlogBuilder: StringBuilder): File? {
        val currentTimestamp = System.currentTimeMillis()
        val destinationDir = Files.createTempDirectory("transformation_dependencies_temp_" + currentTimestamp)
        val installCommandList = listOf(
            "clean",
            "install",
        )
        val copyCommandList = listOf(
            "dependency:copy-dependencies",
            "-DoutputDirectory=$destinationDir",
            "-Dmdep.useRepositoryLayout=true",
            "-Dmdep.copyPom=true",
            "-Dmdep.addParentPoms=true"
        )
        fun runInstallCommand(mavenCommand: String): ProcessOutput {
            buildlogBuilder.appendLine("Command Run: $mavenCommand clean install")
            val installCommand = buildList {
                add(mavenCommand)
                addAll(installCommandList)
            }
            val installCommandLine = GeneralCommandLine(installCommand)
                .withWorkDirectory(sourceFolder)
                .withRedirectErrorStream(true)
            val installOutput = ExecUtil.execAndGetOutput(installCommandLine)
            buildlogBuilder.appendLine("$installOutput")
            if (installOutput.exitCode == 0) {
                LOG.info { "$mavenCommand clean install succeeded" }
                buildlogBuilder.appendLine("$mavenCommand clean install succeeded")
            } else {
                LOG.error { "$mavenCommand clean install failed" }
                buildlogBuilder.appendLine("$mavenCommand clean install failed")
            }
            return installOutput
        }

        fun runCopyCommand(mavenCommand: String): ProcessOutput {
            buildlogBuilder.appendLine("Command Run: $mavenCommand dependency:copy-dependencies")
            val copyCommand = buildList {
                add(mavenCommand)
                addAll(copyCommandList)
            }
            val copyCommandLine = GeneralCommandLine(copyCommand)
                .withWorkDirectory(sourceFolder)
                .withRedirectErrorStream(true)
            val copyOutput = ExecUtil.execAndGetOutput(copyCommandLine)
            buildlogBuilder.appendLine("$copyOutput")
            if (copyOutput.exitCode == 0) {
                LOG.info { "$mavenCommand copy-dependencies succeeded" }
                buildlogBuilder.appendLine("$mavenCommand copy-dependencies succeeded")
            } else {
                LOG.error { "$mavenCommand copy-dependencies failed" }
                buildlogBuilder.appendLine("$mavenCommand copy-dependencies failed")
            }
            return copyOutput
        }

        // 1. Try to execute Maven Wrapper Command
        var shouldTryMvnCommand = true
        val mvnw = if (SystemInfo.isWindows) {
            "./mvnw.cmd"
        } else {
            "./mvnw"
        }
        try {
            LOG.info { "Executing $mvnw install" }
            val installOutput = runInstallCommand(mvnw)
            if (installOutput.exitCode != 0) {
                LOG.error { "$mvnw install output: $installOutput" }
                val error = "Maven Install: The exitCode should be 0 while it was ${installOutput.exitCode}"
                CodetransformTelemetry.mvnBuildFailed(
                    codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                    codeTransformMavenBuildCommand = CodeTransformMavenBuildCommand.Mvnw,
                    reason = error
                )
            } else {
                LOG.info { "$mvnw install executed successfully" }
            }
            // TODO: currently running copy dependencies even if install failed, because copy can still succeed.
            //  This Should be updated to fast fail the transform if install failed.
            LOG.info { "Executing $mvnw copy-dependencies" }
            val copyOutput = runCopyCommand(mvnw)
            if (copyOutput.exitCode != 0) {
                LOG.error { "$mvnw copy-dependencies command output: $copyOutput" }
                val error = "Maven Copy: The exitCode should be 0 while it was ${copyOutput.exitCode}"
                CodetransformTelemetry.mvnBuildFailed(
                    codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                    codeTransformMavenBuildCommand = CodeTransformMavenBuildCommand.Mvnw,
                    reason = error
                )
            } else {
                LOG.info { "$mvnw copy-dependencies executed successfully" }
                shouldTryMvnCommand = false
            }
        } catch (e: ProcessNotCreatedException) {
            val error = "$mvnw failed to execute as wrapper is likely not set up"
            buildlogBuilder.appendLine("$mvnw failed to execute: $e")
            CodetransformTelemetry.mvnBuildFailed(
                codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                codeTransformMavenBuildCommand = CodeTransformMavenBuildCommand.Mvnw,
                reason = error
            )
            LOG.warn(e) { error }
        } catch (e: Exception) {
            val error = "Unexpected exception when running $mvnw"
            buildlogBuilder.appendLine("$mvnw failed to execute: $e")
            CodetransformTelemetry.mvnBuildFailed(
                codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                codeTransformMavenBuildCommand = CodeTransformMavenBuildCommand.Mvnw,
                reason = error
            )
            when {
                e.message?.contains("Cannot run program \"./mvnw\"") == true -> {} // noop
                else -> throw e
            }
            LOG.error(e) { error }
        }

        // 2. maybe execute maven wrapper command
        if (shouldTryMvnCommand) {
            LOG.info { "Executing mvn" }
            try {
                val installOutput = runInstallCommand("mvn")
                if (installOutput.exitCode != 0) {
                    LOG.error { "Maven command output: $installOutput" }
                    val error = "Maven Install: The exitCode should be 0 while it was ${installOutput.exitCode}"
                    CodetransformTelemetry.mvnBuildFailed(
                        codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                        codeTransformMavenBuildCommand = CodeTransformMavenBuildCommand.Mvn,
                        reason = error
                    )
                }
                // TODO: currently running copy dependencies even if install failed, because copy can still succeed.
                //  This Should be updated to fast fail the transform if install failed.
                val copyOutput = runCopyCommand("mvn")
                if (copyOutput.exitCode != 0) {
                    LOG.error { "Maven command output: $copyOutput" }
                    val error = "Maven Copy: The exitCode should be 0 while it was ${copyOutput.exitCode}"
                    CodetransformTelemetry.mvnBuildFailed(
                        codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                        codeTransformMavenBuildCommand = CodeTransformMavenBuildCommand.Mvn,
                        reason = error
                    )
                } else {
                    shouldTryMvnCommand = false
                    LOG.info { "Maven executed successfully" }
                }
            } catch (e: ProcessNotCreatedException) {
                val error = "Maven failed to execute as its likely not installed to the PATH"
                buildlogBuilder.appendLine("mvn failed to execute: $e")
                CodetransformTelemetry.mvnBuildFailed(
                    codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                    codeTransformMavenBuildCommand = CodeTransformMavenBuildCommand.Mvn,
                    reason = error
                )
                LOG.error(e) { error }
            } catch (e: Exception) {
                val error = "Unexpected exception when running mvn"
                buildlogBuilder.appendLine("mvn failed to execute: $e")
                CodetransformTelemetry.mvnBuildFailed(
                    codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                    codeTransformMavenBuildCommand = CodeTransformMavenBuildCommand.Mvn,
                    reason = error
                )
                LOG.error(e) { error }
            }
        }

        // 3. intellij-bundled maven runner
        if (shouldTryMvnCommand) {
            LOG.info { "Executing IntelliJ bundled Maven" }
            val explicitEnabled = emptyList<String>()
            try {
                val installParams = MavenRunnerParameters(
                    false,
                    sourceFolder.absolutePath,
                    null,
                    installCommandList,
                    explicitEnabled,
                    null
                )

                val copyParams = MavenRunnerParameters(
                    false,
                    sourceFolder.absolutePath,
                    null,
                    copyCommandList,
                    explicitEnabled,
                    null
                )

                // Create MavenRunnerParametersMavenRunnerParameters
                val mvnrunner = MavenRunner.getInstance(project)
                val transformMvnRunner = TransformMavenRunner(project)
                val mvnsettings = mvnrunner.settings
                val cleanInstalled = TransformRunnable()
                val createdDependencies = TransformRunnable()
                runInEdt {
                    try {
                        buildlogBuilder.appendLine("Command Run: IntelliJ bundled Maven clean install")
                        transformMvnRunner.run(installParams, mvnsettings, cleanInstalled)
                    } catch (t: Throwable) {
                        val error = "Unexpected error when executing bundled Maven clean install"
                        cleanInstalled.exitCode(Integer.MIN_VALUE) // to stop looking for the exitCode
                        LOG.error(t) { error }
                        buildlogBuilder.appendLine("IntelliJ bundled Maven install failed: ${t.message}")
                        CodetransformTelemetry.mvnBuildFailed(
                            codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                            codeTransformMavenBuildCommand = CodeTransformMavenBuildCommand.IDEBundledMaven,
                            reason = error
                        )
                    }
                }
                while (cleanInstalled.isComplete() == null) {
                    // waiting mavenrunner building
                    sleep(50)
                }

                // log the output from runner
                buildlogBuilder.appendLine(cleanInstalled.getOutput())

                if (cleanInstalled.isComplete() == 0) {
                    val successMsg = "IntelliJ bundled Maven install executed successfully"
                    LOG.info { successMsg }
                    buildlogBuilder.appendLine(successMsg)
                } else if (cleanInstalled.isComplete() != Integer.MIN_VALUE) {
                    // TODO: improve bundled maven error logging
                    val error = "IntelliJ bundled Maven install failed: exitCode ${cleanInstalled.isComplete()}"
                    LOG.error { error }
                    buildlogBuilder.appendLine(error)
                    CodetransformTelemetry.mvnBuildFailed(
                        codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                        codeTransformMavenBuildCommand = CodeTransformMavenBuildCommand.IDEBundledMaven,
                        reason = error
                    )
                }
                // TODO: currently running copy dependencies even if install failed, because copy can still succeed.
                //  This Should be updated to fast fail the transform if install failed.
                runInEdt {
                    try {
                        buildlogBuilder.appendLine("Command Run: IntelliJ bundled Maven dependency:copy-dependencies")
                        transformMvnRunner.run(copyParams, mvnsettings, createdDependencies)
                    } catch (t: Throwable) {
                        val error = "Unexpected error when executing bundled Maven dependency:copy-dependencies"
                        createdDependencies.exitCode(Integer.MIN_VALUE) // to stop looking for the exitCode
                        LOG.error(t) { error }
                        buildlogBuilder.appendLine("IntelliJ bundled Maven copy-dependencies failed: ${t.message}")
                        CodetransformTelemetry.mvnBuildFailed(
                            codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                            codeTransformMavenBuildCommand = CodeTransformMavenBuildCommand.IDEBundledMaven,
                            reason = error
                        )
                    }
                }
                while (createdDependencies.isComplete() == null) {
                    // waiting mavenrunner building
                    sleep(50)
                }

                // log the output from runner
                buildlogBuilder.appendLine(createdDependencies.getOutput())

                if (createdDependencies.isComplete() == 0) {
                    val successMsg = "IntelliJ bundled Maven copy-dependencies executed successfully"
                    LOG.info { successMsg }
                    buildlogBuilder.appendLine(successMsg)
                } else if (createdDependencies.isComplete() != Integer.MIN_VALUE) {
                    val error = "IntelliJ bundled Maven copy-dependencies failed: exitCode ${createdDependencies.isComplete()}"
                    LOG.error { error }
                    buildlogBuilder.appendLine(error)
                    CodetransformTelemetry.mvnBuildFailed(
                        codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                        codeTransformMavenBuildCommand = CodeTransformMavenBuildCommand.IDEBundledMaven,
                        reason = error
                    )
                    return null
                } else {
                    // when exit code is MIN_VALUE
                    // return null
                    return null
                }
            } catch (t: Throwable) {
                val error = "Unexpected error when executing bundled Maven"
                LOG.error(t) { error }
                buildlogBuilder.appendLine("IntelliJ bundled Maven executed failed: ${t.message}")
                CodetransformTelemetry.mvnBuildFailed(
                    codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                    codeTransformMavenBuildCommand = CodeTransformMavenBuildCommand.IDEBundledMaven,
                    reason = error
                )
                return null
            } finally {
                // after the ide bundled maven building finished
                // change the bottom window to transformation hub
                showTransformationHub()
            }
        }

        return destinationDir.toFile()
    }

    private fun iterateThroughDependencies(depDirectory: File): MutableList<File> {
        val dependencyfiles = mutableListOf<File>()
        Files.walkFileTree(
            depDirectory.toPath(),
            setOf(FileVisitOption.FOLLOW_LINKS),
            Int.MAX_VALUE,
            object : SimpleFileVisitor<Path>() {
                override fun visitFile(file: Path?, attrs: BasicFileAttributes?): FileVisitResult {
                    if (file != null) {
                        dependencyfiles.add(file.toFile())
                    }
                    return FileVisitResult.CONTINUE
                }

                override fun visitFileFailed(file: Path?, exc: IOException?): FileVisitResult =
                    FileVisitResult.CONTINUE
            }
        )
        return dependencyfiles
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
