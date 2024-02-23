// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.welcomescreen

import com.intellij.ui.components.panels.NonOpaquePanel
import com.intellij.util.ui.JBInsets
import com.intellij.util.ui.UIUtil
import java.awt.Dimension

class LabelPanel(labels: List<String>) : NonOpaquePanel() {
    companion object {
        const val LABEL_GAP = UIUtil.DEFAULT_HGAP / 2
    }

    val labels = labels.map { Label(it) }.onEach {
        add(it)
    }

    private val overflowLabel = LabelOverflow(this).also {
        add(it)
    }

    fun hiddenLabels(): List<String> = labels.asSequence().filterNot { it.isVisible }.map { it.toString() }.toList()

    private fun hiddenLabelCount() = labels.count { !it.isVisible }

    override fun getMinimumSize(): Dimension {
        val overflowSize = updateOverflowAndDetermineSize(labels.size)
        JBInsets.addTo(overflowSize, insets)
        return overflowSize
    }

    // Our preferred layout will always be the minimum, if our containing container gives us more space than we asked for, then we will show labels if
    // they fit
    override fun getPreferredSize(): Dimension = minimumSize

    override fun doLayout() {
        synchronized(treeLock) {
            var x = insets.left
            val y = insets.top
            val overflowComponent = overflowLabel

            val maxWidth = width - (insets.left + insets.right)

            var needsOverflow = false
            var lastVisibleIndex = -1

            // Last component is always overflow label
            labels.forEachIndexed { index, label ->
                val labelSize = label.preferredSize
                label.isVisible = x + labelSize.width <= maxWidth
                label.setBounds(x, y, labelSize.width, labelSize.height)

                x += labelSize.width + LABEL_GAP

                if (label.isVisible) {
                    lastVisibleIndex = index
                } else {
                    needsOverflow = true
                }
            }

            if (!needsOverflow) {
                overflowComponent.isVisible = false
                return
            }

            // Keep popping labels off the end till we make space for the overflow label
            var hiddenCount = hiddenLabelCount()

            // Use the first invisible location as the initial place to put the overflow label
            var overflowStart = labels[lastVisibleIndex + 1].x
            var overflowSize = updateOverflowAndDetermineSize(hiddenCount)

            // Make sure that the overflow label will now fit, if it doesn't then:
            // 1. Hide the last label
            // 2. Move the overflow label to its location
            // 3. Re-calculate the overflow label size in case that it grows, (font may not be monospaced or number of digits changes for example)
            // 4. Repeat until there is space, or we popped every label off
            while (overflowStart + overflowSize.width > maxWidth && lastVisibleIndex >= 0) {
                val label = labels[lastVisibleIndex]

                lastVisibleIndex--
                hiddenCount++

                label.isVisible = false

                overflowStart = label.x
                overflowSize = updateOverflowAndDetermineSize(hiddenCount)
            }

            overflowComponent.isVisible = true
            overflowComponent.setBounds(overflowStart, y, overflowSize.width, overflowSize.height)
        }
    }

    private fun updateOverflowAndDetermineSize(count: Int): Dimension {
        overflowLabel.updateLabel(count)
        return overflowLabel.preferredSize
    }
}
