// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.iam;

import com.intellij.json.JsonLanguage;
import com.intellij.openapi.project.Project;
import com.intellij.ui.EditorTextField;
import com.intellij.ui.EditorTextFieldProvider;
import com.intellij.ui.IdeBorderFactory;
import com.intellij.util.ui.JBUI;

import java.awt.Insets;
import java.util.Collections;
import javax.swing.JPanel;
import javax.swing.JTextField;

import org.jetbrains.annotations.NotNull;
import software.aws.toolkits.resources.Localization;

public class CreateRolePanel {
    private final Project project;

    JTextField roleName;
    EditorTextField policyDocument;
    EditorTextField assumeRolePolicyDocument;
    JPanel component;

    public CreateRolePanel(@NotNull Project project) {
        this.project = project;
    }

    private void createUIComponents() {
        EditorTextFieldProvider textFieldProvider = EditorTextFieldProvider.getInstance();
        Insets insets = JBUI.emptyInsets();

        policyDocument = textFieldProvider.getEditorField(JsonLanguage.INSTANCE, project, Collections.emptyList());
        policyDocument.setBorder(IdeBorderFactory.createTitledBorder(Localization.message("iam.create.role.policy.editor.name"), false, insets));

        assumeRolePolicyDocument = textFieldProvider.getEditorField(JsonLanguage.INSTANCE, project, Collections.emptyList());
        assumeRolePolicyDocument.setBorder(IdeBorderFactory.createTitledBorder(Localization.message("iam.create.role.trust.editor.name"), false, insets));
    }
}
