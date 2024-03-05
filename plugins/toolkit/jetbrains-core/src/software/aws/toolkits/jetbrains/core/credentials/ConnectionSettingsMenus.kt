// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.ide.DataManager
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Presentation
import com.intellij.openapi.actionSystem.ex.ComboBoxAction
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.ui.popup.ListPopup
import com.intellij.util.EventDispatcher
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.ChangeSettingsMode.BOTH
import software.aws.toolkits.jetbrains.core.credentials.ChangeSettingsMode.CREDENTIALS
import software.aws.toolkits.jetbrains.core.credentials.ChangeSettingsMode.NONE
import software.aws.toolkits.jetbrains.core.credentials.ChangeSettingsMode.REGIONS
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettingsMenuBuilder.Companion.connectionSettingsMenuBuilder
import software.aws.toolkits.jetbrains.ui.ActionPopupComboLogic
import software.aws.toolkits.resources.message
import javax.swing.JComponent
import javax.swing.event.ChangeEvent
import javax.swing.event.ChangeListener

/**
 * Determine what settings the settings selector is capable of changing
 */
enum class ChangeSettingsMode(val showRegions: Boolean, val showCredentials: Boolean) {
    NONE(false, false),
    CREDENTIALS(false, true),
    REGIONS(true, false),
    BOTH(true, true)
}

/**
 * Base logic for different ways to present connection settings in a consistent manner across the IDE
 *
 * @see ProjectLevelSettingSelector
 * @see SettingsSelectorComboBoxAction
 */
abstract class SettingsSelectorLogicBase(private val menuMode: ChangeSettingsMode) : ActionPopupComboLogic {
    private val listeners by lazy {
        EventDispatcher.create(ChangeListener::class.java)
    }

    override fun displayValue(): String = when (menuMode) {
        CREDENTIALS -> credentialsDisplay()
        REGIONS -> regionDisplay()
        BOTH -> "${credentialsDisplay()}@${regionDisplay()}"
        NONE -> ""
    }

    override fun tooltip(): String? = when (menuMode) {
        CREDENTIALS -> credentialsTooltip()
        REGIONS -> regionTooltip()
        NONE, BOTH -> null
    }

    private fun regionDisplay() = currentRegion()?.id ?: message("settings.regions.none_selected")
    private fun regionTooltip() = currentRegion()?.displayName

    protected abstract fun currentRegion(): AwsRegion?
    protected open fun onRegionChange(region: AwsRegion) {}

    private fun credentialsDisplay() = currentCredentials()?.shortName ?: message("settings.credentials.none_selected")
    private fun credentialsTooltip() = currentCredentials()?.displayName

    protected abstract fun currentCredentials(): CredentialIdentifier?
    protected open fun onCredentialChange(identifier: CredentialIdentifier) {}

    fun selectionMenuActions(): DefaultActionGroup = connectionSettingsMenuBuilder().apply {
        if (menuMode.showRegions) {
            withRegions(currentRegion()) {
                onRegionChange(it)

                listeners.multicaster.stateChanged(ChangeEvent(this))
            }
        }

        if (menuMode.showCredentials) {
            withCredentials(currentCredentials()) {
                onCredentialChange(it)

                listeners.multicaster.stateChanged(ChangeEvent(this))
            }
        }

        customizeSelectionMenu(this)
    }.build()

    fun createPopup(context: DataContext): ListPopup = JBPopupFactory.getInstance().createActionGroupPopup(
        message("settings.title"),
        selectionMenuActions(),
        context,
        JBPopupFactory.ActionSelectionAid.SPEEDSEARCH,
        true
    )

    protected open fun customizeSelectionMenu(builder: ConnectionSettingsMenuBuilder) {}

    override fun addChangeListener(changeListener: ChangeListener) {
        listeners.addListener(changeListener)
    }

    override fun showPopup(sourceComponent: JComponent) {
        createPopup(DataManager.getInstance().getDataContext(sourceComponent)).showUnderneathOf(sourceComponent)
    }
}

/**
 * Version of a [SettingsSelectorLogicBase] that stores the settings locally to the instance of the selector. Typically, this would be used if the settings
 * differ from the Project settings such as a UI panel.
 */
class LocalSettingsSelector(initialRegion: AwsRegion? = null, initialCredentialIdentifier: CredentialIdentifier? = null, settingsMode: ChangeSettingsMode) :
    SettingsSelectorLogicBase(settingsMode) {
    var currentRegion: AwsRegion? = initialRegion
        set(value) {
            if (field == value) return
            field = value
            value?.let { onRegionChange(it) }
        }
    var currentCredentials: CredentialIdentifier? = initialCredentialIdentifier
        set(value) {
            if (field == value) return
            field = value
            value?.let { onCredentialChange(it) }
        }

    override fun currentRegion(): AwsRegion? = currentRegion

    override fun onRegionChange(region: AwsRegion) {
        currentRegion = region
    }

    override fun currentCredentials(): CredentialIdentifier? = currentCredentials

    override fun onCredentialChange(identifier: CredentialIdentifier) {
        currentCredentials = identifier
    }
}

/**
 * Version of a [SettingsSelectorLogicBase] that stores the settings at the project level.
 */
open class ProjectLevelSettingSelector(private val project: Project, settingsMode: ChangeSettingsMode) : SettingsSelectorLogicBase(settingsMode) {
    override fun currentRegion(): AwsRegion? = AwsConnectionManager.getInstance(project).selectedRegion

    override fun onRegionChange(region: AwsRegion) {
        AwsConnectionManager.getInstance(project).changeRegion(region)
    }

    override fun currentCredentials(): CredentialIdentifier? = AwsConnectionManager.getInstance(project).selectedCredentialIdentifier

    override fun onCredentialChange(identifier: CredentialIdentifier) {
        AwsConnectionManager.getInstance(project).changeCredentialProvider(identifier)
    }

    override fun customizeSelectionMenu(builder: ConnectionSettingsMenuBuilder) {
        builder.withRecentChoices(project)
        builder.withIndividualIdentityActions(project)
    }
}

class ToolkitConnectionComboBoxAction(private val project: Project) : ComboBoxAction(), DumbAware {

    private val logic = object : ProjectLevelSettingSelector(project, CREDENTIALS) {
        override fun currentCredentials(): CredentialIdentifier? {
            val active = ToolkitConnectionManager.getInstance(project).activeConnection()
            if (active is AwsConnectionManagerConnection) {
                return super.currentCredentials()
            }

            return null
        }

        override fun onCredentialChange(identifier: CredentialIdentifier) {
            super.onCredentialChange(identifier)
            val connectionManager = ToolkitConnectionManager.getInstance(project)
            connectionManager.switchConnection(AwsConnectionManagerConnection(project))
        }

        override fun customizeSelectionMenu(builder: ConnectionSettingsMenuBuilder) {
            super.customizeSelectionMenu(builder)
            builder.withIndividualIdentitySettings(project)
        }
    }

    override fun createPopupActionGroup(button: JComponent, dataContext: DataContext) = logic.selectionMenuActions()

    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        val active = ToolkitConnectionManager.getInstance(project).activeConnection()
        if (active is AwsConnectionManagerConnection) {
            e.presentation.text = logic.displayValue()
            e.presentation.description = logic.tooltip()
        } else {
            e.presentation.text = active?.label?.let {
                "Connected with $it"
            } ?: message("settings.credentials.none_selected")

            e.presentation.description = null
        }
    }
}

class SettingsSelectorComboBoxAction(private val selectorLogic: SettingsSelectorLogicBase) : ComboBoxAction(), DumbAware {
    override fun createPopupActionGroup(button: JComponent, dataContext: DataContext) = selectorLogic.selectionMenuActions()

    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        updatePresentation(e.presentation)
    }

    override fun displayTextInToolbar(): Boolean = true

    private fun updatePresentation(presentation: Presentation) {
        presentation.text = selectorLogic.displayValue()
        presentation.description = selectorLogic.tooltip()
    }
}

class CredsComboBoxActionGroup(private val project: Project) : DefaultActionGroup() {
    private val toolkitConnectionAction = ToolkitConnectionComboBoxAction(project)
    private val profileRegionSelectorGroup: Array<AnAction> by lazy {
        arrayOf(
            toolkitConnectionAction,
            SettingsSelectorComboBoxAction(ProjectLevelSettingSelector(project, ChangeSettingsMode.REGIONS))
        )
    }

    private val ssoSelectorGroup: Array<AnAction> by lazy {
        arrayOf(
            toolkitConnectionAction
        )
    }

    override fun getChildren(e: AnActionEvent?): Array<AnAction> {
        val activeConnection = ToolkitConnectionManager.getInstance(project).activeConnection()

        return if (activeConnection is AwsBearerTokenConnection) {
            ssoSelectorGroup
        } else if (activeConnection == null) {
            arrayOf(
                ActionManager.getInstance().getAction("aws.toolkit.toolwindow.explorer.newConnection")
            )
        } else {
            profileRegionSelectorGroup
        }
    }
}
