// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.openapi.Disposable
import com.intellij.openapi.editor.toolbar.floating.AbstractFloatingToolbarProvider
import com.intellij.openapi.editor.toolbar.floating.FloatingToolbarComponent

class ResourceModelFileFloatingToolbarProvider : AbstractFloatingToolbarProvider(RESOURCE_MODEL_ACTION_GROUP) {
    override val autoHideable: Boolean = false
    override val priority: Int = 100

    override fun register(toolbar: FloatingToolbarComponent, parentDisposable: Disposable) {
        super.register(toolbar, parentDisposable)
        toolbar.scheduleShow()
    }

    companion object {
        private const val RESOURCE_MODEL_ACTION_GROUP = "aws.toolkit.explorer.dynamic.mutate.resource.file"
    }
}
