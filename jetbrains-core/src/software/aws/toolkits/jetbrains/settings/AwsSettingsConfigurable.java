// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings;

import static software.aws.toolkits.resources.Localization.message;

import com.intellij.ide.BrowserUtil;
import com.intellij.openapi.components.ServiceManager;
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory;
import com.intellij.openapi.options.ConfigurationException;
import com.intellij.openapi.options.SearchableConfigurable;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.TextFieldWithBrowseButton;
import com.intellij.openapi.util.text.StringUtil;
import com.intellij.ui.IdeBorderFactory;
import com.intellij.ui.components.JBCheckBox;
import com.intellij.ui.components.JBTextField;
import com.intellij.ui.components.labels.LinkLabel;
import java.util.Objects;
import javax.swing.JComponent;
import javax.swing.JPanel;

import org.jetbrains.annotations.Nls;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon;
import software.aws.toolkits.jetbrains.services.telemetry.MessageBusService;
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryEnabledChangedNotifier;

@SuppressWarnings("NullableProblems")
public class AwsSettingsConfigurable implements SearchableConfigurable {
    private static final String SAM_HELP_LINK = message("lambda.sam.cli.install_url");

    private final Project project;
    private JPanel panel;
    @NotNull TextFieldWithBrowseButton samExecutablePath;
    private LinkLabel samHelp;
    private JBCheckBox showAllHandlerGutterIcons;
    @NotNull JBCheckBox enableTelemetry;
    private JPanel projectLevelSettings;
    private JPanel applicationLevelSettings;

    private final TelemetryEnabledChangedNotifier publisher;

    public AwsSettingsConfigurable(Project project) {
        this.project = project;

        applicationLevelSettings.setBorder(IdeBorderFactory.createTitledBorder(message("aws.settings.global_level_label")));
        projectLevelSettings.setBorder(IdeBorderFactory.createTitledBorder(message("aws.settings.project_level_label")));

        MessageBusService messageBusService = ServiceManager.getService(MessageBusService.class);
        publisher = messageBusService.getMessageBus().syncPublisher(messageBusService.getTelemetryEnabledTopic());
    }

    @Nullable
    @Override
    public JComponent createComponent() {
        return panel;
    }

    private void createUIComponents() {
        samHelp = LinkLabel.create(message("aws.settings.sam.help"), () -> BrowserUtil.browse(SAM_HELP_LINK));

        String autoDetectPath = new SamExecutableDetector().detect();
        JBTextField samExecutableTextField = new JBTextField();
        if(autoDetectPath != null) {
            samExecutableTextField.getEmptyText()
                                  .setText(message("aws.settings.sam.auto_detect", autoDetectPath));
        }
        samExecutablePath = new TextFieldWithBrowseButton(samExecutableTextField);
        samExecutablePath.addBrowseFolderListener(
            message("aws.settings.sam.find.title"),
            message("aws.settings.sam.find.description"),
            project,
            FileChooserDescriptorFactory.createSingleLocalFileDescriptor()
        );
    }

    @NotNull
    @Override
    public String getId() {
        return "aws";
    }

    @Nls
    @Override
    public String getDisplayName() {
        return message("aws.settings.title");
    }

    @Override
    public boolean isModified() {
        AwsSettings awsSettings = AwsSettings.getInstance();
        SamSettings samSettings = SamSettings.getInstance();
        LambdaSettings lambdaSettings = LambdaSettings.getInstance(project);

        return !Objects.equals(getSamExecutablePath(), samSettings.getSavedExecutablePath()) ||
                isModified(showAllHandlerGutterIcons, lambdaSettings.getShowAllHandlerGutterIcons()) ||
                isModified(enableTelemetry, awsSettings.isTelemetryEnabled());
    }

    @Override
    public void apply() throws ConfigurationException {
        apply(new SamExecutableDetector());
    }

    protected void apply(SamExecutableDetector detector) throws ConfigurationException {
        SamSettings samSettings = SamSettings.getInstance();

        String path = getSamExecutablePath();
        // only validate if path is not empty and has changed since last save
        boolean changed = (path != null && !path.equals(samSettings.getSavedExecutablePath()));
        if (changed) {
            // if path is set and it is a bad executable
            String error;
            if ((error = SamCommon.Companion.validate(path)) != null) {
                throw new ConfigurationException(message("lambda.run_configuration.sam.invalid_executable", error));
            }
        }

        // preserve user's null input if we autodetected the path
        samSettings.setSavedExecutablePath(getSamExecutablePath());

        AwsSettings awsSettings = AwsSettings.getInstance();
        Boolean oldSetting = awsSettings.isTelemetryEnabled();
        try {
            awsSettings.setTelemetryEnabled(enableTelemetry.isSelected());
        } finally {
            Boolean newSetting = awsSettings.isTelemetryEnabled();
            if (newSetting != oldSetting) {
                publisher.notify(newSetting);
            }
        }

        LambdaSettings lambdaSettings = LambdaSettings.getInstance(project);
        lambdaSettings.setShowAllHandlerGutterIcons(showAllHandlerGutterIcons.isSelected());
    }

    @Nullable
    private String getSamExecutablePath() {
        return StringUtil.nullize(samExecutablePath.getText().trim());
    }

    @Override
    public void reset() {
        AwsSettings awsSettings = AwsSettings.getInstance();
        SamSettings samSettings = SamSettings.getInstance();
        LambdaSettings lambdaSettings = LambdaSettings.getInstance(project);
        enableTelemetry.setSelected(awsSettings.isTelemetryEnabled());
        samExecutablePath.setText(samSettings.getSavedExecutablePath());
        showAllHandlerGutterIcons.setSelected(lambdaSettings.getShowAllHandlerGutterIcons());
    }
}
