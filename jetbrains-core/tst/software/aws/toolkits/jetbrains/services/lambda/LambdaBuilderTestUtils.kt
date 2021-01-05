// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.module.Module
import com.intellij.openapi.roots.ModuleRootManager
import org.assertj.core.api.Assertions.assertThat
import software.aws.toolkits.jetbrains.services.PathMapping

fun verifyPathMappings(module: Module, actualMappings: List<PathMapping>, expectedMappings: List<PathMapping>) {
    val basePath = ModuleRootManager.getInstance(module).contentRoots[0].path
    val updatedPaths = expectedMappings
        .map {
            PathMapping(
                it.localRoot.replace("%PROJECT_ROOT%", basePath),
                it.remoteRoot
            )
        }
    // Path mapping order matters so we do not just check content, we also check order
    assertThat(actualMappings).containsExactly(*updatedPaths.toTypedArray())
}
