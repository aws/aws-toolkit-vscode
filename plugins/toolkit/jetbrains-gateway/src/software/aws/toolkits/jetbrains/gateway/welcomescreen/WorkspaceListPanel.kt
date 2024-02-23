// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.welcomescreen

import com.intellij.icons.AllIcons
import com.intellij.openapi.wm.impl.welcomeScreen.WelcomeScreenUIManager
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.SearchTextField
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.components.BorderLayoutPanel
import com.jetbrains.rd.util.lifetime.Lifetime
import software.amazon.awssdk.services.codecatalyst.CodeCatalystClient
import software.aws.toolkits.jetbrains.gateway.SsoSettings
import software.aws.toolkits.resources.message
import java.awt.Component
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.ScrollPaneConstants

class WorkspaceListPanel(
    dataRetriever: WorkspaceDataRetriever,
    private val client: CodeCatalystClient,
    private val ssoSettings: SsoSettings?,
    private val setContentCallback: (Component) -> Unit,
    private val refreshCallback: () -> Unit,
    private val lifetime: Lifetime
) : BorderLayoutPanel() {
    private val searchField = createSearchField()
    private val compatibleFilter = FilteringWorkspaceList(dataRetriever) { it.isCompatible }

    init {
        isOpaque = false

        setupWsPanels()

        recursivelySetBackground(this)
    }

    private fun setupWsPanels() {
        addToTop(createFilterBar())
        val wsPanel = WorkspaceGroupsPanel(compatibleFilter, client, ssoSettings, setContentCallback, lifetime).also { WorkspaceSpeedSearch(searchField, it) }
        addToCenter(
            ScrollPaneFactory.createScrollPane(wsPanel, true).apply {
                horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER
            }
        )
    }

    private fun createFilterBar(): JComponent {
        val filterTabs = TabLikeButtons()

        filterTabs.add(
            JButton(AllIcons.Actions.Refresh).apply {
                isOpaque = false
                border = JBUI.Borders.empty()
                addActionListener {
                    refreshCallback()
                }
            }
        )

        val rightPanel = BorderLayoutPanel().apply {
            isOpaque = false

            addToRight(filterTabs)
        }

        return BorderLayoutPanel().apply {
            isOpaque = false
            border = BottomLineBorder(
                WelcomeScreenUIManager.getSeparatorColor(),
                JBUI.insets(0, PANEL_SIDE_INSET, 1, PANEL_SIDE_INSET)
            )

            addToCenter(searchField)
            addToRight(rightPanel)
        }
    }

    private fun createSearchField(): SearchTextField {
        val projectSearch = SearchTextField(false)
        projectSearch.isOpaque = false
        projectSearch.border = JBUI.Borders.empty()

        projectSearch.textEditor.apply {
            isOpaque = false
            border = JBUI.Borders.empty()
            emptyText.text = message("caws.workspace.list_panel_search_empty_text")
            accessibleContext.accessibleName = message("caws.workspace.list_panel_search_empty_text")
        }

        return projectSearch
    }
}
