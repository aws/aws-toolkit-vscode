// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.welcomescreen

import com.intellij.openapi.wm.impl.welcomeScreen.WelcomeScreenUIManager
import com.intellij.ui.SimpleColoredComponent
import com.intellij.ui.tabs.JBTabPainter
import com.intellij.ui.tabs.JBTabsPosition
import com.intellij.ui.tabs.impl.JBDefaultTabPainter
import com.intellij.ui.tabs.impl.themes.DefaultTabTheme
import com.intellij.util.ui.BaseButtonBehavior
import com.intellij.util.ui.JBUI
import java.awt.Color
import java.awt.FlowLayout
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.RenderingHints
import java.awt.event.MouseEvent
import javax.swing.JPanel

class TabLikeButtons : JPanel(FlowLayout(FlowLayout.LEFT, 0, 0)) {
    private val painter: JBTabPainter = JBDefaultTabPainter(object : DefaultTabTheme() {
        override val inactiveColoredTabBackground: Color = WelcomeScreenUIManager.getMainAssociatedComponentBackground()
    })
    private val tabs = mutableListOf<TabButton>()
    private var selectedTab = 0

    fun addButton(onSelect: () -> Unit): TabButton {
        val tabButton = TabButton(onSelect)
        tabs.add(tabButton)

        add(tabButton)

        return tabButton
    }

    private fun selectContent(tabButton: TabButton) {
        selectedTab = tabs.indexOf(tabButton)
        repaint()
    }

    override fun paintComponent(g: Graphics) {
        super.paintComponent(g)

        val g2d = g.create() as Graphics2D
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        try {
            tabs.forEach {
                val selected = selectedTab == tabs.indexOf(it)
                if (selected) {
                    painter.paintSelectedTab(
                        JBTabsPosition.top,
                        g2d,
                        it.bounds,
                        0,
                        WelcomeScreenUIManager.getMainAssociatedComponentBackground(),
                        active = true,
                        hovered = it.isHovered()
                    )
                } else {
                    painter.paintTab(
                        JBTabsPosition.top,
                        g2d,
                        it.bounds,
                        0,
                        WelcomeScreenUIManager.getMainAssociatedComponentBackground(),
                        active = true,
                        hovered = it.isHovered()
                    )
                }
            }
        } finally {
            g2d.dispose()
        }
    }

    inner class TabButton(private val onSelect: () -> Unit) : JPanel() {
        private val label = SimpleColoredComponent()

        private val behavior = object : BaseButtonBehavior(this) {
            override fun execute(e: MouseEvent) {
                handleMouseClick()
            }
        }

        init {
            isOpaque = false
            border = JBUI.Borders.empty(0, 6)

            label.isOpaque = false

            add(label)
        }

        fun getText() = label

        fun isHovered(): Boolean = behavior.isHovered

        private fun handleMouseClick() {
            selectContent(this)
            onSelect.invoke()
        }
    }
}
