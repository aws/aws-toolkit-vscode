// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.go

import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.vfs.VirtualFile

/**
 * "Light" ides like Goland do not rely on marking folders as source root, so infer it based on
 * the go.mod file. This function is based off of the similar PackageJsonUtil#findUpPackageJson
 *
 * @throws IllegalStateException If the contentRoot cannot be located
 */
fun inferSourceRoot(project: Project, virtualFile: VirtualFile): VirtualFile? {
    val projectFileIndex = ProjectFileIndex.getInstance(project)
    return projectFileIndex.getContentRootForFile(virtualFile)?.let { root ->
        var file = virtualFile.parent
        while (file != null) {
            if ((file.isDirectory && file.children.any { !it.isDirectory && it.name == "go.mod" })) {
                return file
            }
            // If we go up to the root and it's still not found, stop going up and mark source root as
            // not found, since it will fail to build
            if (file == root) {
                return null
            }
            file = file.parent
        }
        return null
    }
}
