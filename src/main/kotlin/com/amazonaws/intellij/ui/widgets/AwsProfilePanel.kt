package com.amazonaws.intellij.ui.widgets

import com.amazonaws.intellij.credentials.AwsCredentialsProfileProvider
import com.amazonaws.intellij.credentials.CredentialProfile
import com.amazonaws.intellij.utils.MutableMapWithListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.CollectionComboBoxModel
import com.intellij.ui.ListCellRendererWrapper
import java.awt.FlowLayout
import java.awt.event.ActionListener
import javax.swing.JLabel
import javax.swing.JList
import javax.swing.JPanel

class AwsProfilePanel(project: Project, private val defaultProfile: CredentialProfile?) : MutableMapWithListener.MapChangeListener<String, CredentialProfile> {
    val profilePanel: JPanel = JPanel()
    private val profileCombo = ComboBox<CredentialProfile>()
    private val profileProvider = AwsCredentialsProfileProvider.getInstance(project)
    private val profileModel = CollectionComboBoxModel<CredentialProfile>()

    init {
        setupUI()
        profileCombo.model = profileModel

        profileCombo.renderer = object : ListCellRendererWrapper<Any>() {
            override fun customize(list: JList<*>, value: Any, index: Int, selected: Boolean, hasFocus: Boolean) {
                if (value is CredentialProfile) {
                    setText(value.name)
                }
            }
        }

        profileProvider.getProfiles().forEach { profileModel.add(it) }
        profileModel.selectedItem = defaultProfile
        profileProvider.addProfileChangeListener(this)
    }

    fun addActionListener(actionListener: ActionListener) {
        profileCombo.addActionListener(actionListener)
    }

    fun getSelectedProfile(): CredentialProfile? = profileModel.selected

    private fun setupUI() {
        profilePanel.layout = FlowLayout(FlowLayout.CENTER, 0, 0)
        val profileLabel = JLabel("Profile")
        profilePanel.add(profileLabel)
        profilePanel.add(profileCombo)
        profileLabel.labelFor = profileCombo
    }

    /**
     * Listens the underlying profile map to keep being synced up with the combo box
     */
    override fun onUpdate() {
        val currentSelectedProfile = profileModel.selected
        profileModel.removeAll()
        profileProvider.getProfiles().forEach { profileModel.add(it) }
        profileModel.selectedItem = when {
            profileModel.isEmpty -> null
            profileModel.contains(currentSelectedProfile) -> currentSelectedProfile
            profileModel.contains(defaultProfile) -> defaultProfile
            else -> profileModel.items[0]
        }
    }
}