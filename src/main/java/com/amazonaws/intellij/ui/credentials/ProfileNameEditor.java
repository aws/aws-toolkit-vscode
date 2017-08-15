package com.amazonaws.intellij.ui.credentials;

import com.intellij.ui.components.JBTextField;
import javax.swing.JComponent;
import javax.swing.JPanel;

public class ProfileNameEditor {
    private JPanel panel;
    private JBTextField profileNameInput;

    public ProfileNameEditor(String value) {
        profileNameInput.setText(value);
    }

    public String getValue() {
        return profileNameInput.getText();
    }

    public JComponent getPanel() {
        return panel;
    }

    public JComponent getInput() {
        return profileNameInput;
    }
}
