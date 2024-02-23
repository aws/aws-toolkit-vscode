// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.welcomescreen

import com.intellij.openapi.ui.popup.Balloon
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.wm.impl.welcomeScreen.WelcomeScreenUIManager
import com.intellij.ui.awt.RelativePoint
import com.intellij.ui.components.panels.NonOpaquePanel
import com.intellij.util.ui.JBInsets
import com.intellij.util.ui.UIUtil
import software.aws.toolkits.jetbrains.gateway.welcomescreen.LabelPanel.Companion.LABEL_GAP
import java.awt.Dimension
import java.awt.Point
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.JComponent

class LabelOverflow(private val labelPanel: LabelPanel) : NonOpaquePanel(), WorkspaceSpeedSearchProvider {
    private companion object {
        const val LABEL_OVERFLOW_POPUP_WIDTH = 300
    }

    private var highlightComponent: JComponent? = null
    override fun highlight(speedSearchEnabledComponent: JComponent) {
        println("highlight $speedSearchEnabledComponent")
        highlightComponent = speedSearchEnabledComponent
    }

    override fun getElementText(): String = labelPanel.hiddenLabels().joinToString(" ")

    private val label = Label(providesSpeedSearch = false)
    private var balloon: Balloon? = null

    init {
        add(label)
        label.addMouseListener(HoverListener())
        label.background = UIUtil.getToolTipBackground()
    }

    fun handleMouseEntered() {
        label.isOpaque = true
        label.repaint()

        // Make a copy of the labels so that they aren't in the UI hierarchy twice
        val popup = ShowMorePopup(labelPanel.hiddenLabels(), highlightComponent)

        val newBalloon = JBPopupFactory.getInstance()
            .createBalloonBuilder(popup)
            .setFillColor(WelcomeScreenUIManager.getMainAssociatedComponentBackground())
            .setFadeoutTime(0)
            .setAnimationCycle(0)
            .setHideOnClickOutside(false)
            .setHideOnLinkClick(false)
            .setHideOnKeyOutside(false)
            .setHideOnAction(false)
            .createBalloon()

        newBalloon.show(RelativePoint(label, Point(label.width / 2, 0)), Balloon.Position.above)

        balloon = newBalloon
    }

    fun handleMouseExited() {
        label.isOpaque = false
        label.repaint()

        balloon?.hide()
    }

    fun updateLabel(count: Int) {
        val text = if (count == labelPanel.labels.size) {
            "$count labels"
        } else {
            "$count more"
        }

        label.clear()
        label.append(text)
    }

    inner class ShowMorePopup(labels: List<String>, highlightComponent: JComponent?) : NonOpaquePanel() {
        init {
            labels.onEach { str ->
                Label(str).also { label ->
                    add(label)
                    highlightComponent?.let {
                        label.highlight(it)
                    }
                }
            }
        }

        override fun getMinimumSize(): Dimension = preferredSize

        override fun getPreferredSize(): Dimension {
            // Calculate if the largest label needs to be bigger than the default max width
            val labelArea = calculateLabelArea()
            JBInsets.addTo(labelArea, insets)
            return labelArea
        }

        private fun calculateLabelArea(): Dimension {
            var colCount = 1
            var x = 0
            var y = 0
            var width = 0

            components.forEach { label ->
                // If not the first label in the row, add the gap
                if (colCount > 1) {
                    x += LABEL_GAP
                }

                // Calculate width with gaps in
                val labelSize = label.preferredSize
                x += labelSize.width

                // Only wrap if the added label is larger than our max, and it's not the first label on the row
                if (colCount > 1 && x > LABEL_OVERFLOW_POPUP_WIDTH) {
                    colCount = 1
                    x = 0
                    y += labelSize.height + LABEL_GAP
                } else {
                    width = maxOf(width, x)
                }

                colCount++
            }

            val height = y + components.first().height

            // TODO: We need to find a way to wrap if > LABEL_OVERFLOW_POPUP_WIDTH
            return Dimension(minOf(width, LABEL_OVERFLOW_POPUP_WIDTH), height)
        }

        override fun doLayout() {
            synchronized(treeLock) {
                var colCount = 1
                var x = insets.left
                var y = insets.top

                components.forEach { label ->
                    // If not the first label in the row, add the gap
                    if (colCount > 1) {
                        x += LABEL_GAP
                    }

                    val labelSize = label.preferredSize

                    // Only wrap if the added label is larger than our max, and it's not the first label on the row
                    if (colCount > 1 && (x + labelSize.width) > width) {
                        colCount = 1

                        x = insets.left
                        y += labelSize.height + LABEL_GAP
                    }

                    // TODO: We need to find a way to wrap if > LABEL_OVERFLOW_POPUP_WIDTH
                    label.setBounds(x, y, minOf(labelSize.width, LABEL_OVERFLOW_POPUP_WIDTH), labelSize.height)
                    x += label.preferredSize.width
                    colCount++
                }
            }
        }
    }

    private inner class HoverListener : MouseAdapter() {
        override fun mouseEntered(e: MouseEvent?) {
            handleMouseEntered()
        }

        override fun mouseExited(e: MouseEvent?) {
            handleMouseExited()
        }
    }
}
