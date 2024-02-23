// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.welcomescreen

import com.intellij.icons.AllIcons
import com.intellij.ide.browsers.BrowserLauncher
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.ActionToolbar
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.impl.ActionButton
import com.intellij.openapi.actionSystem.impl.IdeaActionButtonLook
import com.intellij.openapi.rd.createNestedDisposable
import com.intellij.openapi.wm.impl.welcomeScreen.WelcomeScreenUIManager
import com.intellij.ui.SeparatorComponent
import com.intellij.ui.SeparatorOrientation
import com.intellij.ui.components.BrowserLink
import com.intellij.ui.components.panels.NonOpaquePanel
import com.intellij.util.ui.GridBag
import com.intellij.util.ui.JBFont
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.components.BorderLayoutPanel
import com.jetbrains.rd.util.lifetime.Lifetime
import software.amazon.awssdk.services.codecatalyst.CodeCatalystClient
import software.aws.toolkits.jetbrains.gateway.CawsSettings
import software.aws.toolkits.jetbrains.gateway.SourceRepository
import software.aws.toolkits.jetbrains.gateway.SsoSettings
import software.aws.toolkits.jetbrains.gateway.Workspace
import software.aws.toolkits.jetbrains.gateway.cawsWizard
import software.aws.toolkits.jetbrains.services.caws.CawsEndpoints
import software.aws.toolkits.jetbrains.services.caws.CawsProject
import software.aws.toolkits.resources.message
import java.awt.Color
import java.awt.Component
import java.awt.Graphics
import java.awt.GridBagLayout
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JPanel

class WorkspaceGroupsPanel(
    private val workspaces: WorkspaceList,
    private val cawsClient: CodeCatalystClient,
    private val ssoSettings: SsoSettings?,
    private val setContentCallback: (Component) -> Unit,
    private val lifetime: Lifetime
) : NonOpaquePanel(GridBagLayout()) {
    private val disposable = lifetime.createNestedDisposable()
    private data class WorkspaceGroup(val repoName: String?, val subtitle: String?, val workspaces: List<Workspace>)

    init {
        addWorkspaces()

        workspaces.addChangeListener {
            removeAll()
            addWorkspaces()

            revalidate()
            repaint()
        }
    }

    private fun addWorkspaces() {
        val gbc = GridBag().apply {
            defaultAnchor = GridBag.NORTH
            defaultFill = GridBag.HORIZONTAL
            defaultWeightX = 1.0
            defaultInsets = JBUI.insets(GAP_BETWEEN_GROUPS, PANEL_SIDE_INSET)
        }

        workspaces.workspaces().entries.forEachIndexed { index, (project, workspaces) ->
            add(createProjectGroup(project, workspaces, this.workspaces.codeRepos()[project] ?: emptyList()), gbc.nextLine().setColumn(0).coverLine())

            if (index < workspaces.size - 1) {
                add(createSeparator(), gbc.nextLine().setColumn(0).coverLine().insets(JBUI.emptyInsets()))
            }
        }

        // Add a "spacer" to push everything else up
        add(NonOpaquePanel(), gbc.nextLine().coverLine().weighty(1.0).fillCellVertically())
    }

    private fun groupByRepo(workspaces: List<Workspace>, allRepos: List<SourceRepository>): List<WorkspaceGroup> {
        val repoGroups = mutableMapOf<String?, MutableList<Workspace>>()

        workspaces.forEach {
            val repo = it.repo
            repoGroups.computeIfAbsent(repo) { mutableListOf() }.add(it)
        }

        allRepos.forEach {
            repoGroups.computeIfAbsent(it.name) { mutableListOf() }
        }

        return repoGroups.map { WorkspaceGroup(it.key?.substringAfterLast("/")?.removeSuffix(".git"), it.key, it.value) }
    }

    private fun createSeparator() = SeparatorComponent(WelcomeScreenUIManager.getSeparatorColor(), SeparatorOrientation.HORIZONTAL)

    private fun createProjectGroup(project: CawsProject, workspaces: List<Workspace>, allRepos: List<SourceRepository>): JComponent {
        val panel = NonOpaquePanel(GridBagLayout())
        val gbc = GridBag().apply {
            defaultWeightX = 1.0
        }

        gbc.nextLine()

        val actions = DefaultActionGroup(null, true).apply {
            templatePresentation.putClientProperty(ActionButton.HIDE_DROPDOWN_ICON, true)
            templatePresentation.icon = AllIcons.Actions.More
            addAction(openUrlAction(message("caws.view.projects_web"), CawsEndpoints.ConsoleFactory.projectHome(project)))
            addAction(openUrlAction(message("caws.view.workspaces_web"), CawsEndpoints.ConsoleFactory.devWorkspaceHome(project)))
        }

        panel.add(
            BorderLayoutPanel().apply {
                isOpaque = false

                addToCenter(
                    SearchableLabel(project.project).apply {
                        font = JBFont.h3().asBold()
                    }
                )

                addToRight(
                    ActionButton(
                        actions,
                        actions.templatePresentation.clone(),
                        ActionPlaces.UNKNOWN,
                        ActionToolbar.DEFAULT_MINIMUM_BUTTON_SIZE
                    ).apply {
                        setLook(MORE_LOOK)
                    }
                )
            },
            gbc.next().anchor(GridBag.WEST)
        )

        val projectGroups = groupByRepo(workspaces, allRepos).sortedWith(compareBy(Comparator.nullsLast<String?>(Comparator.naturalOrder())) { it.repoName })
        projectGroups.forEachIndexed { index, group ->
            panel.createWorkspaceGroup(project, group, gbc)

            if (index < projectGroups.size - 1) {
                add(createSeparator(), gbc.nextLine().insets(JBUI.emptyInsets()))
            }
        }

        if (workspaces.isEmpty() && allRepos.isEmpty()) {
            gbc.nextLine()
            panel.add(
                BrowserLink(message("caws.add_repository"), CawsEndpoints.ConsoleFactory.repositoryHome(project)),
                gbc.next().anchor(GridBag.WEST).insetTop(10)
            )
        }

        return panel
    }

    private fun JPanel.createWorkspaceGroup(project: CawsProject, workspaceGroup: WorkspaceGroup, gbc: GridBag) {
        gbc.nextLine()

        val label = workspaceGroup.subtitle ?: message("caws.no_repo")
        add(
            SearchableLabel(label).apply {
                font = JBFont.label()
            },
            gbc.next().anchor(GridBag.WEST).insetTop(10)
        )
        add(
            JButton(message("caws.add_workspace"), AllIcons.General.Add).apply {
                addActionListener { _ ->
                    setContentCallback(
                        cawsWizard(
                            lifetime,
                            CawsSettings().also {
                                it.project = project
                                it.linkedRepoName = workspaceGroup.repoName
                            }
                        )
                    )
                }
                font = JBUI.Fonts.toolbarFont()
                putClientProperty("ActionToolbar.smallVariant", true)
            },
            gbc.next().anchor(GridBag.EAST).insetTop(10).coverLine()
        )

        createWorkspaceDetailsRow(workspaceGroup.workspaces, gbc)
    }

    private fun JPanel.createWorkspaceDetailsRow(wsDetails: List<Workspace>, gbc: GridBag) {
        wsDetails.forEachIndexed { _, ws ->
            // Change the defaults
            gbc.defaultWeightX = 0.0

            add(WorkspaceDetails(ws, workspaces, cawsClient, ssoSettings, disposable), gbc.nextLine().fillCellHorizontally().coverLine().insetTop(10))
        }
    }

    private companion object {
        private const val GAP_BETWEEN_GROUPS = 20
        private val MORE_LOOK = object : IdeaActionButtonLook() {
            override fun paintBorder(g: Graphics?, component: JComponent?, state: Int) {}

            override fun paintBorder(g: Graphics?, component: JComponent?, color: Color?) {}
        }

        private fun openUrlAction(text: String, url: String) =
            object : AnAction({ text }) {
                override fun actionPerformed(p0: AnActionEvent) {
                    BrowserLauncher.instance.browse(url)
                }
            }
    }
}
