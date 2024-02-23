// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import com.intellij.openapi.projectRoots.JavaSdkVersion
import com.intellij.openapi.vfs.VirtualFile

data class CustomerSelection(
    val configurationFile: VirtualFile,
    val sourceJavaVersion: JavaSdkVersion,
    val targetJavaVersion: JavaSdkVersion
)
