// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.utils

import com.fasterxml.jackson.dataformat.xml.XmlMapper
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.core.utils.createParentDirectories
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.HIL_ARTIFACT_DIR_NAME
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.HIL_ARTIFACT_POMFOLDER_DIR_NAME
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.HIL_DEPENDENCY_REPORT_DIR_NAME
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.HIL_DEPENDENCY_REPORT_FILE_NAME
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.HIL_DEPENDENCY_ROOT_DIR_NAME
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.HIL_POM_FILE_NAME
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.HIL_POM_VERSION_PLACEHOLDER
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.HIL_UPLOAD_ZIP_NAME
import software.aws.toolkits.jetbrains.services.codemodernizer.model.DependencyUpdatesReport
import software.aws.toolkits.jetbrains.services.codemodernizer.model.MAVEN_CONFIGURATION_FILE_NAME
import java.io.File
import java.io.FileOutputStream
import java.nio.file.Path
import java.util.zip.ZipFile
import kotlin.io.path.Path

fun filterOnlyParentFiles(filePaths: Set<VirtualFile>): List<VirtualFile> {
    if (filePaths.isEmpty()) return emptyList()
    // sorts it like:
    // foo
    // foo/bar
    // foo/bar/bas
    val sorted = filePaths.sortedBy { Path(it.path).nameCount }
    val uniquePrefixes = mutableSetOf(Path(sorted.first().path).parent)
    val shortestRoots = mutableSetOf(sorted.first())
    shortestRoots.add(sorted.first())
    sorted.drop(1).forEach { file ->
        if (uniquePrefixes.none { Path(file.path).startsWith(it) }) {
            shortestRoots.add(file)
            uniquePrefixes.add(Path(file.path).parent)
        } else if (Path(file.path).parent in uniquePrefixes) {
            shortestRoots.add(file) // handles multiple parent files on the same level
        }
    }
    return shortestRoots.toList()
}

/**
 * @description For every directory, check if any supported build files (pom.xml etc) exists.
 * If we find a valid build file, store it and stop further recursion.
 */
fun findBuildFiles(sourceFolder: File, supportedBuildFileNames: List<String>): List<File> {
    val buildFiles = mutableListOf<File>()
    sourceFolder.walkTopDown()
        .maxDepth(5)
        .onEnter { currentDir ->
            supportedBuildFileNames.forEach {
                val maybeSupportedFile = currentDir.resolve(MAVEN_CONFIGURATION_FILE_NAME)
                if (maybeSupportedFile.exists()) {
                    buildFiles.add(maybeSupportedFile)
                    return@onEnter false
                }
            }
            return@onEnter true
        }.forEach {
            // noop, collects the sequence
        }
    return buildFiles
}

/**
 * Unzips a zip into a dir. Returns the true when successfully unzips the file pointed to by [zipFilePath] to [destDir]
 */
fun unzipFile(zipFilePath: Path, destDir: Path): Boolean {
    if (!zipFilePath.exists()) return false
    val zipFile = ZipFile(zipFilePath.toFile())
    zipFile.use { file ->
        file.entries().asSequence()
            .filterNot { it.isDirectory }
            .map { zipEntry ->
                val destPath = destDir.resolve(zipEntry.name)
                destPath.createParentDirectories()
                FileOutputStream(destPath.toFile()).use { targetFile ->
                    zipFile.getInputStream(zipEntry).copyTo(targetFile)
                }
            }.toList()
    }
    return true
}

fun parseXmlDependenciesReport(pathToXmlDependency: Path): DependencyUpdatesReport {
    val reportFile = pathToXmlDependency.toFile()
    val xmlMapper = XmlMapper()
    val report = xmlMapper.readValue(reportFile, DependencyUpdatesReport::class.java)
    return report
}

fun createFileCopy(originalFile: File, outputPath: Path): File {
    val outputFile = outputPath.toFile()

    originalFile.inputStream().use { inputStream ->
        FileUtil.createParentDirs(outputFile)

        FileOutputStream(outputFile).use { outputStream ->
            inputStream.copyTo(outputStream)
        }
    }

    return outputFile
}

fun setDependencyVersionInPom(pomFile: File, version: String) {
    val existingValue = pomFile.readText()
    val newValue = existingValue.replace(HIL_POM_VERSION_PLACEHOLDER, version)
    pomFile.writeText(newValue)
}

fun getPathToHilArtifactDir(tmpDirPath: Path): Path = tmpDirPath.resolve(HIL_ARTIFACT_DIR_NAME)

fun getPathToHilArtifactPomFolder(tmpDirPath: Path): Path = getPathToHilArtifactDir(tmpDirPath).resolve(HIL_ARTIFACT_POMFOLDER_DIR_NAME)

fun getPathToHilArtifactPomFile(tmpDirPath: Path): Path = getPathToHilArtifactPomFolder(tmpDirPath).resolve(HIL_POM_FILE_NAME)

fun getPathToHilDependencyReportDir(tmpDirPath: Path): Path = tmpDirPath.resolve(HIL_DEPENDENCY_REPORT_DIR_NAME)

fun getPathToHilDependencyReport(tmpDirPath: Path): Path = getPathToHilDependencyReportDir(tmpDirPath).resolve("target/$HIL_DEPENDENCY_REPORT_FILE_NAME")

fun getPathToHilDependenciesRootDir(tmpDirPath: Path): Path = tmpDirPath.resolve(HIL_DEPENDENCY_ROOT_DIR_NAME)

fun getPathToHilUploadZip(tmpDirPath: Path): Path = tmpDirPath.resolve(HIL_UPLOAD_ZIP_NAME)

fun findLineNumberByString(virtualFile: VirtualFile, searchString: String): Int? {
    val text = runReadAction {
        FileDocumentManager.getInstance().getDocument(virtualFile)?.text
    } ?: return null

    val lines = text.split("\n")

    for ((lineNumber, line) in lines.withIndex()) {
        if (line.contains(searchString)) {
            return lineNumber
        }
    }

    return null
}
