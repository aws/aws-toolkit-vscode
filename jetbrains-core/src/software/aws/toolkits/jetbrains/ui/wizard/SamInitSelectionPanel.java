// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard;

import com.intellij.openapi.ui.ComboBox;
import com.intellij.openapi.ui.ValidationInfo;
import com.intellij.ui.ColoredListCellRenderer;
import com.intellij.ui.components.JBLabel;
import com.intellij.uiDesigner.core.GridConstraints;
import java.awt.Dimension;
import java.awt.event.ItemEvent;
import java.util.List;
import java.util.Set;
import java.util.function.Predicate;
import javax.swing.JButton;
import javax.swing.JComponent;
import javax.swing.JLabel;
import javax.swing.JList;
import javax.swing.JPanel;
import javax.swing.JTextField;
import kotlin.Pair;
import kotlin.Unit;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import software.amazon.awssdk.services.lambda.model.Runtime;
import software.aws.toolkits.core.credentials.ToolkitCredentialsIdentifier;
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider;
import software.aws.toolkits.core.region.AwsRegion;
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager;
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager;
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance;
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager;
import software.aws.toolkits.jetbrains.core.executables.ExecutableType;
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder;
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup;
import software.aws.toolkits.jetbrains.services.lambda.SamNewProjectSettings;
import software.aws.toolkits.jetbrains.services.lambda.SamProjectTemplate;
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable;

public class SamInitSelectionPanel implements ValidatablePanel {
    @NotNull
    JPanel mainPanel;
    @NotNull
    private ComboBox<Runtime> runtimeComboBox;
    @NotNull
    private JTextField samExecutableField;
    @NotNull
    private JButton editSamExecutableButton;
    @NotNull
    private JBLabel samLabel;
    @NotNull
    private ComboBox<SamProjectTemplate> templateComboBox;

    private SdkSelectionPanel sdkSelectionUi;
    private JLabel currentSdkSelectorLabel;
    private JComponent currentSdkSelector;

    private SchemaSelectionPanel schemaSelectionUi;
    private JLabel currentSchemaSelectorLabel;
    private JComponent currentSchemaSelector;

    private AwsConnectionSettingsPanel awsCredentialSelectionUi;
    private JLabel currentAwsCredentialSelectorLabel;
    private JComponent currentAwsCredentialSelector;

    private final SamProjectGenerator generator;

    private static final Predicate<Runtime> includeAllRuntimes = (s) -> true;

    SamInitSelectionPanel(SamProjectGenerator generator) {
        this(generator, includeAllRuntimes);
    }

    SamInitSelectionPanel(SamProjectGenerator generator, Predicate<Runtime> runtimeFilter) {
        this.generator = generator;
        this.currentSdkSelectorLabel = null;
        this.currentSdkSelector = null;
        this.currentSchemaSelectorLabel = null;
        this.currentSchemaSelector = null;
        this.currentAwsCredentialSelectorLabel = null;
        this.currentAwsCredentialSelector = null;

        // TODO: Move this to Kotlin...
        // Source all templates, find all the runtimes they support, then filter those by what the IDE supports
        Set<RuntimeGroup> supportedRuntimeGroups = LambdaBuilder.Companion.getSupportedRuntimeGroups();
        SamProjectTemplate.SAM_TEMPLATES.stream()
                                        .flatMap(template -> template.supportedRuntimes().stream())
                                        .sorted()
                                        .filter(runtimeFilter)
                                        .filter(r -> supportedRuntimeGroups.contains(RuntimeGroup.find(runtimeGroup -> runtimeGroup.getRuntimes().contains(r))))
                                        .distinct()
                                        .forEach(y -> runtimeComboBox.addItem(y));

        SamInitProjectBuilderCommon.setupSamSelectionElements(samExecutableField, editSamExecutableButton, samLabel);

        runtimeComboBox.addItemListener(l -> {
            if (l.getStateChange() == ItemEvent.SELECTED) {
                runtimeUpdate();
                sdkSelectionUi.registerListeners();
            }
        });

        templateComboBox.addItemListener(l -> {
            if (l.getStateChange() == ItemEvent.SELECTED) {
                templateUpdate();
            }
        });

        runtimeUpdate();

        mainPanel.validate();
    }

    public void setRuntime(Runtime runtime) {
        int itemCount = runtimeComboBox.getItemCount();

        for (int itemIndex = 0; itemIndex < itemCount; itemIndex++) {
            if (runtimeComboBox.getItemAt(itemIndex) == runtime) {
                runtimeComboBox.setSelectedItem(runtime);
                return;
            }
        }
    }

    private void runtimeUpdate() {
        Runtime selectedRuntime = (Runtime) runtimeComboBox.getSelectedItem();

        templateComboBox.removeAllItems();

        // if selected runtimeComboBox is null, we're on an unsupported platform
        if (selectedRuntime == null) {
            addNoOpConditionalPanels();
            return;
        }

        SamProjectTemplate.SAM_TEMPLATES.stream()
                                        .filter(template -> template.supportedRuntimes().contains(selectedRuntime))
                                        .forEach(template -> templateComboBox.addItem(template));
        templateComboBox.setRenderer(new ColoredListCellRenderer<SamProjectTemplate>() {
            @Override
            protected void customizeCellRenderer(@NotNull JList<? extends SamProjectTemplate> list, SamProjectTemplate value, int index, boolean selected, boolean hasFocus) {
                if (value == null) {
                    return;
                }
                setIcon(value.getIcon());
                append(value.getName());
            }
        });

        this.sdkSelectionUi = SdkSelectionPanel.create(selectedRuntime, generator);
        addSdkPanel(sdkSelectionUi);
    }

    private void templateUpdate() {
        Runtime selectedRuntime = (Runtime) runtimeComboBox.getSelectedItem();
        if (selectedRuntime == null) {
            addNoOpConditionalPanels();
            return;
        }

        SamProjectTemplate selectedTemplate = (SamProjectTemplate) templateComboBox.getSelectedItem();
        if (selectedTemplate == null) {
            addAwsConnectionSettingsPanel(new NoOpAwsConnectionSettingsPanel());
            addSchemaPanel(new NoOpSchemaSelectionPanel());
            return;
        }

        this.awsCredentialSelectionUi = AwsConnectionSettingsPanel.create(selectedTemplate, generator, this::awsCredentialsUpdated);
        addAwsConnectionSettingsPanel(awsCredentialSelectionUi);

        ProjectAccountSettingsManager accountSettingsManager = ProjectAccountSettingsManager.Companion.getInstance(generator.getDefaultSourceCreatingProject());
        if (accountSettingsManager.isValidConnectionSettings()) {
            awsCredentialsUpdated(accountSettingsManager.getActiveRegion(), accountSettingsManager.getActiveCredentialProvider().getId());
        } else {
            mainPanel.revalidate();
        }
    }

    private Unit awsCredentialsUpdated(AwsRegion awsRegion, String credentialProviderId) {
        if (awsRegion == null || credentialProviderId == null) {
            return Unit.INSTANCE;
        }

        CredentialManager credentialManager = CredentialManager.getInstance();
        ToolkitCredentialsIdentifier credentialIdentifier = credentialManager.getCredentialIdentifierById(credentialProviderId);
        if (credentialIdentifier == null) {
            throw new IllegalArgumentException("Unknown credential provider selected");
        }

        return awsCredentialsUpdated(awsRegion, credentialIdentifier);
    }

    private Unit awsCredentialsUpdated(@NotNull AwsRegion awsRegion, @NotNull ToolkitCredentialsIdentifier credentialIdentifier) {
        ProjectAccountSettingsManager accountSettingsManager = ProjectAccountSettingsManager.getInstance(generator.getDefaultSourceCreatingProject());
        if (!accountSettingsManager.isValidConnectionSettings() ||
            !accountSettingsManager.getActiveCredentialProvider().getId().equals(credentialIdentifier.getId())) {
            accountSettingsManager.changeCredentialProvider(credentialIdentifier);
        }
        if (accountSettingsManager.getActiveRegion() != awsRegion) {
            accountSettingsManager.changeRegion(awsRegion);
        }

        return initSchemaSelectionPanel(awsRegion, credentialIdentifier);
    }

    private Unit initSchemaSelectionPanel(AwsRegion awsRegion, ToolkitCredentialsIdentifier credentialIdentifier) {
        Runtime selectedRuntime = (Runtime) runtimeComboBox.getSelectedItem();
        if (selectedRuntime == null) {
            addNoOpConditionalPanels();
            return Unit.INSTANCE;
        }

        SamProjectTemplate selectedTemplate = (SamProjectTemplate) templateComboBox.getSelectedItem();
        if (selectedTemplate == null) {
            addAwsConnectionSettingsPanel(new NoOpAwsConnectionSettingsPanel());
            addSchemaPanel(new NoOpSchemaSelectionPanel());
            return Unit.INSTANCE;
        }

        this.schemaSelectionUi = SchemaSelectionPanel.create(selectedRuntime, selectedTemplate, generator);

        addSchemaPanel(schemaSelectionUi);

        ToolkitCredentialsProvider credentialProvider = CredentialManager.getInstance().getAwsCredentialProvider(credentialIdentifier, awsRegion);

        this.schemaSelectionUi.reloadSchemas(new Pair<>(awsRegion, credentialProvider));

        mainPanel.revalidate();

        return Unit.INSTANCE;
    }

    private void addNoOpConditionalPanels() {
        addSdkPanel(new NoOpSdkSelectionPanel());
        addAwsConnectionSettingsPanel(new NoOpAwsConnectionSettingsPanel());
        addSchemaPanel(new NoOpSchemaSelectionPanel());
    }

    private void addSdkPanel(@NotNull SdkSelectionPanel sdkSelectionPanel) {
        // glitchy behavior if we don't clean up any old panels
        // Also, while it looks like addSdkPanel, addAwsConnectionSettingsPanel, and addSchemaPanel could all be refactored into one helper function
        // that takes a currentLabel and a currentSelectorPanel, due to some Swing magic, it does not work, and things get, well, glitchy.
        if (currentSdkSelectorLabel != null) {
            mainPanel.remove(currentSdkSelectorLabel);
        }
        if (currentSdkSelector != null) {
            mainPanel.remove(currentSdkSelector);
        }

        JLabel newLabel = sdkSelectionPanel.getSdkSelectionLabel();
        JComponent newSelector = sdkSelectionPanel.getSdkSelectionPanel();
        addOptionalSelectorPanel(newLabel,
                                 newSelector,
                                 3);

        currentSdkSelectorLabel = newLabel;
        currentSdkSelector = newSelector;
    }

    private void addAwsConnectionSettingsPanel(@NotNull AwsConnectionSettingsPanel awsConnectionSettingsPanel) {
        // glitchy behavior if we don't clean up any old panels
        // Also, while it looks like addSdkPanel, addAwsConnectionSettingsPanel, and addSchemaPanel could all be refactored into one helper function
        // that takes a currentLabel and a currentSelectorPanel, due to some Swing magic, it does not work, and things get, well, glitchy.
        if (currentAwsCredentialSelectorLabel != null) {
            mainPanel.remove(currentAwsCredentialSelectorLabel);
        }
        if (currentAwsCredentialSelector != null) {
            mainPanel.remove(currentAwsCredentialSelector);
        }

        JLabel newLabel = awsConnectionSettingsPanel.getSelectionLabel();
        JComponent newSelector = awsConnectionSettingsPanel.getSelectionPanel();

        addOptionalSelectorPanel(newLabel,
                                 newSelector,
                                 4);

        currentAwsCredentialSelectorLabel = newLabel;
        currentAwsCredentialSelector = newSelector;
    }

    private void addSchemaPanel(@NotNull SchemaSelectionPanel schemaSelectionPanel) {
        // glitchy behavior if we don't clean up any old panels
        // Also, while it looks like addSdkPanel, addAwsConnectionSettingsPanel, and addSchemaPanel could all be refactored into one helper function
        // that takes a currentLabel and a currentSelectorPanel, due to some Swing magic, it does not work, and things get, well, glitchy.
        if (currentSchemaSelectorLabel != null) {
            mainPanel.remove(currentSchemaSelectorLabel);
        }
        if (currentSchemaSelector != null) {
            mainPanel.remove(currentSchemaSelector);
        }

        JLabel newLabel = schemaSelectionPanel.getSchemaSelectionLabel();
        JComponent newSelector = schemaSelectionPanel.getSchemaSelectionPanel();

        addOptionalSelectorPanel(newLabel,
                                 newSelector,
                                 5);

        currentSchemaSelectorLabel = newLabel;
        currentSchemaSelector = newSelector;
    }

    private void addOptionalSelectorPanel(JLabel newLabel, JComponent newSelector, int row) {
        // append selector group to main panel
        // sdk selector will want to grow past bounds if width is set to -1
        newSelector.setMinimumSize(new Dimension(0, -1));
        // first add the panel
        GridConstraints gridConstraints = new GridConstraints();
        gridConstraints.setRow(row);
        // take up two columns if no label
        if (newLabel == null) {
            gridConstraints.setColumn(0);
            gridConstraints.setColSpan(2);
        } else {
            gridConstraints.setColumn(1);
            gridConstraints.setColSpan(1);
        }
        gridConstraints.setHSizePolicy(GridConstraints.SIZEPOLICY_CAN_GROW | GridConstraints.SIZEPOLICY_CAN_SHRINK);
        gridConstraints.setFill(GridConstraints.FILL_HORIZONTAL);
        gridConstraints.setAnchor(GridConstraints.ANCHOR_WEST);
        mainPanel.add(newSelector, gridConstraints);

        // and then the label if available, and it doesn't already exist
        if (newLabel != null) {
            gridConstraints.setColumn(0);
            gridConstraints.setColSpan(1);
            mainPanel.add(newLabel, gridConstraints);
        }
    }

    @Nullable
    @Override
    public ValidationInfo validate() {
        ExecutableInstance samExecutable = ExecutableManager.getInstance().getExecutableIfPresent(ExecutableType.getExecutable(SamExecutable.class));
        if (samExecutable instanceof ExecutableInstance.BadExecutable) {
            return new ValidationInfo(((ExecutableInstance.BadExecutable) samExecutable).getValidationError(), samExecutableField);
        }

        if (sdkSelectionUi == null) {
            return null;
        }

        // Validate SDK
        List<ValidationInfo> validationInfoList = sdkSelectionUi.validateAll();
        if (validationInfoList != null && !validationInfoList.isEmpty()) {
            return validationInfoList.get(0);
        }

        if (awsCredentialSelectionUi == null) {
            return null;
        }

        // Validate AWS Credentials
        validationInfoList = awsCredentialSelectionUi.validateAll();
        if (validationInfoList != null && !validationInfoList.isEmpty()) {
            return validationInfoList.get(0);
        }

        if (schemaSelectionUi == null) {
            return null;
        }

        // Validate Schemas selection
        validationInfoList = schemaSelectionUi.validateAll();
        if (validationInfoList == null || validationInfoList.isEmpty()) {
            return null;
        } else {
            return validationInfoList.get(0);
        }
    }

    public void registerValidators() {
        if (sdkSelectionUi != null) {
            sdkSelectionUi.registerListeners();
        }
    }

    public SamNewProjectSettings getNewProjectSettings() {
        Runtime lambdaRuntime = (Runtime) runtimeComboBox.getSelectedItem();
        SamProjectTemplate samProjectTemplate = (SamProjectTemplate) templateComboBox.getSelectedItem();

        if (lambdaRuntime == null) {
            throw new RuntimeException("No Runtime is supported in this Platform.");
        }

        if (samProjectTemplate == null) {
            throw new RuntimeException("No SAM template is supported for this runtime: " + lambdaRuntime.toString());
        }

        if (sdkSelectionUi != null) {
            return new SamNewProjectSettings(
                lambdaRuntime,
                schemaSelectionUi == null || !samProjectTemplate.supportsDynamicSchemas() ? null : schemaSelectionUi.buildSchemaTemplateParameters(),
                samProjectTemplate,
                sdkSelectionUi.getSdkSettings()
            );
        } else {
            throw new RuntimeException("SDK selection panel is not initialized.");
        }
    }
}
