// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.welcomescreen

import com.intellij.ide.DataManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.ui.ClickListener
import com.intellij.ui.SimpleColoredComponent
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.speedSearch.SpeedSearchUtil
import com.intellij.util.ui.UIUtil
import java.awt.Component
import java.awt.Cursor
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.JComponent

class ActionLinkColoredSearchComponent(private val text: String, onClick: (AnActionEvent) -> Unit) : SimpleColoredComponent(), WorkspaceSpeedSearchProvider {
    private var lastSpeedSearchSource: JComponent? = null

    init {
        isOpaque = false

        UIUtil.setCursor(this, Cursor.getPredefinedCursor(Cursor.HAND_CURSOR))
        append(text, SimpleTextAttributes.LINK_PLAIN_ATTRIBUTES)
        object : ClickListener() {
            override fun onClick(event: MouseEvent, clickCount: Int): Boolean {
                val context = DataManager.getInstance().getDataContext(event.component)
                onClick(AnActionEvent.createFromInputEvent(event, text, null, context))
                return true
            }

            override fun installOn(c: Component) {
                super.installOn(c)
                c.addMouseListener(object : MouseAdapter() {
                    override fun mouseEntered(e: MouseEvent?) {
                        e?.source ?: return
                        val iterator = iterator()
                        iterator.forEach { _ ->
                            // iterator iterates over the fragments, but the text attributes are on the iterator and not the iteration
                            val attr = iterator.textAttributes
                            iterator.textAttributes = attr.derive(SimpleTextAttributes.LINK_ATTRIBUTES.style, attr.fgColor, attr.bgColor, attr.waveColor)
                        }
                        repaint()
                    }

                    override fun mouseExited(e: MouseEvent?) {
                        redraw()
                    }
                })
            }
        }.installOn(this)
    }

    fun redraw() {
        this.clear()
        append(text, SimpleTextAttributes.LINK_PLAIN_ATTRIBUTES)
        lastSpeedSearchSource?.let { SpeedSearchUtil.applySpeedSearchHighlighting(it, this, true, false) }
    }

    override fun highlight(speedSearchEnabledComponent: JComponent) {
        lastSpeedSearchSource = speedSearchEnabledComponent
        redraw()
    }

    override fun getElementText(): String = text
}
