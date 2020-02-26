// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudformation.stack

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import java.awt.Container
import java.awt.event.ActionEvent
import javax.swing.AbstractButton
import javax.swing.SwingUtilities

class PageButtonsTest {

    private fun PageButtons.getButton(page: Page): AbstractButton {
        val buttons = (component as Container).components.filterIsInstance<AbstractButton>()
        assertThat(buttons).hasSize(2)
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
        assertThat(clickedButton).isEqualTo(pageToClick)
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
            assertThat(buttons.enabledButtons).isEmpty()
            buttons.setPagesAvailable(pages.toSet())
            assertThat(buttons.enabledButtons).hasSameElementsAs(pages.toSet())
            pages.forEach { page ->
                buttons.setPagesAvailable(setOf(page))
                assertThat(buttons.enabledButtons).containsOnlyOnce(page)
            }
        }
    }
}
