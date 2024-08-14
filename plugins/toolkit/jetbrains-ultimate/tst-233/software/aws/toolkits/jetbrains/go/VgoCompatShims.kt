// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.go

import com.goide.vgo.project.VgoDependency
import com.goide.vgo.project.VgoStandaloneModule
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile

object VgoCompatShims {
    @JvmStatic
    fun newVgoModule(project: Project, root: VirtualFile, importPath: String, goVersion: String?, dependencies: Map<String, VgoDependency>) =
        VgoStandaloneModule(project, root, importPath, goVersion, dependencies.values)
}
