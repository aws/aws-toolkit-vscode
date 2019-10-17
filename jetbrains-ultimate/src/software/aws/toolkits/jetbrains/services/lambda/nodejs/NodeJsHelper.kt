// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.lang.javascript.buildTools.npm.PackageJsonUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.vfs.VirtualFile

/**
 * WebStorm doesn't allow user to mark a folder as source root. This method infers a folder as source root based on
 * whether it has package.json file in it. If there is no package.json found in the path, content root will be returned.
 *
 * @param project The Node.js project.
 * @param virtualFile The Node.js source code file.
 * @return The inferred source root that contains package.json file, or content root of the file.
 * @throws IllegalStateException If the contentRoot cannot be located
 */
fun inferSourceRoot(project: Project, virtualFile: VirtualFile): VirtualFile? {
    val projectFileIndex = ProjectFileIndex.getInstance(project)
    return projectFileIndex.getContentRootForFile(virtualFile)?.let {
        findChildPackageJson(virtualFile.parent, it)
    }
}

private fun findChildPackageJson(file: VirtualFile, contentRoot: VirtualFile): VirtualFile =
    when {
        PackageJsonUtil.findChildPackageJsonFile(file) != null -> file
        file == contentRoot -> file
        else -> findChildPackageJson(file.parent, contentRoot)
    }
