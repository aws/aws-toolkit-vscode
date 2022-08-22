// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.code

import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.ui.SortedComboBoxModel
import software.aws.toolkits.jetbrains.services.schemas.SchemaCodeLangs
import software.aws.toolkits.jetbrains.ui.installTextFieldProjectFileBrowseListener
import java.util.Comparator
import javax.swing.DefaultComboBoxModel
import javax.swing.JComboBox
import javax.swing.JLabel
import javax.swing.JPanel

class DownloadCodeForSchemaPanel(project: Project) {
    lateinit var content: JPanel
        private set
    lateinit var heading: JLabel
        private set
    lateinit var version: JComboBox<String>
        private set
    lateinit var language: JComboBox<SchemaCodeLangs>
        private set
    lateinit var location: TextFieldWithBrowseButton
        private set
    private lateinit var versionModel: DefaultComboBoxModel<String>
    private lateinit var languageModel: SortedComboBoxModel<SchemaCodeLangs>

    private fun createUIComponents() {
        versionModel = DefaultComboBoxModel()
        version = ComboBox(versionModel)
        languageModel = SortedComboBoxModel(compareBy(Comparator.naturalOrder()) { it.toString() })
        language = ComboBox(languageModel)
    }

    init {
        installTextFieldProjectFileBrowseListener(
            project,
            location,
            FileChooserDescriptorFactory.createSingleFolderDescriptor()
        )
    }

    fun setLanguages(languages: List<SchemaCodeLangs>) {
        languageModel.setAll(languages)
    }

    fun setVersions(versions: List<String>) {
        versionModel.removeAllElements()
        versionModel.addAll(versions)
    }
}
