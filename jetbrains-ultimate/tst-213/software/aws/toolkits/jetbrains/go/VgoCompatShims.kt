// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.go

import com.goide.vgo.project.VgoDependency
import com.goide.vgo.project.VgoModule
import com.intellij.openapi.vfs.VirtualFile

object VgoCompatShims {
    @JvmStatic
    fun newVgoModule(root: VirtualFile, importPath: String, goVersion: String?, dependencies: Map<String, VgoDependency>) =
        VgoModule(root, importPath, dependencies)
}
