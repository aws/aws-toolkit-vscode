package software.aws.toolkits.jetbrains.ui.widgets

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.CollectionComboBoxModel
import com.intellij.ui.ListCellRendererWrapper
import software.aws.toolkits.jetbrains.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import java.awt.FlowLayout
import java.awt.event.ActionListener
import javax.swing.JLabel
import javax.swing.JList
import javax.swing.JPanel

class AwsRegionPanel(private val project: Project, private val defaultRegion: AwsRegion) {
    val regionPanel: JPanel = JPanel()
    private val regionCombo: ComboBox<AwsRegion> = ComboBox<AwsRegion>()
    private val regionModel = CollectionComboBoxModel<AwsRegion>(AwsRegionProvider.getInstance(project).regions.values.toList())

    init {
        regionCombo.renderer = object : ListCellRendererWrapper<AwsRegion>() {
            override fun customize(list: JList<*>, value: AwsRegion, index: Int, selected: Boolean, hasFocus: Boolean) {
                setIcon(value.icon)
            }
        }
        setupUI()
        regionCombo.model = regionModel
        regionModel.selectedItem = defaultRegion
    }

    fun addActionListener(actionListener: ActionListener) {
        regionCombo.addActionListener(actionListener)
    }

    fun getSelectedRegion(): AwsRegion? {
        return regionModel.selected
    }

    private fun setupUI() {
        regionPanel.layout = FlowLayout(FlowLayout.CENTER, 0, 0)
        val regionLabel = JLabel("Region")
        regionPanel.add(regionLabel)
        regionPanel.add(regionCombo)
        regionLabel.labelFor = regionCombo
    }
}