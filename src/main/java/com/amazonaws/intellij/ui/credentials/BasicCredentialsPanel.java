package com.amazonaws.intellij.ui.credentials;

import com.amazonaws.intellij.credentials.BasicCredentialProvider;
import com.intellij.openapi.options.ConfigurationException;
import com.intellij.openapi.options.UnnamedConfigurable;
import com.intellij.ui.components.JBPasswordField;
import java.util.Arrays;
import java.util.Objects;
import javax.swing.JComponent;
import javax.swing.JPanel;
import javax.swing.JTextField;
import org.jetbrains.annotations.Nullable;

public class BasicCredentialsPanel implements UnnamedConfigurable {
    private final BasicCredentialProvider credentialProvider;
    private JPanel component;
    private JTextField accessKeyInput;
    private JBPasswordField secretKeyInput;

    public BasicCredentialsPanel(BasicCredentialProvider credentialProvider) {
        this.credentialProvider = credentialProvider;

        this.accessKeyInput.setText(credentialProvider.getAccessKey());
        this.secretKeyInput.setPasswordIsStored(credentialProvider.getSecretKey().length() > 0);
    }

    @Nullable
    @Override
    public JComponent createComponent() {
        return component;
    }

    @Override
    public boolean isModified() {
        if (!Objects.equals(accessKeyInput.getText(), credentialProvider.getAccessKey())) {
            return true;
        }

        return !Arrays.equals(secretKeyInput.getPassword(),
                              credentialProvider.getSecretKey().toCharArray());
    }

    @Override
    public void apply() throws ConfigurationException {
        credentialProvider.setAccessKey(accessKeyInput.getText());
        credentialProvider.setSecretKey(new String(secretKeyInput.getPassword()));
    }

    @Override
    public void reset() {
        accessKeyInput.setText(credentialProvider.getAccessKey());
        secretKeyInput.setText(credentialProvider.getSecretKey());
    }
}
