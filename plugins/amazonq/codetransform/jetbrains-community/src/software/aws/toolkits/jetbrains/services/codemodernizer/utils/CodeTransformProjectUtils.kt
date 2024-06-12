// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.utils

import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.module.ModuleUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.modules
import com.intellij.openapi.projectRoots.JavaSdkVersion
import com.intellij.openapi.projectRoots.impl.JavaSdkImpl
import com.intellij.openapi.roots.LanguageLevelProjectExtension
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.vfs.VirtualFile

/**
 * @description Try to get the project SDK version from the "project structure" settings
 */
fun Project.tryGetJdk(): JavaSdkVersion? {
    val projectSdk = ProjectRootManager.getInstance(this).projectSdk
    val languagelevelSdk = this.tryGetJdkLanguageLevelJdk()
    val javaSdk = JavaSdkImpl.getInstance()
    if (languagelevelSdk != null) {
        return languagelevelSdk
    }
    return projectSdk?.let { javaSdk.getVersion(it) }
}

/**
 * @description Try to get the project SDK "language level" version from the "project structure" settings.
 * The default value should be set to the SDK, so if the parent SDK is set to Java 17 and the language level
 * is set to default. The value spit out will be JDK_17.
 */
fun Project.tryGetJdkLanguageLevelJdk(): JavaSdkVersion? {
    val languageLevelExtension = LanguageLevelProjectExtension.getInstance(this)
    val languageLevel = languageLevelExtension?.languageLevel
    return languageLevel?.let { JavaSdkVersion.fromLanguageLevel(it) }
}

fun Project.getSupportedJavaMappings(supportedJavaMappings: Map<JavaSdkVersion, Set<JavaSdkVersion>>): List<String> =
    supportedJavaMappings.getOrDefault(this.tryGetJdk(), listOf()).map { it.name }.toList()

private fun Project.getAllSupportedBuildFiles(supportedBuildFileNames: List<String>): List<VirtualFile> {
    /**
     * Strategy:
     * 1. Find folders with pom.xml or build.gradle.kts or build.gradle
     * 2. Filter out subdirectories
     */
    val projectRootManager = ProjectRootManager.getInstance(this)
    val probableProjectRoot = this.basePath?.toVirtualFile() // May point to only one intellij module (the first opened one)
    val probableContentRoots = projectRootManager.contentRoots.toMutableSet() // May not point to the topmost folder of modules
    probableContentRoots.add(probableProjectRoot) // dedupe
    val topLevelRoots = filterOnlyParentFiles(probableContentRoots)
    return topLevelRoots.flatMap { root ->
        findBuildFiles(root.toNioPath().toFile(), supportedBuildFileNames).mapNotNull { it.path.toVirtualFile() }
    }
}

fun Project.getSupportedBuildFilesWithSupportedJdk(
    supportedBuildFileNames: List<String>,
    supportedJavaMappings: Map<
        JavaSdkVersion,
        Set<JavaSdkVersion>
        >
): List<VirtualFile> {
    val detectedBuildFiles = this.getAllSupportedBuildFiles(supportedBuildFileNames)
    val supportedModules = this.getSupportedModules(supportedJavaMappings).toSet()
    val validProjectJdk = this.getSupportedJavaMappings(supportedJavaMappings).isNotEmpty()
    val projectRootManager = ProjectRootManager.getInstance(this)
    return detectedBuildFiles.filter {
        val moduleOfFile = runReadAction { projectRootManager.fileIndex.getModuleForFile(it) }
        return@filter (moduleOfFile in supportedModules) || (moduleOfFile == null && validProjectJdk)
    }
}

fun Project.getSupportedModules(supportedJavaMappings: Map<JavaSdkVersion, Set<JavaSdkVersion>>) = this.modules.filter {
    val moduleJdk = it.tryGetJdk(this) ?: return@filter false
    moduleJdk in supportedJavaMappings
}

fun Project.getModuleOrProjectNameForFile(file: VirtualFile) = ModuleUtil.findModuleForFile(file, this)?.name ?: this.name
