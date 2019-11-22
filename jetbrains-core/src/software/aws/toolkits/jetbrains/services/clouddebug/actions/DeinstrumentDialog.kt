// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.actions

import com.intellij.openapi.Disposable
import com.intellij.ui.components.JBLabel
import java.text.MessageFormat
import javax.swing.JPanel

class DeinstrumentDialog(serviceName: String) : Disposable {
    lateinit var content: JPanel
    lateinit var warningMessage: JBLabel

    init {
        warningMessage.text = MessageFormat.format(warningMessage.text, serviceName)
    }

    override fun dispose() {}
}
