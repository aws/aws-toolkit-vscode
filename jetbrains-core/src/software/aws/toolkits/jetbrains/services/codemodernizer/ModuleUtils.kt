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

fun Module.tryGetJdk(project: Project): JavaSdkVersion? {
    val sdk = ModuleRootManager.getInstance(this).sdk ?: ProjectRootManager.getInstance(project).projectSdk ?: return null
    val javaSdk = JavaSdkImpl.getInstance()
    return javaSdk.getVersion(sdk)
}

fun Project.getSupportedJavaMappingsForProject(supportedJavaMappings: Map<JavaSdkVersion, Set<JavaSdkVersion>>): List<String> {
    val projectSdk = ProjectRootManager.getInstance(this).projectSdk
    val javaSdk = JavaSdkImpl.getInstance()
    return if (projectSdk == null) {
        listOf()
    } else {
        supportedJavaMappings.getOrDefault(javaSdk.getVersion(projectSdk), listOf()).map { it.name }.toList()
    }
}

fun Project.tryGetJdk(): JavaSdkVersion? {
    val projectSdk = ProjectRootManager.getInstance(this).projectSdk
    val javaSdk = JavaSdkImpl.getInstance()
    return javaSdk.getVersion(projectSdk ?: return null)
}

fun Project.getModuleOrProjectNameForFile(file: VirtualFile) = ModuleUtil.findModuleForFile(file, this)?.name ?: this.name
