package com.amazonaws.intellij.ui.credentials;

import javax.swing.JComponent;
import javax.swing.JPanel;
import javax.swing.JTextField;

public class ProfileNameEditor {
    private JPanel panel;
    private JTextField profileNameInput;

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
