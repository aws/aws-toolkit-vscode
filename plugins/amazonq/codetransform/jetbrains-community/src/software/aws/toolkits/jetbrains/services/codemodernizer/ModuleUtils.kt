// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer

import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.modules
import com.intellij.openapi.projectRoots.JavaSdkVersion
import com.intellij.openapi.projectRoots.impl.JavaSdkImpl
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.vfs.VirtualFile

/**
 * @description Try to get the module SDK version and fallback to the project SDK version from the "project structure" settings.
 */
fun Module.tryGetJdk(project: Project): JavaSdkVersion? {
    val sdk = ModuleRootManager.getInstance(this).sdk ?: ProjectRootManager.getInstance(project).projectSdk ?: return null
    val javaSdk = JavaSdkImpl.getInstance()
    return javaSdk.getVersion(sdk)
}

/**
 * @description Try to get the project SDK version from the "project structure" settings
 */
fun Project.tryGetJdk(): JavaSdkVersion? {
    val projectSdk = ProjectRootManager.getInstance(this).projectSdk
    val javaSdk = JavaSdkImpl.getInstance()
    return javaSdk.getVersion(projectSdk ?: return null)
}

fun Project.getSupportedJavaMappings(supportedJavaMappings: Map<JavaSdkVersion, Set<JavaSdkVersion>>): List<String> {
    val projectSdk = ProjectRootManager.getInstance(this).projectSdk
    val javaSdk = JavaSdkImpl.getInstance()
    return if (projectSdk == null) {
        listOf()
    } else {
        supportedJavaMappings.getOrDefault(javaSdk.getVersion(projectSdk), listOf()).map { it.name }.toList()
    }
}

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

fun Project.getSupportedBuildModulesPath(supportedBuildFileNames: List<String>): List<String> {
    val projectRootManager = ProjectRootManager.getInstance(this)
    val probableProjectRoot = this.basePath?.toVirtualFile() // May point to only one intellij module (the first opened one)
    val probableContentRoots = projectRootManager.contentRoots.toMutableSet() // May not point to the topmost folder of modules
    probableContentRoots.add(probableProjectRoot) // dedupe
    val topLevelRoots = filterOnlyParentFiles(probableContentRoots)
    val detectedBuildFilePaths = topLevelRoots.flatMap { root ->
        findBuildFiles(root.toNioPath().toFile(), supportedBuildFileNames).mapNotNull { it.path }
    }
    return detectedBuildFilePaths
}

fun Project.getSupportedModules(supportedJavaMappings: Map<JavaSdkVersion, Set<JavaSdkVersion>>) = this.modules.filter {
    val moduleJdk = it.tryGetJdk(this) ?: return@filter false
    moduleJdk in supportedJavaMappings
}

fun Project.getModuleOrProjectNameForFile(file: VirtualFile) = ModuleUtil.findModuleForFile(file, this)?.name ?: this.name
