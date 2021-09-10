// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.openapi.editor.toolbar.floating.AbstractFloatingToolbarProvider

class ResourceModelFileFloatingToolbarProvider : AbstractFloatingToolbarProvider(RESOURCE_MODEL_ACTION_GROUP) {
    override val autoHideable: Boolean = false
    override val priority: Int = 100
    companion object {
        private const val RESOURCE_MODEL_ACTION_GROUP = "aws.toolkit.explorer.dynamic.mutate.resource.file"
    }
}
