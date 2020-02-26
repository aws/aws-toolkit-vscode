// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings;

import static com.intellij.openapi.application.ActionsKt.runInEdt;
import static software.aws.toolkits.resources.Localization.message;

import com.intellij.ide.BrowserUtil;
import com.intellij.openapi.application.ModalityState;
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
import com.intellij.util.ui.SwingHelper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Objects;
import java.util.concurrent.CompletionException;
import javax.swing.JComponent;
import javax.swing.JPanel;
import org.jetbrains.annotations.Nls;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import software.aws.toolkits.jetbrains.core.executables.CloudDebugExecutable;
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance;
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager;
import software.aws.toolkits.jetbrains.core.executables.ExecutableType;
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable;
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryEnabledChangedNotifier;
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService;

public class AwsSettingsConfigurable implements SearchableConfigurable {
    private static final String CLOUDDEBUG = "clouddebug";
    private static final String SAM = "sam";

    private final Project project;
    private JPanel panel;
    @NotNull
    TextFieldWithBrowseButton samExecutablePath;
    @NotNull
    TextFieldWithBrowseButton cloudDebugExecutablePath;
    private LinkLabel samHelp;
    private LinkLabel cloudDebugHelp;
    private JBCheckBox showAllHandlerGutterIcons;
    @NotNull
    JBCheckBox enableTelemetry;
    private JPanel serverlessSettings;
    private JPanel remoteDebugSettings;
    private JPanel applicationLevelSettings;

    private final TelemetryEnabledChangedNotifier publisher;

    public AwsSettingsConfigurable(Project project) {
        this.project = project;

        applicationLevelSettings.setBorder(IdeBorderFactory.createTitledBorder(message("aws.settings.global_label")));
        serverlessSettings.setBorder(IdeBorderFactory.createTitledBorder(message("aws.settings.serverless_label")));
        remoteDebugSettings.setBorder(IdeBorderFactory.createTitledBorder(message("aws.settings.remote_debug_label")));

        publisher = TelemetryService.syncPublisher();

        SwingHelper.setPreferredWidth(samExecutablePath, this.panel.getWidth());
        SwingHelper.setPreferredWidth(cloudDebugExecutablePath, this.panel.getWidth());
    }

    @Nullable
    @Override
    public JComponent createComponent() {
        return panel;
    }

    private void createUIComponents() {
        cloudDebugHelp = createHelpLink("aws.settings.clouddebug.help_url");
        cloudDebugHelp.setEnabled(false);
        cloudDebugExecutablePath = createCliConfigurationElement(getCloudDebugExecutableInstance(), CLOUDDEBUG);
        samHelp = createHelpLink("lambda.sam.cli.install_url");
        samHelp.setEnabled(false);
        samExecutablePath = createCliConfigurationElement(getSamExecutableInstance(), SAM);
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
        LambdaSettings lambdaSettings = LambdaSettings.getInstance(project);

        return !Objects.equals(getSamTextboxInput(), getSavedExecutablePath(getSamExecutableInstance(), false)) ||
               !Objects.equals(getCloudDebugTextboxInput(), getSavedExecutablePath(getCloudDebugExecutableInstance(), false)) ||
               isModified(showAllHandlerGutterIcons, lambdaSettings.getShowAllHandlerGutterIcons()) ||
               isModified(enableTelemetry, awsSettings.isTelemetryEnabled());
    }

    @Override
    public void apply() throws ConfigurationException {
        validateAndSaveCliSettings((JBTextField) samExecutablePath.getTextField(),
                                   "sam",
                                   getSamExecutableInstance(),
                                   getSavedExecutablePath(getSamExecutableInstance(), false),
                                   getSamTextboxInput());
        validateAndSaveCliSettings((JBTextField) cloudDebugExecutablePath.getTextField(),
                                   "cloud-debug",
                                   getCloudDebugExecutableInstance(),
                                   getSavedExecutablePath(getCloudDebugExecutableInstance(), false),
                                   getCloudDebugTextboxInput());

        saveTelemetrySettings();
        saveLambdaSettings();
    }

    @Override
    public void reset() {
        AwsSettings awsSettings = AwsSettings.getInstance();
        LambdaSettings lambdaSettings = LambdaSettings.getInstance(project);

        samExecutablePath.setText(getSavedExecutablePath(getSamExecutableInstance(), false));
        cloudDebugExecutablePath.setText(getSavedExecutablePath(getCloudDebugExecutableInstance(), false));
        showAllHandlerGutterIcons.setSelected(lambdaSettings.getShowAllHandlerGutterIcons());
        enableTelemetry.setSelected(awsSettings.isTelemetryEnabled());
    }

    @NotNull
    private CloudDebugExecutable getCloudDebugExecutableInstance() {
        return ExecutableType.getExecutable(CloudDebugExecutable.class);
    }

    @NotNull
    private SamExecutable getSamExecutableInstance() {
        return ExecutableType.getExecutable(SamExecutable.class);
    }

    @Nullable
    private String getSamTextboxInput() {
        return StringUtil.nullize(samExecutablePath.getText().trim());
    }

    @Nullable
    private String getCloudDebugTextboxInput() {
        return StringUtil.nullize(cloudDebugExecutablePath.getText().trim());
    }

    @NotNull
    private LinkLabel createHelpLink(String helpMessageKey) {
        return LinkLabel.create(message("aws.settings.learn_more"), () -> BrowserUtil.browse(message(helpMessageKey)));
    }

    @NotNull
    private TextFieldWithBrowseButton createCliConfigurationElement(ExecutableType<?> executableType, String cliName) {
        final String autoDetectPath = getSavedExecutablePath(executableType, true);
        JBTextField cloudDebugExecutableTextField = new JBTextField();
        final TextFieldWithBrowseButton field = new TextFieldWithBrowseButton(cloudDebugExecutableTextField);
        if (autoDetectPath != null) {
            cloudDebugExecutableTextField.getEmptyText().setText(autoDetectPath);
        }
        field.addBrowseFolderListener(
            message("aws.settings.find.title", cliName),
            message("aws.settings.find.description", cliName),
            project,
            FileChooserDescriptorFactory.createSingleLocalFileDescriptor()
        );
        return field;
    }

    @Nullable
    // modifyMessageBasedOnDetectionStatus will append "Auto-detected: ...." to the
    // message if the executable is found this is used for setting the empty box text
    private String getSavedExecutablePath(ExecutableType<?> executableType, boolean modifyMessageBasedOnDetectionStatus) {
        try {
            return ExecutableManager.getInstance().getExecutable(executableType).thenApply(it -> {
                if (it instanceof ExecutableInstance.ExecutableWithPath) {
                    if (!(it instanceof ExecutableInstance.Executable)) {
                        return ((ExecutableInstance.ExecutableWithPath) it).getExecutablePath().toString();
                    } else {
                        final String path = ((ExecutableInstance.Executable) it).getExecutablePath().toString();
                        final boolean autoResolved = ((ExecutableInstance.Executable) it).getAutoResolved();
                        if (autoResolved && modifyMessageBasedOnDetectionStatus) {
                            return message("aws.settings.auto_detect", path);
                        } else if (autoResolved) {
                            // If it is auto detected, we do not want to return text as the
                            // box will be filled by empty text with the auto-resolve message
                            return null;
                        } else {
                            return path;
                        }
                    }
                }
                return null;
            }).toCompletableFuture().join();
        } catch (CompletionException ignored) {
            return null;
        }
    }

    private void validateAndSaveCliSettings(
        JBTextField textField,
        String executableName,
        ExecutableType<?> executableType,
        String saved,
        String currentInput
    ) throws ConfigurationException {
        // If input is null, wipe out input and try to autodiscover
        if (currentInput == null) {
            ExecutableManager.getInstance().removeExecutable(executableType);
            ExecutableManager.getInstance()
                             .getExecutable(executableType)
                             .thenRun(() -> {
                                 String autoDetectPath = getSavedExecutablePath(executableType, true);
                                 runInEdt(ModalityState.any(), () -> {
                                     if (autoDetectPath != null) {
                                         textField.getEmptyText().setText(autoDetectPath);
                                     } else {
                                         textField.getEmptyText().setText("");
                                     }
                                     return null;
                                 });
                             });
            return;
        }

        if (currentInput.equals(saved)) {
            return;
        }

        final Path path;
        try {
            path = Paths.get(currentInput);
            if (!Files.isExecutable(path) || !path.toFile().exists() || !path.toFile().isFile()) {
                throw new IllegalArgumentException("Set file is not an executable");
            }
        } catch (Exception e) {
            throw new ConfigurationException(message("aws.settings.executables.executable_invalid", executableName, currentInput));
        }

        ExecutableInstance instance = ExecutableManager.getInstance().validateExecutablePath(executableType, path);

        if (instance instanceof ExecutableInstance.BadExecutable) {
            throw new ConfigurationException(((ExecutableInstance.BadExecutable) instance).getValidationError());
        }

        // We have validated so now we can set
        ExecutableManager.getInstance().setExecutablePath(executableType, path);
    }

    private void saveTelemetrySettings() {
        AwsSettings awsSettings = AwsSettings.getInstance();
        boolean oldSetting = awsSettings.isTelemetryEnabled();
        try {
            awsSettings.setTelemetryEnabled(enableTelemetry.isSelected());
        } finally {
            boolean newSetting = awsSettings.isTelemetryEnabled();
            if (newSetting != oldSetting) {
                publisher.notify(newSetting);
            }
        }
    }

    private void saveLambdaSettings() {
        LambdaSettings lambdaSettings = LambdaSettings.getInstance(project);
        lambdaSettings.setShowAllHandlerGutterIcons(showAllHandlerGutterIcons.isSelected());
    }
}
