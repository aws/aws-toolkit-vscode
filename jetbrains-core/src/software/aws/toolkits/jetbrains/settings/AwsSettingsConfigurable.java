// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings;

import static software.aws.toolkits.resources.Localization.message;

import com.intellij.ide.BrowserUtil;
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory;
import com.intellij.openapi.options.SearchableConfigurable;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.TextFieldWithBrowseButton;
import com.intellij.ui.components.JBCheckBox;
import com.intellij.ui.components.labels.LinkLabel;
import javax.swing.JComponent;
import javax.swing.JPanel;
import org.jetbrains.annotations.Nls;
import org.jetbrains.annotations.Nls.Capitalization;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

public class AwsSettingsConfigurable implements SearchableConfigurable {
    private static final String SAM_HELP_LINK = "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html";

    private final Project project;
    private JPanel panel;
    private TextFieldWithBrowseButton samExecutablePath;
    private LinkLabel samHelp;
    private JBCheckBox showAllHandlerGutterIcons;

    public AwsSettingsConfigurable(Project project) {
        this.project = project;

        samExecutablePath.addBrowseFolderListener(
            message("aws.settings.sam.find.title"),
            message("aws.settings.sam.find.description"),
            project,
            FileChooserDescriptorFactory.createSingleLocalFileDescriptor()
        );
    }

    @Nullable
    @Override
    public JComponent createComponent() {
        return panel;
    }

    private void createUIComponents() {
        samHelp = LinkLabel.create(message("aws.settings.sam.help"), () -> BrowserUtil.browse(SAM_HELP_LINK));
    }

    @NotNull
    @Override
    public String getId() {
        return "aws";
    }

    @Nls(capitalization = Capitalization.Title)
    @Override
    public String getDisplayName() {
        return message("aws.settings.title");
    }

    @Override
    public boolean isModified() {
        SamSettings samSettings = SamSettings.getInstance();
        return isModified(samExecutablePath.getTextField(), samSettings.getExecutablePath()) ||
            isModified(showAllHandlerGutterIcons, samSettings.getShowAllHandlerGutterIcons());
    }

    @Override
    public void apply() {
        SamSettings samSettings = SamSettings.getInstance();
        samSettings.setExecutablePath(samExecutablePath.getText().trim());
        samSettings.setShowAllHandlerGutterIcons(showAllHandlerGutterIcons.isSelected());
    }

    @Override
    public void reset() {
        SamSettings samSettings = SamSettings.getInstance();
        samExecutablePath.setText(samSettings.getExecutablePath());
        showAllHandlerGutterIcons.setSelected(samSettings.getShowAllHandlerGutterIcons());
    }
}
