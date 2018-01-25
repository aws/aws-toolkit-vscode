package software.aws.toolkits.jetbrains.ui.explorer
import com.intellij.ide.util.treeView.NodeDescriptor
import com.intellij.ide.util.treeView.NodeRenderer
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.util.Disposer
import com.intellij.ui.HyperlinkLabel
import com.intellij.ui.TreeUIHelper
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.panels.Wrapper
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.ui.UIUtil
import software.aws.toolkits.jetbrains.core.AwsSettingsProvider
import software.aws.toolkits.jetbrains.credentials.AwsCredentialsProfileProvider
import software.aws.toolkits.jetbrains.credentials.CredentialProfile
import software.aws.toolkits.jetbrains.ui.options.AwsCredentialsConfigurable
import software.aws.toolkits.jetbrains.ui.widgets.AwsProfilePanel
import software.aws.toolkits.jetbrains.ui.widgets.AwsRegionPanel
import software.aws.toolkits.jetbrains.utils.MutableMapWithListener
import java.awt.FlowLayout
import java.awt.event.ActionListener
import javax.swing.JPanel
import javax.swing.JTree
import javax.swing.event.HyperlinkEvent
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel

class ExplorerToolWindow(val project: Project):
        SimpleToolWindowPanel(true, false), MutableMapWithListener.MapChangeListener<String, CredentialProfile> {

    private val settingsProvider: AwsSettingsProvider = AwsSettingsProvider.getInstance(project)
    private val profileProvider: AwsCredentialsProfileProvider = AwsCredentialsProfileProvider.getInstance(project)

    private val treePanelWrapper: Wrapper = Wrapper();
    private val profilePanel: AwsProfilePanel
    private val regionPanel: AwsRegionPanel
    private val errorPanel: JPanel
    private val mainPanel: JPanel

    init {

        profileProvider.addProfileChangeListener(this)

        val link = HyperlinkLabel("Open AWS Configuration to configure your AWS account.")
        link.addHyperlinkListener { e ->
            if (e.eventType == HyperlinkEvent.EventType.ACTIVATED) {
                ShowSettingsUtil.getInstance().showSettingsDialog(project, AwsCredentialsConfigurable::class.java)
            }
        }

        errorPanel = JPanel()
        errorPanel.add(link)

        profilePanel = AwsProfilePanel(project, settingsProvider.currentProfile)
        profilePanel.addActionListener(ActionListener { onAwsProfileOrRegionComboSelected() })

        regionPanel = AwsRegionPanel(project, settingsProvider.currentRegion)
        regionPanel.addActionListener(ActionListener { onAwsProfileOrRegionComboSelected() })

        mainPanel = JPanel(FlowLayout(FlowLayout.LEADING, 0, 0))
        mainPanel.add(profilePanel.profilePanel)
        mainPanel.add(regionPanel.regionPanel)
        setToolbar(mainPanel)
        setContent(treePanelWrapper)

        onAwsProfileOrRegionComboSelected()
    }

    /**
     * Listens to the underlying profile map to keep being synced with the content pane.
     */
    override fun onUpdate() {
        if (AwsCredentialsProfileProvider.getInstance(project).getProfiles().isEmpty()) {
            treePanelWrapper.setContent(errorPanel)
        }
    }

    private fun onAwsProfileOrRegionComboSelected() {
        val selectedProfile = profilePanel.getSelectedProfile()
        val selectedRegion = regionPanel.getSelectedRegion()

        if (selectedProfile == null || selectedRegion == null) {
            treePanelWrapper.setContent(errorPanel)
            return
        }
        settingsProvider.currentRegion = selectedRegion
        settingsProvider.currentProfile = selectedProfile

        val model = DefaultTreeModel(DefaultMutableTreeNode())
        val awsTree = createTree()
        val builder = AwsExplorerTreeBuilder(awsTree, model, project, selectedProfile.name, selectedRegion.id)
        Disposer.register(project, builder)
        treePanelWrapper.setContent(JBScrollPane(awsTree))
    }

    private fun createTree(): JTree {
        val awsTree = Tree()
        TreeUIHelper.getInstance().installTreeSpeedSearch(awsTree)
        UIUtil.setLineStyleAngled(awsTree)
        awsTree.isRootVisible = false
        awsTree.autoscrolls = true
        awsTree.cellRenderer = AwsTreeCellRenderer()
        return awsTree
    }

    private class AwsTreeCellRenderer:NodeRenderer() {
        override fun customizeCellRenderer(tree: JTree, value: Any, selected: Boolean, expanded: Boolean, leaf: Boolean, row: Int, hasFocus: Boolean) {
            super.customizeCellRenderer(tree, value, selected, expanded, leaf, row, hasFocus)
            if (value is DefaultMutableTreeNode && value.userObject is NodeDescriptor<*>) {
                icon = (value.userObject as NodeDescriptor<*>).icon
            }
        }
    }
}