// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.core.compatability

import com.intellij.workspaceModel.ide.impl.toVirtualFile
import com.intellij.workspaceModel.storage.url.VirtualFileUrl

fun VirtualFileUrl.toVirtualFile() = this.toVirtualFile()
