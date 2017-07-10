package com.amazonaws.intellij.ui.options;

import com.amazonaws.intellij.credentials.CredentialProvider;
import com.amazonaws.intellij.credentials.CredentialProviderFactory;
import com.amazonaws.intellij.options.AWSOptionsProvider;
import com.intellij.openapi.options.Configurable;
import com.intellij.openapi.options.ConfigurationException;
import com.intellij.openapi.options.UnnamedConfigurable;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.ComboBox;
import com.intellij.ui.CollectionComboBoxModel;
import com.intellij.ui.IdeBorderFactory;
import com.intellij.ui.components.panels.Wrapper;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import javax.swing.JComponent;
import javax.swing.JPanel;
import org.jetbrains.annotations.Nls;
import org.jetbrains.annotations.Nullable;

public class AWSOptionsConfigurable implements Configurable, Configurable.NoScroll {
    private final AWSOptionsProvider optionsProvider;
    private JPanel credentialsPanel;
    private ComboBox<CredentialProvider> credentialTypeSelector;
    private Wrapper credentialOptions;
    private JPanel settingsPanel;
    private CredentialProvider currentCredentialProvider;
    private UnnamedConfigurable credentialOptionsConfigurable;

    public AWSOptionsConfigurable(Project project) {
        optionsProvider = AWSOptionsProvider.getInstance(project);
        credentialsPanel.setBorder(IdeBorderFactory.createTitledBorder("AWS Credentials"));

        credentialTypeSelector.addActionListener(evt -> {
            CredentialProvider selectedCredentialType = (CredentialProvider) credentialTypeSelector.getSelectedItem();
            if (selectedCredentialType != currentCredentialProvider) {
                currentCredentialProvider = selectedCredentialType;
                updateCredentialOptions();
            }
        });

        reset();
    }

    private void updateCredentialOptions() {
        credentialOptionsConfigurable = currentCredentialProvider.getConfigurable();
        if (credentialOptionsConfigurable != null) {
            credentialOptions.setContent(credentialOptionsConfigurable.createComponent());
        } else {
            credentialOptions.removeAll();
        }
    }

    @Nullable
    @Override
    public JComponent createComponent() {
        return settingsPanel;
    }

    @Override
    public boolean isModified() {
        if (optionsProvider.getCredentialProvider().getClass() != currentCredentialProvider.getClass()) {
            return true;
        }

        if (credentialOptionsConfigurable != null && credentialOptionsConfigurable.isModified()) {
            return true;
        }
        return false;
    }

    @Override
    public void apply() throws ConfigurationException {
        if (credentialOptionsConfigurable != null) {
            credentialOptionsConfigurable.apply();
        }
        optionsProvider.setCredentialProvider(currentCredentialProvider);
    }

    @Override
    public void reset() {
        // Re-make the model since it is stateful
        List<CredentialProvider> credentialProviders = Stream.of(CredentialProviderFactory.credentialProviderTypes())
                                                             .map(CredentialProviderFactory::createProvider)
                                                             .collect(Collectors.toList());

        CollectionComboBoxModel<CredentialProvider> model = new CollectionComboBoxModel<>(credentialProviders);
        model.setSelectedItem(optionsProvider.getCredentialProvider());
        credentialTypeSelector.setModel(model);

        currentCredentialProvider = optionsProvider.getCredentialProvider();
        updateCredentialOptions();
    }

    @Nls
    @Override
    public String getDisplayName() {
        return "AWS";
    }
}
