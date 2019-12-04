// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.code;

import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.ComboBox;
import com.intellij.openapi.ui.TextComponentAccessor;
import com.intellij.openapi.ui.TextFieldWithBrowseButton;
import com.intellij.ui.SortedComboBoxModel;

import java.util.Collection;
import java.util.Comparator;
import javax.swing.DefaultComboBoxModel;
import javax.swing.JComboBox;
import javax.swing.JLabel;
import javax.swing.JPanel;

import org.jetbrains.annotations.NotNull;
import software.aws.toolkits.jetbrains.services.schemas.SchemaCodeLangs;
import software.aws.toolkits.jetbrains.ui.ProjectFileBrowseListener;

@SuppressWarnings("NullableProblems")
public class DownloadCodeForSchemaPanel {
    @NotNull JLabel heading;
    @NotNull JComboBox<String> version;
    @NotNull JComboBox<SchemaCodeLangs> language;
    @NotNull JPanel content;

    @NotNull TextFieldWithBrowseButton location;

    private DefaultComboBoxModel<String> versionModel;
    private SortedComboBoxModel<SchemaCodeLangs> languageModel;
    private final Project project;
    private final DownloadCodeForSchemaDialog dialog;

    DownloadCodeForSchemaPanel(Project project, DownloadCodeForSchemaDialog dialog) {
        this.project = project;
        this.dialog = dialog;

        location.addActionListener(new ProjectFileBrowseListener<>(
            project,
            location,
            FileChooserDescriptorFactory.createSingleFolderDescriptor(),
            TextComponentAccessor.TEXT_FIELD_WHOLE_TEXT
        ));
    }

    private void createUIComponents() {
        versionModel = new DefaultComboBoxModel<>();
        version = new ComboBox<>(versionModel);

        languageModel = new SortedComboBoxModel<>(Comparator.comparing(SchemaCodeLangs::toString, Comparator.naturalOrder()));
        language = new ComboBox<>(languageModel);
    }

    public void setLanguages(Collection<SchemaCodeLangs> languages) {
        languageModel.setAll(languages);
    }

    public void setVersions(Collection<String> versions) {
        versionModel.removeAllElements();
        versions.forEach(version -> versionModel.addElement(version));
    }
}
