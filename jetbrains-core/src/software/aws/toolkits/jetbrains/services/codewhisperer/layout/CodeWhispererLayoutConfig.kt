// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.layout

import com.intellij.util.ui.JBInsets
import java.awt.GridBagConstraints
import java.awt.GridBagConstraints.EAST
import java.awt.GridBagConstraints.HORIZONTAL
import java.awt.GridBagConstraints.WEST
import javax.swing.JLabel
import javax.swing.JPanel

object CodeWhispererLayoutConfig {
    val horizontalPanelConstraints = GridBagConstraints().apply {
        gridx = 0
        weightx = 1.0
        fill = HORIZONTAL
    }
    val navigationButtonConstraints = GridBagConstraints().apply {
        insets = JBInsets.create(0, 2)
        ipady = 6
    }
    val middleButtonConstraints = GridBagConstraints().apply {
        insets = JBInsets.create(0, 4)
        ipady = 6
    }
    val inlineLabelConstraints = GridBagConstraints().apply {
        anchor = WEST
    }
    val kebabMenuConstraints = GridBagConstraints().apply {
        anchor = EAST
    }
    private val horizontalGlueConstraints = GridBagConstraints().apply {
        gridy = 0
        weightx = 1.0
        weighty = 1.0
        fill = GridBagConstraints.BOTH
    }
    private val verticalGlueConstraints = GridBagConstraints().apply {
        gridx = 0
        weightx = 1.0
        weighty = 1.0
        fill = GridBagConstraints.BOTH
    }
    fun JPanel.addHorizontalGlue() {
        this.add(JLabel(), horizontalGlueConstraints)
    }
    fun JPanel.addVerticalGlue() {
        this.add(JLabel(), verticalGlueConstraints)
    }
}
