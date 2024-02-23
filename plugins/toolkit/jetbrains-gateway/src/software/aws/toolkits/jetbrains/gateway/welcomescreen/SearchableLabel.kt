// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.welcomescreen

import com.intellij.ui.SimpleColoredComponent
import com.intellij.ui.speedSearch.SpeedSearchUtil
import javax.swing.JComponent

class SearchableLabel(private val text: String = "") : SimpleColoredComponent(), WorkspaceSpeedSearchProvider {
    init {
        append(text)
        isOpaque = false
    }

    override fun highlight(speedSearchEnabledComponent: JComponent) {
        clear()
        append(text)
        SpeedSearchUtil.applySpeedSearchHighlighting(speedSearchEnabledComponent, this, true, false)
    }

    override fun getElementText(): String = text
}
