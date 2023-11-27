// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.ui.components

import com.intellij.openapi.ui.DialogBuilder
import com.intellij.ui.dsl.builder.panel
import software.aws.toolkits.resources.message

object ValidationErrorDialog {

    /**
     * Opens a dialog to user allowing them to select a migration path and details about their project / module.
     */
    fun create(errorMessage: String) {
        val builder = DialogBuilder()
        builder.setTitle(message("codemodernizer.validationerrordialog.description.title"))
        builder.setCenterPanel(
            panel {
                row { text(message("codemodernizer.validationerrordialog.description.main")) }
                row { text(errorMessage) }
            }
        )
        builder.addOkAction()
        builder.showNotModal()
    }
}
