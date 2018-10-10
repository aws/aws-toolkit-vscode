// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings;

import com.intellij.openapi.options.ConfigurationException;
import com.intellij.openapi.options.SearchableConfigurable;
import com.intellij.openapi.ui.TextFieldWithBrowseButton;
import javax.swing.JComponent;
import javax.swing.JPanel;
import org.jetbrains.annotations.Nls;
import org.jetbrains.annotations.Nls.Capitalization;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import software.aws.toolkits.resources.Localization;

public class AwsSettingsConfigurable implements SearchableConfigurable {
    private JPanel panel;
    private TextFieldWithBrowseButton samExecutablePath;

    @Nullable
    @Override
    public JComponent createComponent() {
        return panel;
    }

    @NotNull
    @Override
    public String getId() {
        return "aws";
    }

    @Nls(capitalization = Capitalization.Title)
    @Override
    public String getDisplayName() {
        return Localization.message("aws.settings.title");
    }

    @Override
    public boolean isModified() {
        SamSettings samSettings = SamSettings.getInstance();

        return isModified(samExecutablePath.getTextField(), samSettings.getExecutablePath());
    }

    @Override
    public void apply() throws ConfigurationException {
        SamSettings samSettings = SamSettings.getInstance();
        samSettings.setExecutablePath(samExecutablePath.getText().trim());
    }

    @Override
    public void reset() {
        SamSettings samSettings = SamSettings.getInstance();
        samExecutablePath.setText(samSettings.getExecutablePath());
    }
}
