// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.welcomescreen

import com.intellij.openapi.wm.impl.welcomeScreen.WelcomeScreenUIManager
import com.intellij.util.ui.UIUtil
import java.awt.Component
import java.awt.Container
import javax.swing.BorderFactory
import javax.swing.JComponent

const val PANEL_TOP_INSET = 20
const val PANEL_SIDE_INSET = 24
val DEFAULT_WELCOME_BORDER = BorderFactory.createEmptyBorder(PANEL_TOP_INSET, PANEL_SIDE_INSET, UIUtil.LARGE_VGAP, PANEL_SIDE_INSET)

fun recursivelySetBackground(component: Component) {
    component.background = WelcomeScreenUIManager.getMainAssociatedComponentBackground()

    if (component is Container) {
        component.components.forEach {
            recursivelySetBackground(it)
        }
    }
}

fun setDefaultBackgroundAndBorder(component: JComponent) {
    recursivelySetBackground(component)
    component.border = DEFAULT_WELCOME_BORDER
}
