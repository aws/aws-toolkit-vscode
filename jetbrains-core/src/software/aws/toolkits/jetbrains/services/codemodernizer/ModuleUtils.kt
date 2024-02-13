// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer

import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleUtil
import com.intellij.openapi.project.Project
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
 * @description Strategy:
 * 1. Find folders with pom.xml or build.gradle.kts or build.gradle
 * 2. Filter out subdirectories
 */
fun Project.getSupportedBuildModules(supportedBuildFileNames: List<String>): List<VirtualFile> {
    val projectRootManager = ProjectRootManager.getInstance(this)
    val probableProjectRoot = this.basePath?.toVirtualFile() // May point to only one intellij module (the first opened one)
    val probableContentRoots = projectRootManager.contentRoots.toMutableSet() // May not point to the topmost folder of modules
    probableContentRoots.add(probableProjectRoot) // dedupe
    val topLevelRoots = filterOnlyParentFiles(probableContentRoots)
    val detectedBuildFiles = topLevelRoots.flatMap { root ->
        findBuildFiles(root.toNioPath().toFile(), supportedBuildFileNames).mapNotNull { it.path.toVirtualFile() }
    }
    return detectedBuildFiles
}

/**
 * @description Try to get the project SDK version from the "project structure" settings
 */
fun Project.tryGetJdk(): JavaSdkVersion? {
    val projectSdk = ProjectRootManager.getInstance(this).projectSdk
    val javaSdk = JavaSdkImpl.getInstance()
    return javaSdk.getVersion(projectSdk ?: return null)
}

fun Project.getModuleOrProjectNameForFile(file: VirtualFile) = ModuleUtil.findModuleForFile(file, this)?.name ?: this.name
