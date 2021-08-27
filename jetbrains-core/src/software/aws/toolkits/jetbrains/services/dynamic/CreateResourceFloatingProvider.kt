// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.openapi.editor.toolbar.floating.AbstractFloatingToolbarProvider
import com.intellij.openapi.editor.toolbar.floating.EditorFloatingToolbar.Companion.EP_NAME

class CreateResourceFloatingProvider : AbstractFloatingToolbarProvider(ActionGroup) {
    override val autoHideable: Boolean
        get() = false
    override val priority: Int
        get() = 100
    companion object {
        const val ActionGroup = "aws.toolkit.explorer.dynamic.create.resource.file"
        fun getExtension(): CreateResourceFloatingProvider {
            return EP_NAME.findExtensionOrFail(CreateResourceFloatingProvider::class.java)
        }
    }
}
