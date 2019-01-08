// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.core.stack

import assertk.assert
import org.junit.Assert
import org.junit.Test
import java.awt.Container
import java.awt.event.ActionEvent
import javax.swing.AbstractButton
import javax.swing.SwingUtilities

class PageButtonsTest {

    private fun PageButtons.getButton(page: Page): AbstractButton {
        val buttons = (component as Container).components.filterIsInstance<AbstractButton>()
        assert(buttons.size == 2, "Can't find buttons")
        return if (page == Page.PREVIOUS) buttons[0] else buttons[1]
    }

    private fun PageButtons.click(page: Page) {
        getButton(page).actionListeners.forEach {
            it.actionPerformed(ActionEvent("Click", 1, "command"))
        }
    }

    private val PageButtons.enabledButtons get() = Page.values().filter { getButton(it).isEnabled }.toSet()

    private fun ensureClick(pageToClick: Page) {
        var clickedButton: Page? = null
        val buttons = PageButtons { clicked -> clickedButton = clicked }
        buttons.click(pageToClick)
        Assert.assertEquals("Click to $pageToClick but is not delegated", pageToClick, clickedButton)
    }

    @Test
    fun click() {
        Page.values().forEach { ensureClick(it) }
    }

    @Test
    fun enabled() {
        SwingUtilities.invokeAndWait {
            val buttons = PageButtons {}.apply { setPagesAvailable(emptySet()) }
            val pages = Page.values()
            Assert.assertEquals("Buttons not disabled ", emptySet<Page>(), buttons.enabledButtons)
            buttons.setPagesAvailable(pages.toSet())
            Assert.assertEquals("Buttons not enabled", pages.toSet(), buttons.enabledButtons)
            pages.forEach { page ->
                buttons.setPagesAvailable(setOf(page))
                Assert.assertEquals("Can't enable one button", setOf(page), buttons.enabledButtons)
            }
        }
    }
}