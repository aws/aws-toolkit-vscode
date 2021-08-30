// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.openapi.editor.toolbar.floating.AbstractFloatingToolbarProvider

class CreateResourceFloatingToolbarProvider : AbstractFloatingToolbarProvider(actionGroup) {
    override val autoHideable: Boolean = false
    override val priority: Int = 100
    companion object {
        const val actionGroup = "aws.toolkit.explorer.dynamic.create.resource.file"
    }
}
